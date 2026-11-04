import { useMemo, useState } from "react";

import Button from "~/components/button";
import Check from "~/components/check";
import DocumentPreview from "~/components/document-preview";
import Empty from "~/components/empty";
import EvidenceFields from "~/components/evidence-fields";
import Field from "~/components/field";
import GanttChart from "~/components/gantt-chart";
import Notice from "~/components/notice";
import Table from "~/components/table";
import { dateTime, documentNames, sourceLocation, useWorkspaceAction } from "~/lib/api/workspace";
import type { Evidence, Job, Plan, PlanLine, WorkDocument } from "~/lib/api/workspace";

import DailyPlan from "./daily-plan";
import { getGanttData } from "./gantt-tasks";
import { applyPlanCandidate, getDocumentSchedule, getPlanCandidates } from "./plan-candidates";

interface ProductionPlanProps {
  job: Job;
  plans: Plan[];
  documents: WorkDocument[];
  canEdit: boolean;
}
const kstInput = (value: string) =>
  value ? new Date(new Date(value).getTime() + 9 * 3600000).toISOString().slice(0, 16) : "";
const candidateText = (value: unknown) => (typeof value === "string" || typeof value === "number" ? String(value) : "");
const ProductionPlan = ({ job, plans, documents, canEdit }: ProductionPlanProps) => {
  const incomingPending = Object.values(job.targets).some(
    (target) =>
      target.kind === "material" &&
      target.condition.startsWith("구매") &&
      !["passed", "partial"].includes(target.status),
  );
  const [editing, setEditing] = useState(false);
  const [version, setVersion] = useState(job.plan_version);
  const [track, setTrack] = useState("");
  const [preview, setPreview] = useState<WorkDocument | null>(null);
  const plan = plans.find((candidate) => candidate.version === version);
  const draft = getDocumentSchedule(getPlanCandidates(job, documents));
  const daily = editing
    ? draft.entries.length > 0
    : !!plan?.data.schedule?.length || (!plan && draft.entries.length > 0);
  const lines = useMemo(() => plan?.data.lines.filter((line) => !track || line.track === track) ?? [], [plan, track]);
  const gantt = useMemo(() => getGanttData(lines, plan?.data.lines), [lines, plan?.data.lines]);
  return (
    <div className="grid gap-5">
      {incomingPending && <Notice>③ 구매 부품의 수입검사를 모두 승인한 뒤 ④ 생산계획을 확정할 수 있습니다.</Notice>}
      <div className="flex flex-wrap items-end gap-3">
        <Field label="계획 버전" className="min-w-40">
          <select value={version} onChange={(event) => setVersion(Number(event.target.value))}>
            <option value={0}>미확정</option>
            {plans.map((candidate) => (
              <option key={candidate.id} value={candidate.version}>
                v{candidate.version} · {dateTime(candidate.created_at)}
              </option>
            ))}
          </select>
        </Field>
        {!daily && (
          <Field label="트랙 필터" className="min-w-40">
            <select value={track} onChange={(event) => setTrack(event.target.value)}>
              <option value="">전체 트랙</option>
              {[...new Set(plan?.data.lines.map((line) => line.track) ?? [])].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </Field>
        )}
        {canEdit && !incomingPending && (
          <Button variant="primary" onClick={() => setEditing(!editing)}>
            {editing ? "계획 조회로 돌아가기" : `새 계획 v${job.plan_version + 1} 확인`}
          </Button>
        )}
      </div>
      {editing && daily ? (
        <>
          {draft.warnings.map((warning) => (
            <Notice key={warning}>{warning}</Notice>
          ))}
          <DailyPlan
            schedule={draft.entries}
            documents={documents}
            job={job}
            suggestedQuantity={draft.quantity}
            onDone={() => {
              setEditing(false);
              setVersion(job.plan_version + 1);
            }}
          />
        </>
      ) : editing ? (
        <PlanEditor
          job={job}
          documents={documents}
          previous={plans.at(-1)}
          onDone={() => {
            setEditing(false);
            setVersion(job.plan_version + 1);
          }}
        />
      ) : plan?.data.schedule?.length ? (
        <>
          <Notice>
            계획 v{plan.version} · {plan.data.reason} · 문서 기준 일 단위 확정 계획입니다.
          </Notice>
          {plan.data.warnings.map((warning) => (
            <Notice key={warning}>{warning}</Notice>
          ))}
          <DailyPlan schedule={plan.data.schedule} documents={documents} />
        </>
      ) : !plan && draft.entries.length > 0 ? (
        <>
          <Notice>
            생산계획서 기준 초안 · {draft.entries.filter((entry) => entry.kind === "operation").length}개 공정의 일정과
            작업자 배정을 연결했습니다. 새 계획 확인에서 원문을 대조한 후 확정하세요.
          </Notice>
          {draft.warnings.map((warning) => (
            <Notice key={warning}>{warning}</Notice>
          ))}
          <DailyPlan schedule={draft.entries} documents={documents} />
        </>
      ) : !plan ? (
        <Empty title="생산 전 계획을 확정해 주세요">
          생산계획서의 수량과 일정이 확인되면 Gantt로 조회할 수 있습니다.
        </Empty>
      ) : (
        <>
          <Notice>
            계획 v{plan.version} · {plan.data.reason} · 예상·표준시간과 배정 일정입니다. 실제 생산 완료는 담당자의 수량
            확인으로 별도 기록합니다.
          </Notice>
          {plan.data.warnings.map((warning) => (
            <Notice key={warning}>{warning}</Notice>
          ))}
          {lines.length > 0 ? (
            <GanttChart
              tasks={gantt.tasks}
              unit="hour"
              label="시간 단위 생산계획 Gantt (KST)"
              onSelect={(id) => {
                const line = lines[Number(id) - 1];
                const doc = documents.find(
                  (candidate) =>
                    candidate.kind === "production_plan" &&
                    line?.sources.some((source) => source.document_id === candidate.id),
                );
                if (doc) setPreview(doc);
              }}
            />
          ) : (
            <Notice>선택한 트랙에 일정이 없습니다.</Notice>
          )}
          <Table headings={["대상·공정", "트랙·배정", "계획 수량", "시간 기준", "시작·종료 (KST)", "원문"]}>
            {lines.map((line, index) => (
              <tr key={`${line.target_id}:${index}`}>
                <td>
                  {job.targets[line.target_id]?.name ?? line.target_id}
                  <p className="text-muted text-xs">{line.process}</p>
                </td>
                <td>
                  {line.track}
                  <p className="text-muted text-xs">{line.resource}</p>
                </td>
                <td>
                  {line.quantity}
                  {line.unit}
                </td>
                <td>
                  {line.duration}
                  {line.duration_unit === "hour" ? "시간" : "분"} /{" "}
                  {{ per_item: "개당", batch: "배치", setup: "준비시간" }[line.time_basis]}
                </td>
                <td className="text-xs whitespace-nowrap">
                  {dateTime(line.start)}
                  <br />
                  {dateTime(line.end)}
                </td>
                <td>
                  {line.sources.map((source, index) => (
                    <button
                      key={index}
                      className="text-accent block py-1 text-xs"
                      onClick={() => {
                        const doc = documents.find((candidate) => candidate.id === source.document_id);
                        if (doc) setPreview(doc);
                      }}
                    >
                      {sourceLocation(source)} · {source.row} ↗
                    </button>
                  ))}
                </td>
              </tr>
            ))}
          </Table>
        </>
      )}
      {preview && <DocumentPreview document={preview} onClose={() => setPreview(null)} />}
    </div>
  );
};

interface PlanEditorProps {
  job: Job;
  documents: WorkDocument[];
  previous?: Plan;
  onDone: () => void;
}
const PlanEditor = ({ job, documents, previous, onDone }: PlanEditorProps) => {
  const [quantity, setQuantity] = useState(job.quantity);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [candidatesLoaded, setCandidatesLoaded] = useState(false);
  const [lines, setLines] = useState<PlanLine[]>(() =>
    Object.values(job.targets)
      .filter((target) => target.kind !== "material")
      .flatMap((target) => {
        const oldLines = previous?.data.lines.filter((line) => line.target_id === target.id) ?? [];
        return (oldLines.length ? oldLines : [undefined]).map((old) => ({
          target_id: target.id,
          process: old?.process ?? "",
          track: old?.track ?? "",
          quantity: target.quantity,
          unit: target.unit,
          duration: old?.duration ?? 0,
          duration_unit: old?.duration_unit ?? "minute",
          time_basis: old?.time_basis ?? "batch",
          resource: old?.resource ?? "",
          start: old?.start ?? "",
          end: old?.end ?? "",
          predecessors: old?.predecessors ?? [],
          sources: [],
        }));
      }),
  );
  const action = useWorkspaceAction();
  const eligible = documents.filter(
    (doc) => doc.scope.plan_version === job.plan_version + 1 && doc.scope.specification_id === job.specification_id,
  );
  const candidates = getPlanCandidates(job, documents);
  const updateLine = (index: number, change: Partial<PlanLine>) => {
    setLines(lines.map((line, i) => (i === index ? { ...line, ...change } : line)));
    setConfirmed(false);
  };
  const setSource = (index: number, kind: string, source: Evidence) =>
    updateLine(index, {
      sources: [
        ...lines[index].sources.filter(
          (existing) => !eligible.some((doc) => doc.id === existing.document_id && doc.kind === kind),
        ),
        source,
      ],
    });
  const loadCandidates = () => {
    setCandidatesLoaded(true);
    const loaded = candidates.flatMap((candidate) => {
      const targetId = candidate.row.target_id;
      if (typeof targetId !== "string" || !candidate.document.scope.target_ids.includes(targetId)) return [];
      const line =
        lines.find((current) => current.target_id === targetId && current.process === candidate.row.process) ??
        lines.find((current) => current.target_id === targetId);
      return line ? [applyPlanCandidate(line, candidate)] : [];
    });
    if (loaded.length) {
      setLines([
        ...lines.filter((line) => !loaded.some((candidate) => candidate.target_id === line.target_id)),
        ...loaded,
      ]);
      setConfirmed(false);
    }
  };
  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        action.mutate(
          {
            path: `/jobs/${job.id}/plans`,
            body: { revision: job.revision, quantity, reason, lines, confirmed, acknowledged_warnings: acknowledged },
          },
          { onSuccess: onDone },
        );
      }}
    >
      <Button onClick={loadCandidates}>생산계획서 추출 후보 불러오기</Button>
      {candidatesLoaded && (
        <Notice>
          {candidates.length
            ? `${candidates.length}개 후보를 불러왔습니다. 각 공정에서 적용할 원문 행을 선택하세요. 날짜만 있는 일정의 시작·종료 시각과 표준시간은 원문을 확인해 직접 입력하세요.`
            : `불러올 후보가 없습니다. 문서 탭에서 계획 v${job.plan_version + 1}에 생산계획서를 연결하고 후보 추출을 완료해 주세요.`}
        </Notice>
      )}
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <Field label="완제품 목표 수량">
          <input
            type="number"
            min="1"
            step="1"
            required
            value={quantity}
            onChange={(event) => {
              const next = Number(event.target.value);
              setQuantity(next);
              setLines(
                lines.map((line) => ({
                  ...line,
                  quantity: (job.targets[line.target_id].quantity * next) / job.quantity,
                })),
              );
              setConfirmed(false);
            }}
          />
        </Field>
        <Field label="계획 확정·변경 사유">
          <input required value={reason} onChange={(event) => setReason(event.target.value)} maxLength={2000} />
        </Field>
      </div>
      {lines.map((line, index) => (
        <section key={`${line.target_id}:${index}`} className="border-line grid gap-4 rounded-lg border p-4">
          <h3 className="font-semibold">
            {job.targets[line.target_id].name} v{job.targets[line.target_id].version} · {line.quantity}
            {line.unit}
          </h3>
          {candidatesLoaded && candidates.length > 0 && (
            <Field label="추출 후보 적용">
              <select
                value=""
                onChange={(event) =>
                  updateLine(index, applyPlanCandidate(line, candidates[Number(event.target.value)]))
                }
              >
                <option value="" disabled>
                  이 공정에 적용할 원문 행 선택
                </option>
                {candidates.map(
                  ({ document, row }, candidateIndex) =>
                    document.scope.target_ids.includes(line.target_id) &&
                    (!row.target_id || row.target_id === line.target_id) && (
                      <option key={candidateIndex} value={candidateIndex}>
                        {document.filename} · {candidateText(row.section_title)} ·{" "}
                        {candidateText(row.process ?? row["품목"] ?? row.name ?? row.process_codes)} ·{" "}
                        {candidateText(row.start_date ?? row.raw_time_range)} · {candidateText(row.end_date)} ·{" "}
                        {sourceLocation({
                          page: row.page == null ? null : Number(row.page),
                          block_index: row.block_index == null ? null : Number(row.block_index),
                        })}{" "}
                        · {candidateText(row.row)}행
                      </option>
                    ),
                )}
              </select>
            </Field>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="공정번호·공정">
              <input
                required
                value={line.process}
                onChange={(event) => updateLine(index, { process: event.target.value })}
              />
            </Field>
            <Field label="트랙">
              <input
                required
                value={line.track}
                onChange={(event) => updateLine(index, { track: event.target.value })}
              />
            </Field>
            <Field label="담당자·설비">
              <input
                required
                value={line.resource}
                onChange={(event) => updateLine(index, { resource: event.target.value })}
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="예상·표준시간">
              <input
                type="number"
                min="0.000001"
                step="any"
                required
                value={line.duration || ""}
                onChange={(event) => updateLine(index, { duration: Number(event.target.value) })}
              />
            </Field>
            <Field label="시간 단위">
              <select
                value={line.duration_unit}
                onChange={(event) =>
                  updateLine(index, { duration_unit: event.target.value as PlanLine["duration_unit"] })
                }
              >
                <option value="minute">분</option>
                <option value="hour">시간</option>
              </select>
            </Field>
            <Field label="계산 기준">
              <select
                value={line.time_basis}
                onChange={(event) => updateLine(index, { time_basis: event.target.value as PlanLine["time_basis"] })}
              >
                <option value="batch">배치 전체</option>
                <option value="per_item">개당</option>
                <option value="setup">준비시간</option>
              </select>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="계획 시작 (KST)">
              <input
                type="datetime-local"
                required
                value={kstInput(line.start)}
                onChange={(event) =>
                  updateLine(index, { start: event.target.value ? `${event.target.value}:00+09:00` : "" })
                }
              />
            </Field>
            <Field label="계획 종료 (KST)">
              <input
                type="datetime-local"
                required
                value={kstInput(line.end)}
                onChange={(event) =>
                  updateLine(index, { end: event.target.value ? `${event.target.value}:00+09:00` : "" })
                }
              />
            </Field>
          </div>
          <Field label="문서에 명시된 선행 작업 (여러 개 선택)">
            <select
              multiple
              value={line.predecessors}
              onChange={(event) =>
                updateLine(index, { predecessors: Array.from(event.target.selectedOptions, (option) => option.value) })
              }
            >
              {lines
                .filter((candidate) => candidate.target_id !== line.target_id)
                .map((candidate) => (
                  <option key={candidate.target_id} value={candidate.target_id}>
                    {job.targets[candidate.target_id].name}
                  </option>
                ))}
            </select>
          </Field>
          {["production_plan"].map((kind) => (
            <div key={kind} className="border-line grid gap-2 border-t pt-3">
              <p className="text-sm font-medium">{documentNames[kind]}</p>
              <EvidenceFields
                value={
                  line.sources.find((source) =>
                    eligible.some((doc) => doc.id === source.document_id && doc.kind === kind),
                  ) ?? null
                }
                documents={eligible.filter((doc) => doc.kind === kind && doc.scope.target_ids.includes(line.target_id))}
                onChange={(source) => setSource(index, kind, source)}
              />
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                setLines([
                  ...lines,
                  { ...line, process: "", track: "", resource: "", start: "", end: "", predecessors: [], sources: [] },
                ]);
                setConfirmed(false);
              }}
            >
              ＋ 이 대상의 공정 추가
            </Button>
            {lines.filter((candidate) => candidate.target_id === line.target_id).length > 1 && (
              <Button
                variant="ghost"
                onClick={() => {
                  setLines(lines.filter((_, i) => i !== index));
                  setConfirmed(false);
                }}
              >
                이 공정 삭제
              </Button>
            )}
          </div>
        </section>
      ))}
      <Check checked={acknowledged} onChange={setAcknowledged}>
        자원 중복·명시된 선행 작업 역전이 있으면 원문을 대조하고 확인했습니다.
      </Check>
      <Check checked={confirmed} onChange={setConfirmed}>
        생산계획서의 대상·버전·수량·시간 기준·배정을 원문과 대조했습니다.
      </Check>
      {action.error && <Notice error={action.error} />}
      <Button type="submit" variant="primary" disabled={action.isPending || !confirmed}>
        {action.isPending ? "검증·확정 중…" : `계획 v${job.plan_version + 1} 확정`}
      </Button>
    </form>
  );
};

export default ProductionPlan;
