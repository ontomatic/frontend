import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useOutletContext, useParams, useSearchParams } from "react-router";

import Badge from "~/components/badge";
import BomGraph from "~/components/bom-graph";
import Button from "~/components/button";
import Field from "~/components/field";
import HistoryTimeline from "~/components/history-timeline";
import Modal from "~/components/modal";
import Notice from "~/components/notice";
import PageTitle from "~/components/page-title";
import Panel from "~/components/panel";
import Table from "~/components/table";
import DocumentUpload from "~/features/upload/document-upload";
import ProductionPlan from "~/features/workspace/production-plan";
import TargetActions from "~/features/workspace/target-actions";
import TaskGuide from "~/features/workspace/task-guide";
import { getTargetTask, getWorkflowTask } from "~/features/workspace/workflow-guidance";
import WorkflowProgress, { getWorkflowSteps } from "~/features/workspace/workflow-progress";
import WorkflowStepper from "~/features/workspace/workflow-stepper";
import { departmentNames, documentPollInterval, getNextTarget, getWorkspace, kindNames } from "~/lib/api/workspace";
import type { CurrentUser, Job, Plan, Specification, WorkDocument, WorkflowEvent } from "~/lib/api/workspace";

const JobPage = () => {
  const { jobId } = useParams();
  const user = useOutletContext<CurrentUser>();
  const [params, setParams] = useSearchParams();
  const [actionOpen, setActionOpen] = useState(
    () => ["production", "quality"].includes(params.get("tab") ?? "") && !!params.get("target"),
  );
  const [targetSearch, setTargetSearch] = useState("");
  const navigate = useNavigate();
  const tab = params.get("tab") ?? "workflow";
  const showAllTargets = params.get("items") === "all";
  const job = useQuery({ queryKey: ["workspace", "job", jobId], queryFn: () => getWorkspace<Job>(`/jobs/${jobId}`) });
  const docs = useQuery({
    queryKey: ["workspace", "documents", jobId],
    queryFn: () => getWorkspace<WorkDocument[]>(`/documents?job_id=${jobId}`),
    refetchInterval: documentPollInterval,
  });
  const plans = useQuery({
    queryKey: ["workspace", "plans", jobId],
    queryFn: () => getWorkspace<Plan[]>(`/jobs/${jobId}/plans`),
  });
  const events = useQuery({
    queryKey: ["workspace", "events", jobId],
    queryFn: () => getWorkspace<WorkflowEvent[]>(`/events?job_id=${jobId}`),
  });
  const specs = useQuery({
    queryKey: ["workspace", "specifications"],
    queryFn: () => getWorkspace<Specification[]>("/specifications"),
  });
  const error = job.error || docs.error || plans.error || events.error || specs.error;
  if (error) return <Notice error={error} />;
  if (!job.data || !docs.data || !plans.data || !events.data || !specs.data)
    return <p role="status">생산 건과 현재 회차를 불러오고 있습니다…</p>;
  const current = job.data;
  const targets = Object.values(current.targets);
  const target =
    current.targets[params.get("target") ?? ""] ?? getNextTarget(current, user.department?.code ?? "") ?? targets[0];
  const passed = targets.filter((candidate) => ["passed", "partial"].includes(candidate.status)).length;
  const showActions = ["production", "quality"].includes(tab);
  const currentTargets = showActions
    ? targets.filter((candidate) => {
        if (candidate.inventory_of) return false;
        if (candidate.status === "held")
          return tab === "quality" ? candidate.issue?.cause === "evidence" : candidate.issue?.cause !== "evidence";
        if (tab === "quality")
          return candidate.kind === "material"
            ? candidate.status === "waiting"
            : candidate.status === "inspection" && !!candidate.completion_id && !candidate.waiting_reasons.length;
        return (
          candidate.kind !== "material" &&
          (candidate.status === "producing" || (candidate.status === "waiting" && !candidate.waiting_reasons.length))
        );
      })
    : targets;
  const filteredTargets = showActions
    ? (showAllTargets ? targets : currentTargets).filter((candidate) =>
        `${candidate.name} ${candidate.code}`.toLowerCase().includes(targetSearch.trim().toLowerCase()),
      )
    : targets;
  const setTargetView = (all: boolean) => {
    const next = new URLSearchParams(params);
    if (all) next.set("items", "all");
    else next.delete("items");
    setParams(next, { replace: true, preventScrollReset: true });
  };
  const selectTarget = (id: string) => {
    setParams(
      { tab, target: id, ...(showAllTargets ? { items: "all" } : {}) },
      { replace: true, preventScrollReset: true },
    );
    setActionOpen(showActions);
  };
  const navigateTask = (nextTab: string, targetId?: string, kind?: string) => {
    if (nextTab === "specification") void navigate(`/specifications/${current.specification_id}`);
    else {
      setParams(
        { tab: nextTab, target: targetId ?? target.id, ...(kind ? { kind } : {}) },
        { preventScrollReset: true },
      );
      const opensAction = ["production", "quality"].includes(nextTab);
      setActionOpen(opensAction);
      if (!opensAction)
        requestAnimationFrame(() => {
          const area = document.getElementById("job-work-area");
          area?.scrollIntoView({ behavior: "smooth", block: "start" });
          area?.focus({ preventScroll: true });
        });
    }
  };
  const steps = getWorkflowSteps(current, docs.data);
  const nextStep = steps.find((step) => !step.done);
  const nextTask = nextStep
    ? ((nextStep.targetId && current.targets[nextStep.targetId]
        ? getTargetTask(current, current.targets[nextStep.targetId], docs.data)
        : null) ?? getWorkflowTask(nextStep))
    : null;
  const targetTask = getTargetTask(current, target, docs.data);
  const visibleTask = tab === "graph" ? targetTask : nextTask;
  const actionLabels: Record<string, string> = {};
  targets.forEach((candidate) => {
    const task = getTargetTask(current, candidate, docs.data);
    if (task) actionLabels[candidate.id] = `${departmentNames[task.department]} · ${task.action}`;
  });
  return (
    <>
      <PageTitle
        title={current.name}
        description={`${current.product_code} · 사양/BOM v${current.specification_version} · ${current.id}`}
      >
        <Badge status={current.status} />
      </PageTitle>
      <Panel className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className={showActions ? "flex items-center gap-2" : ""}>
            <p className="text-muted text-sm">완제품 목표 수량</p>
            <p className={showActions ? "text-sm font-semibold" : "mt-1 text-2xl font-semibold"}>
              {current.quantity.toLocaleString()}{" "}
              <span className="text-muted text-sm font-normal">
                {current.production_result?.unit ??
                  targets.find((candidate) => candidate.kind === "product")?.unit ??
                  "개"}
              </span>
            </p>
          </div>
          <div className={showActions ? "flex items-center gap-2" : ""}>
            <p className="text-muted text-sm">적용 계획</p>
            <p className={showActions ? "text-sm font-medium" : "mt-2 font-medium"}>
              {current.plan_version ? `v${current.plan_version}` : "확정 대기"}
            </p>
          </div>
          <div className={showActions ? "flex items-center gap-2" : ""}>
            <p className="text-muted text-sm">구성별 양품 승인</p>
            <p className={showActions ? "text-sm font-medium" : "mt-2 font-medium"}>
              {passed} / {targets.length}
            </p>
          </div>
          <Link to={`/specifications/${current.specification_id}`} className="text-sm">
            참조 사양·BOM →
          </Link>
        </div>
        {!showActions && (
          <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-stone-100">
            <div
              className="h-full rounded-full bg-orange-300 transition-all"
              style={{ width: `${(passed / targets.length) * 100}%` }}
            />
          </div>
        )}
        {showActions ? (
          <details className="border-line mt-4 border-t pt-4">
            <summary className="text-sm font-medium">
              {nextStep
                ? `현재 ${steps.indexOf(nextStep) + 1} / ${steps.length}단계 · ${nextStep.label}`
                : "전체 단계 완료"}
              <span className="text-muted ml-3 text-xs">전체 단계 보기</span>
            </summary>
            <WorkflowStepper steps={steps} onNavigate={navigateTask} />
          </details>
        ) : (
          <WorkflowStepper steps={steps} onNavigate={navigateTask} />
        )}
      </Panel>
      {current.production_result && (
        <Notice>
          완제품 실적 · 투입 {current.production_result.input_quantity} / 양품 {current.production_result.good_quantity}{" "}
          / 불량 격리 {current.production_result.defect_quantity} {current.production_result.unit}
        </Notice>
      )}
      {!showActions && visibleTask && (
        <section aria-label="지금 필요한 작업" className="mb-6">
          <h2 className="mb-3 font-semibold">{tab === "graph" ? `${target.name} · 다음 작업` : "지금 필요한 작업"}</h2>
          <TaskGuide task={visibleTask} user={user} onNavigate={navigateTask} />
        </section>
      )}
      <div role="tablist" aria-label="생산 건 업무" className="border-line mb-6 flex gap-5 overflow-x-auto border-b">
        {[
          ["workflow", "진행 순서"],
          ["graph", "구성·진행"],
          ["production", "생산 완료"],
          ["quality", "품질관리"],
          ["plan", "계획·Gantt"],
          ["documents", "문서"],
          ["history", "버전·회차 이력"],
        ].map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            onClick={() => {
              setActionOpen(false);
              setTargetSearch("");
              setParams({ tab: value, target: target.id }, { preventScrollReset: true });
            }}
            className={`shrink-0 border-b-2 px-1 py-3 text-sm ${tab === value ? "text-accent border-orange-400 font-semibold" : "text-muted border-transparent"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div id="job-work-area" tabIndex={-1} className="scroll-mt-6">
        {tab === "workflow" ? (
          <Panel>
            <WorkflowProgress
              job={current}
              plans={plans.data}
              documents={docs.data}
              user={user}
              onNavigate={navigateTask}
            />
          </Panel>
        ) : tab === "plan" ? (
          <Panel>
            <ProductionPlan
              key={current.revision}
              job={current}
              plans={plans.data}
              documents={docs.data}
              canEdit={user.department?.code === "production_management"}
            />
          </Panel>
        ) : tab === "documents" ? (
          <Panel>
            <DocumentUpload
              key={`${params.get("kind")}:${target.id}`}
              user={user}
              documents={docs.data}
              job={current}
              targetId={target.id}
              initialKind={params.get("kind") ?? undefined}
            />
          </Panel>
        ) : tab === "history" ? (
          <Panel>
            <HistoryTimeline events={events.data} documents={docs.data} />
          </Panel>
        ) : (
          <>
            <Panel>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="font-semibold">{showActions ? "대상별 현재 상태" : "생산 건 구성 그래프"}</h2>
                  {showActions && (
                    <div role="group" aria-label="품목 보기" className="mt-3 flex flex-wrap gap-2">
                      <Button
                        variant={showAllTargets ? "secondary" : "primary"}
                        aria-pressed={!showAllTargets}
                        onClick={() => setTargetView(false)}
                      >
                        현재 처리할 품목 ({currentTargets.length})
                      </Button>
                      <Button
                        variant={showAllTargets ? "primary" : "secondary"}
                        aria-pressed={showAllTargets}
                        onClick={() => setTargetView(true)}
                      >
                        전체 품목 ({targets.length})
                      </Button>
                    </div>
                  )}
                </div>
                {showActions && (
                  <Field label="작업 대상 검색" className="w-full sm:w-72">
                    <input
                      type="search"
                      placeholder="품목명 또는 코드"
                      value={targetSearch}
                      onChange={(event) => setTargetSearch(event.target.value)}
                    />
                  </Field>
                )}
              </div>
              {!showActions && (
                <details className="mb-5 text-sm">
                  <summary>품목·버전별 총 소요 수량</summary>
                  <div className="mt-3 grid gap-2">
                    {[
                      ...new Set(
                        targets.filter((candidate) => candidate.item_key).map((candidate) => candidate.item_key),
                      ),
                    ].map((itemKey) => {
                      const items = targets.filter((candidate) => candidate.item_key === itemKey);
                      return (
                        <p key={itemKey}>
                          {items[0].name} v{items[0].version} · {items.reduce((sum, item) => sum + item.quantity, 0)}
                          {items[0].unit}
                        </p>
                      );
                    })}
                  </div>
                </details>
              )}
              {!showActions && (
                <div className="mb-5">
                  <BomGraph
                    targets={current.targets}
                    selected={target.id}
                    onSelect={selectTarget}
                    groups={current.composition_groups}
                    actionLabels={actionLabels}
                  />
                </div>
              )}
              <Table
                headings={["대상·버전", "소요 수량", "단계·회차", "진행 상태"]}
                className={
                  showActions
                    ? "max-h-[60dvh] overscroll-contain [&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10 [&_thead]:bg-stone-50"
                    : ""
                }
              >
                {filteredTargets.map((candidate) => (
                  <tr key={candidate.id} className={candidate.id === target.id ? "bg-amber-50" : "hover:bg-stone-50"}>
                    <td>
                      <button
                        onClick={() => selectTarget(candidate.id)}
                        aria-haspopup={showActions ? "dialog" : undefined}
                        className="text-ink text-left font-medium"
                      >
                        {candidate.name}
                      </button>
                      <p className="text-muted mt-1 text-xs">
                        {candidate.code} v{candidate.version} · {candidate.condition}
                      </p>
                    </td>
                    <td>
                      {candidate.quantity}
                      {candidate.unit}
                      {candidate.good_quantity !== undefined && (
                        <p className="text-muted mt-2 text-xs">
                          투입 {candidate.input_quantity} / 양품 {candidate.good_quantity} / 불량{" "}
                          {candidate.defect_quantity}
                          {candidate.remaining_quantity != null ? ` / 잔여 ${candidate.remaining_quantity}` : ""}
                        </p>
                      )}
                    </td>
                    <td className="text-xs">
                      {kindNames[candidate.kind]} · 품질{" "}
                      {candidate.kind === "material" ? 1 : candidate.kind === "product" ? 3 : 2}차
                      <p className="text-muted mt-1">생산·검사 회차 {candidate.round}</p>
                    </td>
                    <td>
                      <Badge status={candidate.status} />
                      <p className="text-muted mt-2 max-w-60 text-xs">
                        {["passed", "partial"].includes(candidate.status)
                          ? "현재 회차 승인 완료"
                          : (actionLabels[candidate.id] ?? candidate.waiting_reasons[0])}
                      </p>
                    </td>
                  </tr>
                ))}
              </Table>
              {showActions && !filteredTargets.length && (
                <p role="status" className="text-muted py-6 text-center text-sm">
                  {targetSearch.trim()
                    ? "검색 결과가 없습니다."
                    : "현재 처리할 품목이 없습니다. 전체 품목에서 완료·대기 상태를 확인할 수 있습니다."}
                </p>
              )}
              {!showActions && (
                <div className="mt-5 grid gap-3">
                  <h3 className="font-semibold">{target.name} · 직접 연결</h3>
                  {current.composition_groups?.some((group) => group.target_ids.includes(target.id)) && (
                    <p className="text-muted text-sm">
                      제품사양서 구성 그룹:{" "}
                      {current.composition_groups
                        .filter((group) => group.target_ids.includes(target.id))
                        .map((group) => group.name)
                        .join(", ")}
                    </p>
                  )}
                  <p className="text-muted text-sm">
                    하위: {target.children.map((id) => current.targets[id].name).join(", ") || "없음"} / 상위 사용처:{" "}
                    {target.parents.map((id) => current.targets[id].name).join(", ") || "완제품 루트"}
                  </p>
                  {target.waiting_reasons.length > 0 && !["passed", "partial"].includes(target.status) && (
                    <details className="text-muted text-xs">
                      <summary>현재 대기 사유 상세</summary>
                      <ul className="mt-2 list-disc space-y-1 pl-5">
                        {target.waiting_reasons.map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                  <div className="flex gap-2">
                    <Button onClick={() => navigateTask("production", target.id)}>생산 작업 보기</Button>
                    <Button onClick={() => navigateTask("quality", target.id)}>검사 보기</Button>
                  </div>
                </div>
              )}
            </Panel>
            {showActions && actionOpen && (
              <Modal
                title={`${tab === "production" ? "생산 완료" : "품질관리"} · ${target.name}`}
                onClose={() => setActionOpen(false)}
              >
                <div className="mb-4 flex items-center justify-between gap-2">
                  <h2 className="font-semibold">
                    {target.code} v{target.version} · 회차 {target.round}
                  </h2>
                  <Badge status={target.status} />
                </div>
                <p className="text-muted mb-4 text-xs">
                  계획 v{target.plan_version} · {target.quantity}
                  {target.unit} · {target.condition}
                </p>
                <TargetActions
                  key={`${current.revision}:${target.id}:${tab}`}
                  job={current}
                  target={target}
                  user={user}
                  documents={docs.data}
                  specifications={specs.data}
                  events={events.data}
                  mode={tab}
                  onNavigate={navigateTask}
                />
                <Link
                  to={`/jobs/${jobId}?tab=documents&target=${encodeURIComponent(target.id)}`}
                  preventScrollReset
                  onClick={() => setActionOpen(false)}
                  className="mt-5 inline-block text-sm"
                >
                  증빙·계획 문서 연결 →
                </Link>
              </Modal>
            )}
          </>
        )}
      </div>
    </>
  );
};
export default JobPage;

export const meta = () => [{ title: "생산 건 · Ontomatic" }];
