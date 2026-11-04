import Button from "~/components/button";
import { departmentNames } from "~/lib/api/workspace";
import type { CurrentUser } from "~/lib/api/workspace";

import type { WorkflowTask } from "./workflow-guidance";

interface TaskGuideProps {
  task: WorkflowTask;
  user: CurrentUser;
  onNavigate: (tab: string, targetId?: string, kind?: string) => void;
}
const TaskGuide = ({ task, user, onNavigate }: TaskGuideProps) => {
  const canAct = user.department?.code === task.department;
  const owner = departmentNames[task.department] ?? task.department;
  const currentDepartment = departmentNames[user.department?.code ?? user.role] ?? "소속 부서 없음";
  return (
    <div className="grid gap-4 rounded-lg border border-orange-200 bg-orange-50/40 p-4">
      <div>
        <p className="text-muted text-xs">무엇을 · 필요한 작업</p>
        <h3 className="mt-1 font-semibold">{task.what}</h3>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted text-xs">누가 · 담당자</dt>
          <dd className="mt-1 font-medium">{owner} 담당자</dd>
        </div>
        <div>
          <dt className="text-muted text-xs">어디서 · 이동 화면</dt>
          <dd className="mt-1 font-medium">{task.where}</dd>
        </div>
      </dl>
      <div>
        <p className="text-muted text-xs">어떻게 · 진행 방법</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
          {task.how.map((instruction) => (
            <li key={instruction}>{instruction}</li>
          ))}
        </ol>
      </div>
      <p className="text-muted text-xs">완료 기준 · {task.completion}</p>
      <div className="flex flex-wrap items-center gap-3 border-t border-orange-100 pt-3">
        <Button
          variant={canAct ? "primary" : "secondary"}
          onClick={() => onNavigate(task.tab, task.targetId, task.kind)}
        >
          {canAct ? task.action : `${task.where.split(" → ")[0]} 보기`}
        </Button>
        {["quality", "plan"].includes(task.tab) && task.kind && (
          <Button onClick={() => onNavigate("documents", task.targetId, task.kind)}>
            {task.tab === "quality" ? "검사성적서 연결 화면" : "생산계획서 연결 화면"}
          </Button>
        )}
        <p className="text-muted text-xs">
          현재 계정 · {currentDepartment}
          {canAct ? " — 직접 진행할 수 있습니다." : ` — 조회만 가능합니다. ${owner} 담당자가 진행해 주세요.`}
        </p>
      </div>
    </div>
  );
};
export default TaskGuide;
