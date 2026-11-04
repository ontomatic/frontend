import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import Field from "~/components/field";
import HistoryTimeline from "~/components/history-timeline";
import Notice from "~/components/notice";
import PageTitle from "~/components/page-title";
import Panel from "~/components/panel";
import { getWorkspace } from "~/lib/api/workspace";
import type { WorkDocument, WorkflowEvent } from "~/lib/api/workspace";

const HistoryPage = () => {
  const [scope, setScope] = useState("all");
  const events = useQuery({
    queryKey: ["workspace", "events"],
    queryFn: () => getWorkspace<WorkflowEvent[]>("/events"),
  });
  const docs = useQuery({
    queryKey: ["workspace", "documents"],
    queryFn: () => getWorkspace<WorkDocument[]>("/documents"),
  });
  return (
    <>
      <PageTitle title="버전·이력" description="사양 제출본, 계획 버전, 생산·검사회차와 당시 근거를 조회하세요." />
      <Panel>
        <Field label="조회 범위" className="mb-6 max-w-xs">
          <select value={scope} onChange={(event) => setScope(event.target.value)}>
            <option value="all">전체 기록</option>
            <option value="specifications">사양·제출본</option>
            <option value="jobs">생산·검사·계획</option>
          </select>
        </Field>
        {events.error || docs.error ? (
          <Notice error={events.error || docs.error} />
        ) : events.isPending ? (
          <p role="status">이력을 불러오는 중…</p>
        ) : (
          <HistoryTimeline
            events={
              events.data?.filter(
                (event) => scope === "all" || (scope === "specifications" ? !!event.specification_id : !!event.job_id),
              ) ?? []
            }
            documents={docs.data}
          />
        )}
      </Panel>
    </>
  );
};
export default HistoryPage;

export const meta = () => [{ title: "버전·이력 · Ontomatic" }];
