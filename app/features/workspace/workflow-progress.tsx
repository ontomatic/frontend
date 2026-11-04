import Button from "~/components/button";
import { departmentNames } from "~/lib/api/workspace";
import type { CurrentUser, Job, Plan, Target, WorkDocument } from "~/lib/api/workspace";

import { getWorkflowTask } from "./workflow-guidance";

interface WorkflowProgressProps {
  job: Job;
  plans: Plan[];
  documents: WorkDocument[];
  user: CurrentUser;
  onNavigate: (tab: string, targetId?: string, kind?: string) => void;
}

const approved = (target: Target) => ["passed", "partial"].includes(target.status);
const allApproved = (targets: Target[]) => targets.length > 0 && targets.every(approved);

export const getWorkflowSteps = (job: Job, documents: WorkDocument[]) => {
  const targets = Object.values(job.targets);
  const currentDocs = documents.filter(
    (doc) => doc.job_id === job.id && doc.status === "parsed" && doc.scope.specification_id === job.specification_id,
  );
  const instructions = (kind: string) =>
    currentDocs.filter(
      (doc) =>
        doc.kind === kind &&
        doc.scope.target_ids.some((id) => job.targets[id]?.plan_version === doc.scope.plan_version),
    );
  const stageTargets = (kinds: string[]) => {
    const ids = new Set(
      kinds.flatMap((kind) =>
        instructions(kind).flatMap((doc) =>
          doc.scope.target_ids.filter((id) => job.targets[id]?.plan_version === doc.scope.plan_version),
        ),
      ),
    );
    return targets.filter((target) => ids.has(target.id) && !target.inventory_of);
  };
  const materials = targets.filter((target) => target.kind === "material" && !target.inventory_of);
  const purchased = materials.filter((target) => target.condition.startsWith("구매"));
  const incoming = purchased.length ? purchased : materials;
  const first = stageTargets(["work_instruction_module1"]);
  const second = stageTargets(["work_instruction_lens", "work_instruction_body"]);
  const final = stageTargets(["work_instruction_final"]);
  const nextTarget = (items: Target[]) =>
    items.find((target) => !approved(target) && !target.waiting_reasons.length)?.id ??
    items.find((target) => !approved(target))?.id ??
    items[0]?.id;
  const productionDone = (items: Target[]) =>
    items.length > 0 && items.every((target) => !!target.completion_id || approved(target));
  const progress = (items: Target[]) => `검사 승인 ${items.filter(approved).length} / ${items.length}`;
  const assemblyRows = instructions("work_instruction_module1").flatMap((doc) =>
    doc.candidates.data && "rows" in doc.candidates.data
      ? doc.candidates.data.rows
          .filter((row) => typeof row.process === "string" && row.process.includes("1차 모듈 조립"))
          .map((row) => (typeof row.process_codes === "string" ? row.process_codes : ""))
      : [],
  );
  const moduleCount = new Set(
    assemblyRows.length
      ? assemblyRows
      : first.filter((target) => !target.preparation).map((target) => target.instruction_group ?? target.id),
  ).size;
  return [
    {
      label: "사양·BOM",
      title: "① 제품사양서 → ② BOM 및 양산 이관",
      department: "R&D부서",
      done: true,
      tab: "specification",
    },
    {
      label: "수입검사",
      title: "③ 수입검사성적서",
      department: "품질부서",
      detail: `구매 ${new Set(incoming.map((target) => target.item_key || target.id)).size}종 · ${progress(incoming)}`,
      done: !incoming.length || allApproved(incoming),
      tab: "quality",
      targetId: nextTarget(incoming),
      kind: "incoming_inspection",
    },
    {
      label: "생산계획",
      title: "④ 생산계획서",
      department: "생산부서",
      detail: `일정 · 작업자 배정${job.plan_version ? ` · 확정 v${job.plan_version}` : ""}`,
      done: job.plan_version > 0,
      tab: "plan",
      kind: "production_plan",
    },
    {
      label: "1차 모듈 생산",
      title: "⑤ 작업 순서 (1차 모듈) → 1차 모듈 조립",
      department: "생산부서",
      detail: moduleCount
        ? `${moduleCount}공정 · 부품 준비와 공정별 생산 완료 확인`
        : "작업 순서를 연결해 공정을 확인하세요.",
      done: productionDone(first),
      tab: first.length ? "production" : "documents",
      targetId: nextTarget(first),
      kind: "work_instruction_module1",
    },
    {
      label: "1차 모듈 검사",
      title: "⑥ 검사성적서 (1차 모듈)",
      department: "품질부서",
      detail: progress(first),
      done: allApproved(first),
      tab: "quality",
      targetId: nextTarget(first),
      kind: "inspection_module1",
    },
    {
      label: "2차 모듈 생산",
      title: "⑦ 작업 순서 (렌즈 공정) · ⑧ 작업 순서 (본체 공정) → 2차 모듈 조립",
      department: "생산부서",
      detail: "렌즈·본체 공정 병행 · 1차 모듈 전체 검사 승인 후 착수",
      done:
        instructions("work_instruction_lens").length > 0 &&
        instructions("work_instruction_body").length > 0 &&
        productionDone(second),
      tab:
        instructions("work_instruction_lens").length && instructions("work_instruction_body").length
          ? "production"
          : "documents",
      targetId: nextTarget(second),
      kind: instructions("work_instruction_lens").length ? "work_instruction_body" : "work_instruction_lens",
    },
    {
      label: "2차 모듈 검사",
      title: "⑨ 검사성적서 (2차 모듈)",
      department: "품질부서",
      detail: progress(second),
      done:
        instructions("work_instruction_lens").length > 0 &&
        instructions("work_instruction_body").length > 0 &&
        allApproved(second),
      tab: "quality",
      targetId: nextTarget(second),
      kind: "inspection_module2",
    },
    {
      label: "완제품 생산",
      title: "⑩ 작업 순서 (완제품 공정) → 최종 결합·검사",
      department: "생산부서",
      detail:
        final
          .map((target) => target.process_code)
          .filter(Boolean)
          .join(", ") || "2차 모듈 전체 검사 승인 후 착수",
      done: productionDone(final),
      tab: final.length ? "production" : "documents",
      targetId: nextTarget(final),
      kind: "work_instruction_final",
    },
    {
      label: "완제품 검사",
      title: "⑪ 검사성적서 (완제품)",
      department: "품질부서",
      detail: progress(final),
      done: allApproved(final),
      tab: "quality",
      targetId: nextTarget(final),
      kind: "inspection_final",
    },
  ];
};

const WorkflowProgress = ({ job, plans, documents, user, onNavigate }: WorkflowProgressProps) => {
  const steps = getWorkflowSteps(job, documents);
  const active = steps.findIndex((step) => !step.done);
  const plan = plans.find((candidate) => candidate.version === job.plan_version);
  const dates = [
    ...(plan?.data.schedule?.map((entry) => entry.end) ?? []),
    ...(plan?.data.lines.map((line) =>
      new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date(line.end)),
    ) ?? []),
  ];
  const completionDate = dates.sort().at(-1);
  const completed = ["completed", "completed_with_defects"].includes(job.status);
  return (
    <section aria-label="부서별 생산 workflow" className="grid gap-5">
      <div>
        <h2 className="font-semibold">부서별 진행 순서</h2>
        <p className="text-muted mt-2 text-sm">선행 단계의 검사 승인을 마친 뒤 다음 단계 생산에 착수합니다.</p>
      </div>
      <ol className="grid gap-3">
        {steps.map((step, index) => {
          const task = getWorkflowTask(step);
          const canAct = user.department?.code === task.department;
          return (
            <li
              key={step.title}
              aria-current={index === active ? "step" : undefined}
              className={`border-line rounded-lg border p-4 ${index === active ? "bg-amber-50" : ""}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-muted text-xs">
                    {step.department} · {step.done ? "완료" : index === active ? "현재 단계" : "대기"}
                  </p>
                  <p className="mt-2 text-sm font-medium">{step.title}</p>
                  {step.detail && <p className="text-muted mt-2 text-xs">{step.detail}</p>}
                  <p className="mt-3 text-xs">
                    <span className="text-muted">어디서 · </span>
                    {task.where}
                  </p>
                  <p className="mt-1 max-w-3xl text-xs leading-6">
                    <span className="text-muted">어떻게 · </span>
                    {task.how.join(" → ")}
                  </p>
                  {!step.done && !canAct && (
                    <p className="text-muted mt-2 text-xs">
                      {departmentNames[task.department]} 담당자가 진행합니다. 현재 계정은 조회만 가능합니다.
                    </p>
                  )}
                </div>
                <Button onClick={() => onNavigate(step.tab, step.targetId, step.kind)}>
                  {step.done ? "완료 내역 보기" : canAct ? task.action : `${task.where.split(" → ")[0]} 보기`}
                </Button>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="rounded-lg bg-stone-50 p-4 text-sm font-semibold">
        {completed ? "완성" : "완성 예정"} · {completionDate ?? "생산계획 확정 후 표시"}
        {job.status === "completed_with_defects" && " · 양품 승인 / 불량 격리"}
      </p>
    </section>
  );
};
export default WorkflowProgress;
