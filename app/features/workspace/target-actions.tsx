import { useEffect, useState } from "react";

import Button from "~/components/button";
import Check from "~/components/check";
import EvidenceFields from "~/components/evidence-fields";
import Field from "~/components/field";
import Notice from "~/components/notice";
import { documentNames, getProcessCountCandidates, inspectionKinds, useWorkspaceAction } from "~/lib/api/workspace";
import type {
  CurrentUser,
  Evidence,
  Job,
  Specification,
  Target,
  WorkDocument,
  WorkflowEvent,
} from "~/lib/api/workspace";

import { getInspectionCandidates } from "./inspection-candidates";
import TaskGuide from "./task-guide";
import { getTargetTask } from "./workflow-guidance";

interface TargetActionsProps {
  job: Job;
  target: Target;
  user: CurrentUser;
  documents: WorkDocument[];
  specifications: Specification[];
  events: WorkflowEvent[];
  mode: string;
  onNavigate?: (tab: string, targetId?: string, kind?: string) => void;
}
const TargetActions = ({
  job,
  target,
  user,
  documents,
  specifications,
  events,
  mode,
  onNavigate,
}: TargetActionsProps) => {
  const inspectionCandidates = mode === "quality" ? getInspectionCandidates(job, target, documents) : [];
  const [inspectionKey, setInspectionKey] = useState<string | null>(null);
  const inspectionCandidate =
    inspectionKey === null
      ? inspectionCandidates[0]
      : inspectionCandidates.find((candidate) => candidate.key === inspectionKey);
  const [inspectionEdits, setInspectionEdits] = useState<
    Partial<{
      standard: string;
      criterion: string;
      measured_value: string;
      unit: string;
      grade: string;
    }>
  >({});
  const inspection = {
    standard: "",
    criterion: "",
    measured_value: "",
    unit: "",
    grade: "",
    ...inspectionCandidate?.values,
    ...inspectionEdits,
  };
  const [goodQuantity, setGoodQuantity] = useState<string | null>(null);
  const [defectQuantity, setDefectQuantity] = useState<string | null>(null);
  const [countIndex, setCountIndex] = useState("");
  const [quantity, setQuantity] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [resultEdit, setResult] = useState<string | null>(null);
  const result = resultEdit ?? inspectionCandidate?.result ?? "pass";
  const [cause, setCause] = useState(target.issue?.cause ?? "physical");
  const [reason, setReason] = useState("");
  const [newSpec, setNewSpec] = useState("");
  const [sourceEdits, setSources] = useState<Evidence[] | null>(null);
  const sources = sourceEdits ?? (mode === "quality" && inspectionCandidate ? inspectionCandidate.sources : []);
  const [supplements, setSupplements] = useState<string[]>([]);
  const action = useWorkspaceAction();
  const task = onNavigate ? getTargetTask(job, target, documents) : null;
  const guidance = task && onNavigate && (
    <details className="text-sm">
      <summary>작업 안내 · 담당 부서와 진행 방법</summary>
      <div className="mt-3">
        <TaskGuide task={task} user={user} onNavigate={onNavigate} />
      </div>
    </details>
  );
  const candidateContent = JSON.stringify(inspectionCandidate);
  useEffect(() => setConfirmed(false), [candidateContent]);
  const selectInspection = (key: string) => {
    setInspectionKey(key);
    setInspectionEdits({});
    setSources(null);
    setResult(null);
    setGoodQuantity(null);
    setDefectQuantity(null);
    setConfirmed(false);
  };
  const editInspection = (field: keyof typeof inspection, value: string) => {
    setInspectionEdits({ ...inspectionEdits, [field]: value });
    setConfirmed(false);
  };
  const department = user.department?.code;
  const material = target.kind === "material";
  const docs = documents.filter(
    (doc) =>
      doc.scope.target_ids.includes(target.id) &&
      (doc.scope.round === target.round || doc.kind.startsWith("work_instruction_")) &&
      doc.scope.plan_version === target.plan_version &&
      doc.scope.specification_id === job.specification_id,
  );
  const countCandidates = getProcessCountCandidates(target, docs);
  const countPicker = target.process_code && (
    <Field label="원문 투입·양품·불량 실적 행">
      <select
        required
        value={countIndex}
        onChange={(event) => {
          const candidate = event.target.value === "" ? undefined : countCandidates[Number(event.target.value)];
          setCountIndex(event.target.value);
          setSources(candidate && event.target.value !== "" ? [candidate.source] : []);
          setQuantity(candidate ? String(candidate.input) : "");
          setGoodQuantity(candidate ? String(candidate.good) : "");
          setDefectQuantity(candidate ? String(candidate.defect) : "");
          setConfirmed(false);
        }}
      >
        <option value="">원문 실적 선택</option>
        {countCandidates.map((candidate, index) => (
          <option key={index} value={index}>
            {candidate.label}
          </option>
        ))}
      </select>
    </Field>
  );
  const requiredKinds = [inspectionKinds[target.kind]];
  const completion = events.find((event) => event.id === target.completion_id);
  const canInspect = department === "quality_assurance" && target.status === (material ? "waiting" : "inspection");
  const responsible = {
    physical: "production_management",
    specification: "research_and_development",
    evidence: "quality_assurance",
  }[cause];
  const send = (endpoint: string, body: Record<string, unknown> = {}) =>
    action.mutate({
      path: `/jobs/${job.id}/${endpoint}`,
      body: { revision: job.revision, target_id: target.id, ...body },
    });
  if (target.inventory_of)
    return (
      <div className="grid gap-4">
        <Notice>
          가공 부품 재고 · 해당 공정의 승인 실적에서 집계합니다.
          <br />
          양품 {target.good_quantity ?? 0} / 불량 격리 {target.defect_quantity ?? 0} / 잔여{" "}
          {target.remaining_quantity ?? 0} {target.unit}
        </Notice>
        {guidance}
      </div>
    );
  return (
    <div className="grid gap-4">
      {target.good_quantity !== undefined && (
        <Notice tone="success">
          투입 {target.input_quantity} · 양품 {target.good_quantity} · 불량 격리 {target.defect_quantity} {target.unit}
          {Object.entries(target.remaining_by_output ?? {}).map(([name, amount]) => (
            <p key={name}>
              {name} 잔여 양품: {amount} {target.unit}
            </p>
          ))}
        </Notice>
      )}
      {guidance}
      {target.waiting_reasons.length > 0 && (
        <details className="text-muted text-xs">
          <summary>현재 대기 사유 상세</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {target.waiting_reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </details>
      )}
      {target.recheck_reason && <Notice>재확인 사유: {target.recheck_reason}</Notice>}
      {target.issue && (
        <Notice tone="error">
          전체 보류 · {target.issue.reason}
          <br />
          담당: {{ physical: "생산관리", specification: "R&D", evidence: "증빙 업로드 부서" }[target.issue.cause]}
        </Notice>
      )}
      {completion && (
        <Notice tone="success">
          생산 완료 {String(completion.data.quantity)} {String(completion.data.unit)} · 계획 v
          {String(completion.data.plan_version)} · {completion.actor_name}
          <br />
          {new Date(completion.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
        </Notice>
      )}
      {mode === "production" && !material && department === "production_management" && (
        <>
          {target.status === "waiting" && (
            <Button
              variant="primary"
              disabled={action.isPending || !!target.waiting_reasons.length}
              onClick={() => send("start")}
            >
              생산 착수
            </Button>
          )}
          {target.status === "producing" && (
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                send("complete", { quantity: Number(quantity), unit: target.unit, sources, confirmed });
              }}
            >
              {countPicker}
              <Field
                label={`${target.process_code ? "실제 투입" : "완료"} 수량 (${target.unit})`}
                hint={
                  target.process_code
                    ? `계획 ${target.quantity}${target.unit} 이내의 원문 투입량을 기록합니다. 양품·불량은 품질 단계에서 확인합니다.`
                    : `적용 계획 v${target.plan_version} · 계획 수량 ${target.quantity}${target.unit}. 부족·초과 모두 검사로 넘어갈 수 없습니다.`
                }
              >
                <input
                  type="number"
                  min="0.000001"
                  step="any"
                  value={quantity}
                  onChange={(event) => {
                    setQuantity(event.target.value);
                    setConfirmed(false);
                  }}
                  required
                />
              </Field>
              <Check checked={confirmed} onChange={setConfirmed}>
                해당 대상의 실제 작업을 마쳤고 완료 수량을 확인했습니다.
              </Check>
              <Button type="submit" variant="primary" disabled={action.isPending || !confirmed}>
                수량 확인·생산 완료
              </Button>
            </form>
          )}
        </>
      )}
      {mode === "quality" && canInspect && (
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            send("inspect", {
              result,
              ...(target.process_code
                ? {
                    good_quantity: Number(goodQuantity ?? inspectionCandidate?.count?.good),
                    defect_quantity: Number(defectQuantity ?? inspectionCandidate?.count?.defect),
                  }
                : {}),
              criterion: form.get("criterion"),
              standard: form.get("standard"),
              measured_value: form.get("measured_value"),
              unit: form.get("unit"),
              grade: form.get("grade") ?? "",
              sources,
              confirmed,
              cause: result === "fail" ? cause : null,
              reason: result === "fail" ? reason : "",
            });
          }}
        >
          {inspectionCandidates.length > 0 && (
            <>
              <Field label="검사성적서 추출 행">
                <select
                  value={inspectionCandidate?.key ?? ""}
                  onChange={(event) => selectInspection(event.target.value)}
                >
                  <option value="">원문 검사 행 선택</option>
                  {inspectionCandidates.map((candidate) => (
                    <option key={candidate.key} value={candidate.key}>
                      {candidate.label}
                    </option>
                  ))}
                </select>
              </Field>
              <p className="text-muted text-xs">
                {inspectionCandidate
                  ? `${inspectionCandidates.length}개 검사 행 중 선택된 행의 내용과 근거 위치를 입력했습니다. 다른 항목도 원문과 대조한 뒤 판정을 확인해 주세요.`
                  : "적용할 행을 선택하면 내용과 근거 위치가 입력됩니다."}
              </p>
              {inspectionCandidate && (!inspection.standard || !inspection.criterion) && (
                <p className="text-muted text-xs">
                  원문에서 기준을 확인하지 못했습니다. 연결한 문서의 추출 내용을 확인해 주세요.
                </p>
              )}
            </>
          )}
          {!inspectionCandidates.length && (
            <Notice>
              {docs.some((doc) => doc.kind === inspectionKinds[target.kind] && doc.candidates.status === "ready")
                ? "검사성적서에서 현재 품목·공정과 일치하는 행을 찾지 못했습니다. 문서의 연결 대상과 원문을 확인해 주세요."
                : "현재 대상·회차·계획의 검사성적서를 연결하고 추출하면 원문 내용이 자동 입력됩니다."}
            </Notice>
          )}
          {(target.process_code || inspectionCandidate?.count) && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="양품 수량" hint={inspectionCandidate?.count?.unit || "원문 단위 기준"}>
                <input
                  type="number"
                  min="0"
                  step="any"
                  required={!!target.process_code}
                  readOnly={!target.process_code}
                  value={goodQuantity ?? inspectionCandidate?.count?.good ?? ""}
                  onChange={(event) => {
                    setGoodQuantity(event.target.value);
                    setConfirmed(false);
                  }}
                />
              </Field>
              <Field label="불량 격리 수량" hint={inspectionCandidate?.count?.unit || "원문 단위 기준"}>
                <input
                  type="number"
                  min="0"
                  step="any"
                  required={!!target.process_code}
                  readOnly={!target.process_code}
                  value={defectQuantity ?? inspectionCandidate?.count?.defect ?? ""}
                  onChange={(event) => {
                    setDefectQuantity(event.target.value);
                    setConfirmed(false);
                  }}
                />
              </Field>
            </div>
          )}
          <Field label="근거 문서·버전 / 적용 시험 기준">
            <input
              name="standard"
              required
              maxLength={200}
              placeholder="원문의 문서번호·버전 또는 시험 기준"
              value={inspection.standard}
              onChange={(event) => editInspection("standard", event.target.value)}
            />
          </Field>
          <Field label="판정 기준·허용 범위 / 원문 확인 내용">
            <textarea
              name="criterion"
              required
              maxLength={2000}
              placeholder="원문의 허용 기준·확인 내용·양품 처리 원칙"
              value={inspection.criterion}
              onChange={(event) => editInspection("criterion", event.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="시험 결과·측정값">
              <input
                name="measured_value"
                required
                maxLength={200}
                value={inspection.measured_value}
                onChange={(event) => editInspection("measured_value", event.target.value)}
              />
            </Field>
            <Field label="결과 단위">
              <input
                name="unit"
                maxLength={30}
                placeholder="원문에 별도 단위 기재 없음"
                value={inspection.unit}
                onChange={(event) => editInspection("unit", event.target.value)}
              />
            </Field>
          </div>
          <Field label="확인 등급 (문서에 있는 경우)">
            <input
              name="grade"
              maxLength={100}
              placeholder="문서에 기재된 등급 없음"
              value={inspection.grade}
              onChange={(event) => editInspection("grade", event.target.value)}
            />
          </Field>
          {!target.process_code &&
            requiredKinds.map((kind) => (
              <div key={kind} className="border-line grid gap-2 border-t pt-3">
                <p className="text-sm font-medium">{documentNames[kind]}</p>
                <EvidenceFields
                  documents={docs.filter((doc) => doc.kind === kind)}
                  value={
                    sources.find((source) => docs.some((doc) => doc.id === source.document_id && doc.kind === kind)) ??
                    null
                  }
                  onChange={(source) => {
                    setSources([
                      ...sources.filter(
                        (existing) => !docs.some((doc) => doc.id === existing.document_id && doc.kind === kind),
                      ),
                      source,
                    ]);
                    setConfirmed(false);
                  }}
                />
              </div>
            ))}
          <Field label={target.process_code ? "양품 승인·보류 판정" : "검사 단위 전체 판정"}>
            <select
              value={result}
              onChange={(event) => {
                setResult(event.target.value);
                setConfirmed(false);
              }}
            >
              <option value="pass">{target.process_code ? "양품 승인 · 불량은 격리" : "합격"}</option>
              <option value="fail">불합격 · 전체 보류</option>
            </select>
          </Field>
          {result === "fail" && (
            <>
              <Field label="불합격 원인">
                <select value={cause} onChange={(event) => setCause(event.target.value)}>
                  <option value="physical">재료·제작 불량 → 생산관리</option>
                  <option value="specification">사양·구성 오류 → R&D</option>
                  <option value="evidence">증빙 누락·오첨부 → 업로드 부서</option>
                </select>
              </Field>
              <Field label="불합격·보완 사유">
                <textarea
                  required
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={2000}
                />
              </Field>
            </>
          )}
          <Check checked={confirmed} onChange={setConfirmed}>
            대상·버전·회차·증빙 범위·기준·결과를 원문과 대조했습니다.
          </Check>
          <Button
            type="submit"
            variant={result === "fail" ? "danger" : "primary"}
            disabled={action.isPending || !confirmed}
          >
            {target.process_code && result === "pass"
              ? "양품 승인·불량 격리 확인"
              : `검사 단위 전체 ${result === "pass" ? "합격" : "불합격"} 확인`}
          </Button>
        </form>
      )}
      {["held", "passed", "partial", "inspection", "producing"].includes(target.status) && (
        <details className="border-line rounded-lg border p-4">
          <summary className="text-sm font-medium">보완·교체·재작업 / 사양 변경</summary>
          <form
            className="mt-4 grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              send("rework", { cause, reason, specification_id: newSpec || null, document_ids: supplements });
            }}
          >
            <Field label="보완 원인">
              <select value={cause} disabled={!!target.issue} onChange={(event) => setCause(event.target.value)}>
                <option value="physical">실물 불량 · 생산관리</option>
                <option value="specification">사양 오류 · R&D</option>
                <option value="evidence">증빙 오류 · 업로드 부서</option>
              </select>
            </Field>
            <Field label="처리 내용·사유">
              <textarea required maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)} />
            </Field>
            {cause === "specification" && (
              <Field label="명시적으로 적용할 새 사양·BOM">
                <select required value={newSpec} onChange={(event) => setNewSpec(event.target.value)}>
                  <option value="">새 제출본 선택</option>
                  {specifications
                    .filter((spec) => spec.previous_id === job.specification_id && spec.status === "submitted")
                    .map((spec) => (
                      <option key={spec.id} value={spec.id}>
                        {spec.name} v{spec.version}
                      </option>
                    ))}
                </select>
              </Field>
            )}
            {cause === "evidence" && (
              <fieldset className="grid gap-2">
                <legend className="mb-2 text-sm font-medium">보충한 현재 회차 증빙</legend>
                {docs.map((doc) => (
                  <Check
                    key={doc.id}
                    checked={supplements.includes(doc.id)}
                    onChange={(checked) =>
                      setSupplements(checked ? [...supplements, doc.id] : supplements.filter((id) => id !== doc.id))
                    }
                  >
                    {doc.filename}
                  </Check>
                ))}
              </fieldset>
            )}
            <Notice>
              이 생산 건의 변경 대상과 영향받는 상위만 새 회차로 재확인합니다. 이전 완료·판정·계획은 보존됩니다.
            </Notice>
            <Button type="submit" disabled={action.isPending || department !== responsible}>
              담당 부서 보완 완료·재확인 요청
            </Button>
          </form>
        </details>
      )}
      {action.error && <Notice error={action.error} />}
      {mode === "quality" && !canInspect && target.status !== "held" && (
        <p className="text-muted text-sm">
          {["passed", "partial"].includes(target.status)
            ? "현재 회차의 승인된 양품만 다음 공정에서 사용할 수 있습니다."
            : material
              ? "품질 담당자가 해당 증빙을 확인해야 합니다."
              : "유효한 생산 완료 확인 후 품질 담당자가 판정할 수 있습니다."}
        </p>
      )}
    </div>
  );
};

export default TargetActions;
