import Button from "~/components/button";

import type { getWorkflowSteps } from "./workflow-progress";

interface WorkflowStepperProps {
  steps: ReturnType<typeof getWorkflowSteps>;
  onNavigate: (tab: string, targetId?: string, kind?: string) => void;
}

const WorkflowStepper = ({ steps, onNavigate }: WorkflowStepperProps) => {
  const active = steps.findIndex((step) => !step.done);
  const completed = steps.filter((step) => step.done).length;
  return (
    <section aria-label="생산 단계" className="border-line mt-5 border-t pt-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm">
        <p role="status" className="font-semibold">
          {active === -1 ? "전체 단계 완료" : `현재 ${active + 1} / ${steps.length}단계 · ${steps[active].label}`}
        </p>
        <p className="text-muted text-xs">
          완료 {completed} / {steps.length}단계
        </p>
      </div>
      <ol className="grid grid-cols-3 gap-2 lg:grid-cols-9">
        {steps.map((step, index) => {
          const status = step.done ? "완료" : index === active ? "현재 단계" : "대기";
          return (
            <li key={step.title} aria-current={index === active ? "step" : undefined}>
              <Button
                variant={index === active ? "primary" : "secondary"}
                className="h-full w-full flex-col px-2 py-3 text-center"
                aria-label={`${index + 1}단계 ${step.label} · ${status}`}
                onClick={() => onNavigate(step.tab, step.targetId, step.kind)}
              >
                <span
                  aria-hidden="true"
                  className={`grid size-7 place-items-center rounded-full text-xs font-semibold ${step.done ? "bg-emerald-100 text-emerald-800" : index === active ? "text-accent bg-white" : "bg-stone-100 text-stone-600"}`}
                >
                  {step.done ? "✓" : index + 1}
                </span>
                <span className="text-xs leading-5 break-keep">{step.label}</span>
                <span className="text-xs">{status}</span>
              </Button>
            </li>
          );
        })}
      </ol>
    </section>
  );
};

export default WorkflowStepper;
