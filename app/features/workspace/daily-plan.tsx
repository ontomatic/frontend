import { useMemo, useState } from "react";

import Button from "~/components/button";
import Check from "~/components/check";
import DocumentPreview from "~/components/document-preview";
import Field from "~/components/field";
import GanttChart from "~/components/gantt-chart";
import Notice from "~/components/notice";
import Table from "~/components/table";
import { sourceLocation, useWorkspaceAction } from "~/lib/api/workspace";
import type { Job, ScheduleEntry, WorkDocument } from "~/lib/api/workspace";

import { getGanttData } from "./gantt-tasks";

interface DailyPlanProps {
  schedule: ScheduleEntry[];
  documents: WorkDocument[];
  job?: Job;
  suggestedQuantity?: number;
  onDone?: () => void;
}
const DailyPlan = ({ schedule, documents, job, suggestedQuantity, onDone }: DailyPlanProps) => {
  const [kind, setKind] = useState<ScheduleEntry["kind"]>("operation");
  const [track, setTrack] = useState("");
  const [preview, setPreview] = useState<WorkDocument | null>(null);
  const [quantity, setQuantity] = useState(suggestedQuantity ?? job?.quantity ?? 1);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const action = useWorkspaceAction();
  const entries = useMemo(
    () => schedule.filter((entry) => entry.kind === kind && (!track || entry.track === track)),
    [schedule, kind, track],
  );
  const gantt = useMemo(() => getGanttData(entries, schedule), [entries, schedule]);
  const showSource = (entry: ScheduleEntry) => {
    const document = documents.find((doc) => doc.id === entry.sources[0]?.document_id);
    if (document) setPreview(document);
  };
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="일정 보기">
          <select
            value={kind}
            onChange={(event) => {
              setKind(event.target.value as ScheduleEntry["kind"]);
              setTrack("");
            }}
          >
            <option value="operation">
              공정별 · {schedule.filter((entry) => entry.kind === "operation").length}개
            </option>
            <option value="summary">
              생산계획 요약 · {schedule.filter((entry) => entry.kind === "summary").length}개
            </option>
          </select>
        </Field>
        <Field label="트랙 필터" className="min-w-40">
          <select value={track} onChange={(event) => setTrack(event.target.value)}>
            <option value="">전체 트랙</option>
            {[...new Set(schedule.filter((entry) => entry.kind === kind).map((entry) => entry.track))].map((value) => (
              <option key={value} value={value}>
                {value || "트랙 미기재"}
              </option>
            ))}
          </select>
        </Field>
        <p className="text-muted pb-2 text-xs">일 단위 · 종료일 포함 · 근무일은 원문 기준</p>
      </div>
      {entries.length > 0 ? (
        <GanttChart
          tasks={gantt.tasks}
          unit="day"
          label="일 단위 생산계획 Gantt"
          onSelect={(id) => {
            const entry = entries[Number(id) - 1];
            if (entry) showSource(entry);
          }}
        />
      ) : (
        <Notice>선택한 트랙에 일정이 없습니다.</Notice>
      )}
      <Table
        headings={["공정·트랙", "원문 수량", "시작·종료", "기간 (근무일)", "작업자 배정", "선행 공정·비고", "원문"]}
      >
        {entries.map((entry, index) => (
          <tr key={index}>
            <td>
              <p className="font-medium">
                {entry.code} {entry.process}
              </p>
              <p className="text-muted text-xs">{entry.track}</p>
            </td>
            <td>{entry.quantity || "미기재"}</td>
            <td className="whitespace-nowrap">
              {entry.start}
              <br />
              {entry.end}
            </td>
            <td>{entry.working_days == null ? "미기재" : `${entry.working_days}일`}</td>
            <td>
              <p>{entry.resource || "미기재"}</p>
              {entry.owner && <p className="text-muted text-xs">책임자: {entry.owner}</p>}
              {entry.assistants && <p className="text-muted text-xs">보조: {entry.assistants}</p>}
              {entry.headcount != null && <p className="text-muted text-xs">{entry.headcount}명</p>}
            </td>
            <td className="max-w-60 text-xs">
              {entry.predecessors.join(", ") || "—"}
              {entry.note && <p>{entry.note}</p>}
            </td>
            <td>
              {entry.sources.map((source, sourceIndex) => (
                <button
                  type="button"
                  key={sourceIndex}
                  className="text-accent block py-1 text-xs"
                  onClick={() => {
                    const doc = documents.find((candidate) => candidate.id === source.document_id);
                    if (doc) setPreview(doc);
                  }}
                >
                  {sourceLocation(source)} · {source.row}행 ↗
                </button>
              ))}
            </td>
          </tr>
        ))}
      </Table>
      {job && onDone && (
        <form
          className="grid gap-4 border-t border-stone-200 pt-5"
          onSubmit={(event) => {
            event.preventDefault();
            action.mutate(
              {
                path: `/jobs/${job.id}/plans`,
                body: {
                  revision: job.revision,
                  quantity,
                  reason,
                  schedule,
                  confirmed,
                  acknowledged_warnings: acknowledged,
                },
              },
              { onSuccess: onDone },
            );
          }}
        >
          {quantity !== job.quantity && (
            <Notice>
              현재 생산 건은 {job.quantity}개입니다. 계획 확정 시 원문 목표 수량 {quantity}개를 적용하고 BOM 소요 수량도
              함께 갱신합니다.
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
                  setQuantity(Number(event.target.value));
                  setConfirmed(false);
                }}
              />
            </Field>
            <Field label="계획 확정·변경 사유">
              <input required maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)} />
            </Field>
          </div>
          <Check checked={acknowledged} onChange={setAcknowledged}>
            자원 중복·선행 공정 역전이 있으면 원문을 대조하고 확인했습니다.
          </Check>
          <Check checked={confirmed} onChange={setConfirmed}>
            수량·날짜·근무일·작업자 배정·선행 공정을 원문과 대조했습니다.
          </Check>
          {action.error && <Notice error={action.error} />}
          <Button type="submit" variant="primary" disabled={action.isPending || !confirmed}>
            {action.isPending ? "검증·확정 중…" : `일 단위 계획 v${job.plan_version + 1} 확정`}
          </Button>
        </form>
      )}
      {preview && <DocumentPreview document={preview} onClose={() => setPreview(null)} />}
    </div>
  );
};

export default DailyPlan;
