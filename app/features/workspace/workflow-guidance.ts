import { documentNames, getProcessCountCandidates, inspectionKinds, kindsByDepartment } from "~/lib/api/workspace";
import type { Job, Target, WorkDocument } from "~/lib/api/workspace";

export interface WorkflowTask {
  department: string;
  tab: string;
  targetId?: string;
  kind?: string;
  what: string;
  where: string;
  how: string[];
  completion: string;
  action: string;
}

export const getWorkflowTask = ({
  tab,
  kind,
  targetId,
}: {
  tab: string;
  kind?: string;
  targetId?: string;
}): WorkflowTask => {
  const document = kind ? documentNames[kind] : "작업 순서 문서";
  const department =
    tab === "quality"
      ? "quality_assurance"
      : tab === "specification"
        ? "research_and_development"
        : tab === "documents"
          ? (Object.keys(kindsByDepartment).find((code) => kindsByDepartment[code].includes(kind ?? "")) ??
            "production_management")
          : "production_management";
  const base = { department, tab, kind, targetId };
  if (tab === "documents")
    return {
      ...base,
      what: `${document} 연결`,
      where: "문서 탭",
      how:
        department === "quality_assurance"
          ? [
              "검사성적서 원본 파일을 선택하고 ‘문서 업로드’ 선택",
              "자동으로 확인된 문서 종류·연결 대상과 추출 결과를 원문과 대조",
            ]
          : [
              kind ? `문서 종류에서 ‘${document}’ 선택` : "문서 종류에서 해당 공정의 작업 순서 선택",
              "원본 파일을 선택하고 ‘문서 업로드’ 선택",
              kind?.startsWith("work_instruction_")
                ? "자동으로 연결된 공정을 계획·Gantt에서 확인"
                : "연결한 문서의 ‘후보 추출·재시도’를 선택하고 원문과 대조",
            ],
      completion: kind?.startsWith("work_instruction_")
        ? "원문 공정번호와 투입·산출에 따라 공정 대상이 연결되면 완료"
        : "현재 대상·회차의 원문이 연결되고 추출 후보를 확인하면 완료",
      action: `${kind ? document.split(" · ")[0] : "작업 순서"} 연결하기`,
    };
  if (tab === "production")
    return {
      ...base,
      what: "생산 착수·완료 기록",
      where: "생산 완료 탭",
      how: [
        "작업 대상을 선택하고 ‘생산 착수’ 선택",
        "실제 작업 후 수량과 원문 근거 입력",
        "완료 확인 후 ‘수량 확인·생산 완료’ 선택",
      ],
      completion: "생산 완료 기록이 남고 상태가 ‘검사 대기’로 바뀌면 완료",
      action: "생산 작업 진행하기",
    };
  if (tab === "quality")
    return {
      ...base,
      what: `${document} 확인·검사 판정`,
      where: "품질관리 탭",
      how: [
        "현재 대상·회차의 검사성적서 연결·후보 추출",
        "검사 행을 선택하고 기준·측정값·수량을 원문과 대조",
        "판정을 확인하고 합격 또는 보류 결과 기록",
      ],
      completion: "품질 담당자의 합격·양품 승인 또는 보류 판정이 기록되면 완료",
      action: "검사 판정 진행하기",
    };
  if (tab === "plan")
    return {
      ...base,
      what: "생산계획 확인·확정",
      where: "계획·Gantt 탭",
      how: [
        "문서 탭에서 생산계획서 연결·후보 추출",
        "계획·Gantt에서 일정·수량·작업자 배정 확인",
        "원문 대조 후 계획 확정",
      ],
      completion: "적용 계획 버전이 생성되면 완료",
      action: "계획 확인·확정하기",
    };
  return {
    ...base,
    what: "제품사양서·BOM 확인",
    where: "제품·사양 화면",
    how: [
      "제품사양서와 BOM 원문 연결·후보 추출",
      "품목·버전·수량·구성 관계를 원문과 대조",
      "확인 결과 저장 후 사양 제출",
    ],
    completion: "R&D가 사양·BOM을 확인·제출하면 완료",
    action: "사양·BOM 확인하기",
  };
};

export const getTargetTask = (job: Job, target: Target, documents: WorkDocument[]): WorkflowTask | null => {
  if (["passed", "partial"].includes(target.status)) return null;
  if (target.inventory_of) {
    const process = job.targets[target.inventory_of];
    return process ? getTargetTask(job, process, documents) : null;
  }
  if (target.status === "held")
    return {
      ...getWorkflowTask({ tab: "production", targetId: target.id }),
      department:
        target.issue?.cause === "specification"
          ? "research_and_development"
          : target.issue?.cause === "evidence"
            ? "quality_assurance"
            : "production_management",
      what: `${target.name} 보완·재확인`,
      where: "생산 완료 탭 → 보완·교체·재작업",
      how: [
        "보완·교체·재작업 항목 열기",
        "보완 내용·사유와 새 사양 또는 증빙 확인",
        "‘담당 부서 보완 완료·재확인 요청’ 선택",
      ],
      completion: "보완 요청이 기록되고 새 회차에서 재확인할 수 있으면 완료",
      action: "보완 처리하기",
    };
  const inspectionTask = (item: Target, forProduction = false): WorkflowTask => {
    const kind = inspectionKinds[item.kind];
    const report = documents.find(
      (doc) =>
        doc.job_id === job.id &&
        doc.kind === kind &&
        doc.status === "parsed" &&
        doc.scope.specification_id === job.specification_id &&
        doc.scope.target_ids.includes(item.id) &&
        doc.scope.round === item.round &&
        doc.scope.plan_version === item.plan_version,
    );
    const task = getWorkflowTask({
      tab: report?.candidates.status === "ready" && !forProduction ? "quality" : "documents",
      kind,
      targetId: item.id,
    });
    if (report && report.candidates.status !== "ready")
      return {
        ...task,
        what: `${documentNames[kind]} 후보 추출`,
        action: "검사성적서 후보 확인하기",
        how: [
          "연결된 검사성적서에서 ‘후보 추출·재시도’ 선택",
          "추출이 끝나면 원문과 대조",
          forProduction ? "생산관리 담당자가 생산 완료를 기록" : "품질관리 탭에서 검사 결과 판정",
        ],
        completion: "후보 추출을 마치고 현재 품목의 검사 행을 확인하면 완료",
      };
    if (forProduction)
      return {
        ...task,
        what: `${item.name} · 원문 투입실적 준비`,
        action: "실적 근거 문서 확인하기",
        how: [
          report ? "검사성적서의 연결 대상과 공정번호를 확인" : `${documentNames[kind]} 원본을 현재 대상에 연결`,
          "공정별 투입·양품·불량 행을 추출하고 원문과 대조",
          "생산관리 담당자가 해당 행을 선택해 생산 완료를 기록",
        ],
        completion: "생산 완료 화면에서 현재 공정의 원문 실적 행을 선택할 수 있으면 완료",
      };
    return { ...task, what: `${item.name} · ${task.what}` };
  };
  if (target.status === "inspection") return inspectionTask(target);
  if (target.status === "producing" && target.process_code) {
    const reports = documents.filter(
      (doc) =>
        doc.job_id === job.id &&
        doc.status === "parsed" &&
        doc.scope.specification_id === job.specification_id &&
        doc.scope.target_ids.includes(target.id) &&
        doc.scope.round === target.round &&
        doc.scope.plan_version === target.plan_version &&
        doc.candidates.status === "ready",
    );
    if (!getProcessCountCandidates(target, reports).length) return inspectionTask(target, true);
  }
  if (target.status === "producing")
    return {
      ...getWorkflowTask({ tab: "production", targetId: target.id }),
      what: `${target.name} 생산 완료 기록`,
      action: "완료 수량 기록하기",
      how: ["실제 작업을 마친 뒤 수량·원문 근거 입력", "작업 완료와 수량을 확인", "‘수량 확인·생산 완료’ 선택"],
    };
  if (target.kind === "material") return inspectionTask(target);
  if (target.waiting_reasons.some((reason) => reason.includes("계획 확정")))
    return getWorkflowTask({ tab: "plan", kind: "production_plan" });
  const incoming = Object.values(job.targets).find(
    (item) =>
      item.kind === "material" && item.condition.startsWith("구매") && !["passed", "partial"].includes(item.status),
  );
  if (incoming && target.waiting_reasons.some((reason) => reason.includes("수입검사"))) return inspectionTask(incoming);
  if (target.waiting_reasons.some((reason) => reason.includes("해당 단계 작업 순서")))
    return getWorkflowTask({
      tab: "documents",
      targetId: target.id,
      kind:
        target.kind === "product"
          ? "work_instruction_final"
          : target.kind === "component"
            ? "work_instruction_module1"
            : undefined,
    });
  if (target.waiting_reasons.some((reason) => reason.includes("선행 공정 작업 순서")))
    return getWorkflowTask({
      tab: "documents",
      targetId: target.id,
      kind:
        target.kind === "assembly"
          ? "work_instruction_module1"
          : documents.some(
                (doc) =>
                  doc.job_id === job.id &&
                  doc.scope.specification_id === job.specification_id &&
                  doc.kind === "work_instruction_lens" &&
                  doc.status === "parsed" &&
                  doc.scope.target_ids.some((id) => job.targets[id]?.plan_version === doc.scope.plan_version),
              )
            ? "work_instruction_body"
            : "work_instruction_lens",
    });
  const dependency = (target.children ?? [])
    .map((id) => job.targets[id])
    .find((item) => item && !["passed", "partial"].includes(item.status));
  if (dependency) return getTargetTask(job, dependency, documents);
  if (target.waiting_reasons.some((reason) => reason.includes("전체 검사 승인"))) {
    const previousKind = target.kind === "product" ? "assembly" : "component";
    const previous = Object.values(job.targets).find(
      (item) => item.process_code && item.kind === previousKind && !["passed", "partial"].includes(item.status),
    );
    if (previous) return getTargetTask(job, previous, documents);
  }
  return { ...getWorkflowTask({ tab: "production", targetId: target.id }), what: `${target.name} 생산 착수` };
};
