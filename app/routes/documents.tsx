import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";

import Badge from "~/components/badge";
import DocumentPreview from "~/components/document-preview";
import Empty from "~/components/empty";
import ExtractionProgress from "~/components/extraction-progress";
import Field from "~/components/field";
import Notice from "~/components/notice";
import PageTitle from "~/components/page-title";
import Panel from "~/components/panel";
import Table from "~/components/table";
import { dateTime, documentNames, documentPollInterval, getWorkspace } from "~/lib/api/workspace";
import type { WorkDocument } from "~/lib/api/workspace";

const DocumentsPage = () => {
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("");
  const [selected, setSelected] = useState<WorkDocument | null>(null);
  const docs = useQuery({
    queryKey: ["workspace", "documents"],
    queryFn: () => getWorkspace<WorkDocument[]>("/documents"),
    refetchInterval: documentPollInterval,
  });
  const rows =
    docs.data?.filter(
      (doc) => (!kind || doc.kind === kind) && doc.filename.toLowerCase().includes(search.toLowerCase()),
    ) ?? [];
  return (
    <>
      <PageTitle title="문서함" description="공통 사양과 생산 건의 원문·연결 범위·추출 상태를 확인하세요." />
      <Panel>
        <div className="mb-5 grid gap-3 sm:grid-cols-2">
          <Field label="파일명 검색">
            <input value={search} onChange={(event) => setSearch(event.target.value)} />
          </Field>
          <Field label="문서 종류">
            <select value={kind} onChange={(event) => setKind(event.target.value)}>
              <option value="">전체 종류</option>
              {Object.entries(documentNames).map(([value, name]) => (
                <option key={value} value={value}>
                  {name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {docs.error && <Notice error={docs.error} />}
        {docs.isPending ? (
          <p role="status">문서를 불러오는 중…</p>
        ) : !rows.length ? (
          <Empty title="연결된 문서가 없습니다">제품 작업본 또는 생산 건에서 담당 부서 문서를 업로드해 주세요.</Empty>
        ) : (
          <Table headings={["원본 문서", "종류·범위", "상태", "연결된 업무", "등록 시각"]}>
            {rows.map((doc) => (
              <tr key={doc.id}>
                <td>
                  <button className="text-accent font-medium" onClick={() => setSelected(doc)}>
                    {doc.filename} ↗
                  </button>
                </td>
                <td>
                  {documentNames[doc.kind]}
                  <p className="text-muted mt-1 text-xs">
                    {doc.scope.target_ids.length
                      ? `${doc.scope.target_ids.length}개 대상 · 회차 ${doc.scope.round} · 계획 v${doc.scope.plan_version}`
                      : "공통 사양 원문"}
                  </p>
                </td>
                <td>
                  <Badge status={doc.candidates.status === "extracting" ? "extracting" : doc.status} />
                  <ExtractionProgress candidates={doc.candidates} />
                </td>
                <td>
                  <Link
                    to={
                      doc.specification_id
                        ? `/specifications/${doc.specification_id}`
                        : `/jobs/${doc.job_id}?tab=documents`
                    }
                  >
                    업무 열기 →
                  </Link>
                </td>
                <td className="text-muted text-xs whitespace-nowrap">{dateTime(doc.created_at)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
      {selected && <DocumentPreview document={selected} onClose={() => setSelected(null)} />}
    </>
  );
};
export default DocumentsPage;

export const meta = () => [{ title: "문서함 · Ontomatic" }];
