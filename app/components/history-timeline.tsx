import { useState } from "react";
import { Link } from "react-router";

import { dateTime, departmentNames, sourceLocation } from "~/lib/api/workspace";
import type { Evidence, Graph, WorkflowEvent, WorkDocument } from "~/lib/api/workspace";

import DocumentPreview from "./document-preview";
import Empty from "./empty";
import Table from "./table";

interface HistoryTimelineProps {
  events: WorkflowEvent[];
  documents?: WorkDocument[];
}
const actionNames: Record<string, string> = {
  item_imported: "공통 사양·BOM 연결",
  draft_created: "제품 작업본 생성",
  draft_saved: "사양·BOM 작업본 저장",
  specification_submitted: "사양·BOM 제출",
  job_created: "생산 건 생성",
  document_attached: "문서 연결",
  document_scope_updated: "문서 연결 대상 변경",
  processes_registered: "작업 순서 공정 연결",
  plan_confirmed: "계획 확정",
  production_started: "생산 착수",
  production_completed: "수량 확인·생산 완료",
  inspection: "품질판정",
  rework: "보완·재작업",
};
const HistoryTimeline = ({ events, documents = [] }: HistoryTimelineProps) => {
  const [preview, setPreview] = useState<WorkDocument | null>(null);
  if (!events.length) return <Empty title="기록된 이력이 없습니다" />;
  return (
    <div className="grid gap-0">
      {events.map((event) => {
        const data = event.data;
        const graph = data.graph as Graph | undefined;
        const sources = data.sources as Evidence[] | undefined;
        return (
          <article
            key={event.id}
            className="border-line relative border-l pb-6 pl-6 before:absolute before:top-1 before:-left-[5px] before:size-2 before:rounded-full before:bg-orange-300"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">
                {actionNames[event.action] ?? event.action}
                {data.result === "pass"
                  ? Number(data.defect_quantity) > 0
                    ? " · 양품 승인·불량 격리"
                    : " · 합격"
                  : data.result === "fail"
                    ? " · 불합격 전체 보류"
                    : ""}
              </h3>
              <time className="text-muted text-xs">{dateTime(event.created_at)}</time>
            </div>
            <p className="text-muted mt-2 text-xs">
              {event.actor_name} · {departmentNames[event.department] ?? event.department}
              {event.target_id ? ` · ${event.target_id}` : ""}
              {data.round ? ` · 회차 ${String(data.round)}` : ""}
              {data.plan_version ? ` · 계획 v${String(data.plan_version)}` : ""}
            </p>
            {data.reason ? <p className="mt-2 text-sm leading-6">{String(data.reason)}</p> : null}
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {event.job_id && <Link to={`/jobs/${event.job_id}?tab=history`}>생산 건 {event.job_id.slice(0, 8)}</Link>}
              {event.specification_id && <Link to={`/specifications/${event.specification_id}`}>당시 사양 조회</Link>}
              {data.specification_id ? (
                <Link to={`/specifications/${String(data.specification_id)}`}>참조 사양</Link>
              ) : null}
              {data.completion_id ? <span>완료 확인 {String(data.completion_id).slice(0, 8)}</span> : null}
            </div>
            {data.quantity !== undefined && (
              <p className="mt-2 text-sm">
                확인 수량: {String(data.quantity)} {String(data.quantity_unit ?? data.unit ?? "개")}
              </p>
            )}
            {typeof data.good_quantity === "number" && (
              <p className="mt-2 text-sm">
                양품 {data.good_quantity.toLocaleString()} · 불량 격리 {String(data.defect_quantity)}
              </p>
            )}
            {data.criterion ? (
              <p className="mt-2 text-sm">
                기준: {String(data.standard)} · {String(data.criterion)} / 결과: {String(data.measured_value)}{" "}
                {String(data.unit ?? "")} · 등급 {String(data.grade ?? "—")}
              </p>
            ) : null}
            {Array.isArray(data.affected) && (
              <p className="text-muted mt-2 text-xs">재확인 대상: {data.affected.join(", ") || "없음"}</p>
            )}
            {sources?.length ? (
              <div className="mt-3 flex flex-wrap gap-3">
                {sources.map((source, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      const doc = documents.find((candidate) => candidate.id === source.document_id);
                      if (doc) setPreview(doc);
                    }}
                    className="text-accent text-xs"
                  >
                    근거 {index + 1} · {sourceLocation(source)} / {source.row} ↗
                  </button>
                ))}
              </div>
            ) : null}
            {graph && (
              <details className="mt-3 text-sm">
                <summary className="text-muted">당시 고정 사양·BOM 보기</summary>
                <div className="mt-3 grid gap-3">
                  <Table headings={["품목·버전", "사양", "값·단위", "원문"]}>
                    {graph.items.flatMap((item) =>
                      item.attributes.map((attribute, index) => (
                        <tr key={`${item.key}:${index}`}>
                          <td>
                            {item.name} v{item.version}
                          </td>
                          <td>{attribute.field}</td>
                          <td>
                            {attribute.value} {attribute.unit}
                          </td>
                          <td>
                            <button
                              className="text-accent"
                              onClick={() => {
                                const doc = documents.find(
                                  (candidate) => candidate.id === attribute.source?.document_id,
                                );
                                if (doc) setPreview(doc);
                              }}
                            >
                              {sourceLocation(attribute.source)} · {attribute.source?.original_value}
                            </button>
                          </td>
                        </tr>
                      )),
                    )}
                  </Table>
                  <Table headings={["상위 → 하위", "수량", "사용 조건"]}>
                    {graph.relations.map((relation, index) => (
                      <tr key={index}>
                        <td>
                          {relation.parent} → {relation.child}
                        </td>
                        <td>{relation.quantity}</td>
                        <td>{relation.condition}</td>
                      </tr>
                    ))}
                  </Table>
                </div>
              </details>
            )}
          </article>
        );
      })}
      {preview && <DocumentPreview document={preview} onClose={() => setPreview(null)} />}
    </div>
  );
};

export default HistoryTimeline;
