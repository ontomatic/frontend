import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import Badge from "~/components/badge";
import Button from "~/components/button";
import DocumentPreview from "~/components/document-preview";
import ExtractionProgress from "~/components/extraction-progress";
import Field from "~/components/field";
import Notice from "~/components/notice";
import apiClient, { getErrorMessage } from "~/lib/api/client";
import { uploadFiles } from "~/lib/api/file";
import {
  departmentNames,
  documentNames,
  documentTargetKinds,
  kindsByDepartment,
  useWorkspaceAction,
} from "~/lib/api/workspace";
import type { CurrentUser, Job, WorkDocument } from "~/lib/api/workspace";

interface DocumentUploadProps {
  user: CurrentUser;
  documents: WorkDocument[];
  specificationId?: string;
  job?: Job;
  targetId?: string;
  initialKind?: string;
  onCandidate?: (doc: WorkDocument) => void;
}
const candidateLabels: Record<string, string> = {
  item_code: "품목코드",
  name: "품목명",
  field: "사양 항목",
  value: "원문값",
  unit: "단위",
  version: "원문 버전",
  quantity_per_product: "대당 수량",
  procurement: "조달·공급",
  description: "구성 상세",
  process_codes: "공정번호",
  process: "공정",
  start_date: "시작일",
  end_date: "종료일",
  working_days: "기간 (근무일)",
  raw_time_range: "원문 기간",
  workplace: "작업장",
  work_description: "작업 내용",
  input_output: "투입 → 산출",
  process_owner: "공정책임자",
  assignee: "담당자",
  assistants: "보조담당자",
  headcount: "인원",
  received_quantity: "입고 수량",
  input_quantity: "투입 수량",
  good_quantity: "양품 수량",
  defect_quantity: "불량 수량",
  raw_result: "원문 판정",
  criterion: "허용 기준",
  measured_value: "측정값",
  inspector: "검사자",
  inspection_field: "검사 항목",
  category: "분류",
  check_description: "확인 내용",
  sequence: "순서",
  note: "비고",
  page: "페이지",
  row: "행",
  block_index: "문단·표 블록",
  section_title: "소제목",
  document_number: "문서번호",
  target_id: "적용 대상",
  track: "트랙",
  quantity: "수량",
  duration: "시간",
  duration_unit: "시간 단위",
  time_basis: "계산 기준",
  resource: "담당자·설비",
  start: "시작",
  end: "종료",
  grade: "등급",
  standard: "시험 기준",
  result: "원문 결과",
};
const DocumentUpload = ({
  user,
  documents,
  specificationId,
  job,
  targetId,
  initialKind,
  onCandidate,
}: DocumentUploadProps) => {
  const department = user.department?.code ?? "";
  const kinds = kindsByDepartment[department] ?? [];
  const requestedDepartment = initialKind
    ? Object.keys(kindsByDepartment).find((code) => kindsByDepartment[code].includes(initialKind))
    : undefined;
  const differentDepartment = !!requestedDepartment && requestedDepartment !== department;
  const [kind, setKind] = useState(
    () =>
      (initialKind && kinds.includes(initialKind) ? initialKind : undefined) ??
      kinds.find(
        (value) =>
          targetId && job?.targets[targetId] && documentTargetKinds[value]?.includes(job.targets[targetId].kind),
      ) ??
      kinds[0] ??
      "",
  );
  const [preview, setPreview] = useState<WorkDocument | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [batch, setBatch] = useState(0);
  const [linkedIds, setLinkedIds] = useState<number[]>([]);
  const uploading = useRef(false);
  const queryClient = useQueryClient();
  const action = useWorkspaceAction();
  const automaticKind = !!job && department === "quality_assurance";
  const binding = (fileId: number) => {
    return {
      file_id: fileId,
      kind: automaticKind ? "auto" : kind,
      ...(specificationId
        ? { specification_id: specificationId }
        : {
            job_id: job?.id,
            ...(department === "production_management"
              ? {
                  plan_version:
                    kind.startsWith("work_instruction_") && job?.plan_version
                      ? job.plan_version
                      : (job?.plan_version ?? 0) + 1,
                }
              : {}),
          }),
    };
  };
  const isLinked = (fileId: number) => {
    const scope = binding(fileId);
    return documents.some(
      (doc) =>
        doc.file_id === fileId &&
        (automaticKind ? doc.department === department : doc.kind === kind) &&
        ("specification_id" in scope
          ? doc.specification_id === scope.specification_id && !doc.job_id
          : doc.job_id === scope.job_id &&
            doc.scope.specification_id === job?.specification_id &&
            (automaticKind
              ? doc.scope.target_ids.length > 0 &&
                doc.scope.target_ids.every(
                  (id) =>
                    job?.targets[id]?.round === doc.scope.round &&
                    job.targets[id].plan_version === doc.scope.plan_version,
                )
              : doc.scope.plan_version === scope.plan_version)),
    );
  };
  const upload = useMutation({
    mutationFn: async () => {
      const results = await uploadFiles(files, automaticKind ? "auto" : kind);
      return Promise.all(
        results.map(async (result) => {
          if (result.error) return result;
          try {
            await apiClient.post("/api/v1/workspace/documents", binding(result.fileId), { timeout: 120_000 });
            return result;
          } catch (error) {
            return { ...result, error: `문서 연결 실패 (원본 ID ${result.fileId}): ${getErrorMessage(error)}` };
          }
        }),
      );
    },
    onSuccess: () => {
      setFiles([]);
      setBatch((value) => value + 1);
      return queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
    onSettled: () => {
      uploading.current = false;
    },
  });
  const canUpload =
    !differentDepartment &&
    ((specificationId && department === "research_and_development") ||
      (job && ["quality_assurance", "production_management"].includes(department)));
  return (
    <div className="grid gap-5">
      {!canUpload && !differentDepartment && job && (
        <Notice>
          <p className="font-semibold">현재 계정은 문서를 조회할 수 있습니다.</p>
          <p className="mt-2">생산계획서·작업 순서는 생산관리 담당자, 검사성적서는 품질관리 담당자가 연결합니다.</p>
          <p>담당 부서 계정에서 원본 파일을 업로드해 주세요.</p>
        </Notice>
      )}
      {differentDepartment && (
        <Notice>
          <p className="font-semibold">{documentNames[initialKind!]}</p>
          <p className="mt-2">담당 · {departmentNames[requestedDepartment!]} 담당자</p>
          <p>
            현재 계정은 {departmentNames[department || user.role] ?? "소속 부서 없음"}이며, 이 문서는 조회만 가능합니다.{" "}
            {departmentNames[requestedDepartment!]} 담당자 계정에서 원본 파일을 업로드해 주세요.
          </p>
        </Notice>
      )}
      {canUpload && (
        <form
          className="grid gap-4 rounded-lg border border-dashed border-stone-300 bg-stone-50/50 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (uploading.current || !files.length) return;
            uploading.current = true;
            upload.mutate();
          }}
        >
          <p className="text-sm font-semibold">{departmentNames[department]} 문서 연결</p>
          {!automaticKind && (
            <Field label="문서 종류">
              <select value={kind} disabled={upload.isPending} onChange={(event) => setKind(event.target.value)}>
                {kinds.map((value) => (
                  <option key={value} value={value}>
                    {documentNames[value]}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {job && (
            <Notice>
              {automaticKind
                ? "검사성적서를 업로드하면 문서 종류와 포함된 대상을 자동으로 확인합니다. 품목코드·품목명·공정번호를 기준으로 현재 사양·계획·검사회차에 연결합니다."
                : "원문의 품목코드·품목명·공정번호와 투입 → 산출 표에서 이 생산 건의 대상을 자동으로 연결합니다."}
            </Notice>
          )}
          <Field label="원본 파일 (최대 10개)">
            <input
              key={batch}
              aria-label="원본 파일"
              type="file"
              multiple
              required
              disabled={upload.isPending}
              accept=".pdf,.docx,.csv,.xlsx"
              onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
            />
          </Field>
          <p className="text-muted text-xs leading-6">
            {specificationId
              ? "제품사양서·BOM 및 양산 이관만 업로드할 수 있습니다. 업로드 후 후보를 추출하고 원문과 대조하세요."
              : department === "production_management"
                ? `생산계획서는 다음 계획 v${(job?.plan_version ?? 0) + 1}, 작업 순서는 ${job?.plan_version ? `현재 확정 계획 v${job.plan_version}` : "최초 계획 v1"}에 연결됩니다.`
                : "현재 대상·사양·계획·회차의 증빙만 판정에 사용할 수 있습니다. 업로드만으로 합격하지 않습니다."}
          </p>
          <Button type="submit" variant="primary" disabled={upload.isPending || !files.length}>
            {upload.isPending ? "원본 업로드·연결 중…" : "문서 업로드"}
          </Button>
          {upload.error && <Notice error={upload.error} />}
          {upload.data?.map((result) => (
            <Notice key={result.fileId} tone={result.error && !linkedIds.includes(result.fileId) ? "error" : "success"}>
              {result.filename} ·{" "}
              {linkedIds.includes(result.fileId) ? "문서 연결 완료" : (result.error ?? "문서 연결 완료")}
              {result.error?.startsWith("문서 연결 실패") && !linkedIds.includes(result.fileId) && (
                <Button
                  className="mt-2"
                  disabled={action.isPending || isLinked(result.fileId)}
                  onClick={() =>
                    action.mutate(
                      { path: "/documents", body: binding(result.fileId) },
                      { onSuccess: () => setLinkedIds([...linkedIds, result.fileId]) },
                    )
                  }
                >
                  원문 자동 연결 재시도
                </Button>
              )}
            </Notice>
          ))}
        </form>
      )}
      {action.error && <Notice error={action.error} />}
      {!documents.length && <p className="text-muted py-5 text-center text-sm">연결된 원문이 없습니다.</p>}
      {documents.map((doc) => (
        <div key={doc.id} className="border-line grid gap-3 rounded-lg border p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <button onClick={() => setPreview(doc)} className="text-accent text-left text-sm font-semibold">
                {doc.filename} ↗
              </button>
              <p className="text-muted mt-1 text-xs">
                {documentNames[doc.kind] ?? doc.kind} ·{" "}
                {doc.scope.target_ids.length
                  ? `${doc.scope.target_ids.length}개 대상 · 회차 ${doc.scope.round} · 계획 v${doc.scope.plan_version}`
                  : "공통 사양 근거"}
              </p>
              {job && doc.scope.target_ids.length > 0 && (
                <p className="text-muted mt-2 text-xs leading-5">
                  연결 대상 ·{" "}
                  {doc.scope.target_ids
                    .map((id) => {
                      const target = job.targets[id];
                      return target ? `${target.name} v${target.version}` : id;
                    })
                    .join(", ")}
                </p>
              )}
            </div>
            <Badge status={doc.candidates.status === "extracting" ? "extracting" : doc.status} />
          </div>
          {doc.error && <Notice tone="error">{doc.error}</Notice>}
          <ExtractionProgress candidates={doc.candidates} />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setPreview(doc)}>원문 보기</Button>
            {canUpload && (automaticKind ? doc.department === department : doc.kind === kind) && (
              <Button
                disabled={action.isPending || isLinked(doc.file_id)}
                onClick={() => action.mutate({ path: "/documents", body: binding(doc.file_id) })}
              >
                {isLinked(doc.file_id) ? "현재 범위에 연결됨" : "이 원본을 자동으로 연결"}
              </Button>
            )}
            {doc.department === department && doc.status !== "attached" && (
              <Button
                disabled={action.isPending || doc.candidates.status === "extracting"}
                onClick={() => action.mutate({ path: `/documents/${doc.id}/extract` })}
              >
                {action.isPending || doc.candidates.status === "extracting"
                  ? "추출 중…"
                  : doc.candidates.status === "ready"
                    ? "후보 다시 추출"
                    : "후보 추출·재시도"}
              </Button>
            )}
            {doc.candidates.status === "ready" &&
              onCandidate &&
              (doc.candidates.data && "items" in doc.candidates.data ? (
                <Button onClick={() => onCandidate(doc)}>
                  {doc.kind === "bom_transfer" ? "BOM 후보를 작업본에 반영" : "사양 후보를 작업본에 반영"}
                </Button>
              ) : (
                <Button
                  disabled={action.isPending}
                  onClick={() =>
                    action.mutate({ path: `/documents/${doc.id}/extract`, body: { graph_candidate: true } })
                  }
                >
                  사양·BOM 후보 생성
                </Button>
              ))}
          </div>
          {doc.candidates.status === "ready" && doc.candidates.data && "rows" in doc.candidates.data && (
            <details>
              <summary className="text-muted text-sm">미확인 추출 후보</summary>
              <div className="mt-3 grid gap-2">
                {doc.candidates.reference?.warnings.map((warning) => (
                  <Notice key={warning}>{warning}</Notice>
                ))}
                {doc.candidates.data.rows.map((row, index) => (
                  <dl key={index} className="grid grid-cols-2 gap-2 rounded-md bg-stone-50 p-3 text-xs">
                    {Object.entries(row)
                      .filter(([key]) => !["original", "confirmed", "document_id", "notice"].includes(key))
                      .map(([key, value]) => (
                        <div key={key}>
                          <dt className="text-muted">{candidateLabels[key] ?? key}</dt>
                          <dd className="mt-1 break-words">
                            {typeof value === "string" || typeof value === "number"
                              ? value
                              : value == null
                                ? "미확인"
                                : JSON.stringify(value)}
                          </dd>
                        </div>
                      ))}
                  </dl>
                ))}
              </div>
            </details>
          )}
        </div>
      ))}
      {preview && <DocumentPreview document={preview} onClose={() => setPreview(null)} />}
    </div>
  );
};

export default DocumentUpload;
