import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router";

import Badge from "~/components/badge";
import Button from "~/components/button";
import Check from "~/components/check";
import Field from "~/components/field";
import Notice from "~/components/notice";
import PageTitle from "~/components/page-title";
import Panel from "~/components/panel";
import Table from "~/components/table";
import DocumentUpload from "~/features/upload/document-upload";
import GraphEditor from "~/features/workspace/graph-editor";
import {
  documentPollInterval,
  getWorkspace,
  mergeDocumentCandidate,
  productNames,
  useWorkspaceAction,
} from "~/lib/api/workspace";
import type { CurrentUser, Graph, Item, Specification, WorkDocument } from "~/lib/api/workspace";

interface SpecificationEditorProps {
  specification: Specification;
  documents: WorkDocument[];
  user: CurrentUser;
}
const SpecificationEditor = ({ specification: spec, documents, user }: SpecificationEditorProps) => {
  const [graph, setGraph] = useState<Graph>(spec.graph);
  const [dirty, setDirty] = useState(false);
  const [reason, setReason] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [catalogId, setCatalogId] = useState("");
  const catalog = useQuery({
    queryKey: ["workspace", "items"],
    queryFn: () => getWorkspace<{ specification_id: string; item: Item }[]>("/items"),
  });
  const action = useWorkspaceAction();
  const navigate = useNavigate();
  const rd = user.department?.code === "research_and_development";
  const disabled = !rd || spec.status !== "draft";
  const readyDocuments = ["product_detail", "bom_transfer"].every((kind) =>
    documents.some((doc) => doc.kind === kind && doc.status === "parsed"),
  );
  const updateGraph = (value: Graph) => {
    setGraph(value);
    setDirty(true);
  };
  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Panel>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">원문과 사양·구성 확인</h2>
          <Badge status={spec.status} />
        </div>
        <GraphEditor
          graph={graph}
          onChange={updateGraph}
          documents={documents}
          disabled={disabled || action.isPending}
        />
        {!disabled && (
          <div className="border-line mt-5 grid gap-3 rounded-lg border p-4">
            <h3 className="text-sm font-semibold">확인된 공통 품목 연결</h3>
            <Field label="기존 품목코드·사양 버전">
              <select value={catalogId} onChange={(event) => setCatalogId(event.target.value)}>
                <option value="">공통 품목 선택</option>
                {catalog.data?.map((entry) => (
                  <option
                    key={`${entry.specification_id}:${entry.item.key}`}
                    value={`${entry.specification_id}:${entry.item.key}`}
                  >
                    {entry.item.code} v{entry.item.version} · {entry.item.name}{" "}
                    {entry.item.aliases.length ? `(${entry.item.aliases.join(", ")})` : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Button
              disabled={dirty || action.isPending || !catalogId}
              onClick={() => {
                const entry = catalog.data?.find(
                  (candidate) => `${candidate.specification_id}:${candidate.item.key}` === catalogId,
                );
                if (entry)
                  action.mutate({
                    path: `/specifications/${spec.id}/items`,
                    body: {
                      revision: spec.revision,
                      source_specification_id: entry.specification_id,
                      item_key: entry.item.key,
                    },
                  });
              }}
            >
              이 사양·하위 BOM·원문 근거 연결
            </Button>
            <p className="text-muted text-xs leading-6">
              편집 중인 값은 먼저 저장하세요. 가져온 품목은 상위 구성에 연결해야 제출할 수 있습니다. 사양 정의를
              공유하며 생산 건의 완료·합격은 새로 확인합니다.
            </p>
            {catalog.error && <Notice error={catalog.error} />}
          </div>
        )}
        <div className="border-line mt-6 grid gap-4 border-t pt-5">
          {!disabled && (
            <>
              <Check checked={reviewed} onChange={setReviewed}>
                전체 품목·사양·구성의 원문과 값·단위·수량·버전을 모두 대조했습니다.
              </Check>
              <Button
                disabled={!reviewed || action.isPending}
                onClick={() => {
                  updateGraph({
                    ...graph,
                    items: graph.items.map((item) => ({
                      ...item,
                      confirmed: true,
                      attributes: item.attributes.map((attribute) => ({ ...attribute, confirmed: true })),
                    })),
                    relations: graph.relations.map((relation) => ({ ...relation, confirmed: true })),
                  });
                  setReviewed(false);
                }}
              >
                전체 대조 확인을 작업본에 반영
              </Button>
            </>
          )}
          {action.error && <Notice error={action.error} />}
          {dirty && <Notice>저장하지 않은 변경이 있습니다. 작업본을 저장한 뒤 제출하세요.</Notice>}
          {!disabled && (
            <div className="flex flex-wrap gap-3">
              <Button
                disabled={action.isPending || !dirty}
                onClick={() =>
                  action.mutate(
                    { path: `/specifications/${spec.id}`, method: "put", body: { revision: spec.revision, graph } },
                    { onSuccess: () => setDirty(false) },
                  )
                }
              >
                작업본 저장
              </Button>
              <Button
                variant="primary"
                disabled={action.isPending || dirty || !readyDocuments}
                onClick={() =>
                  action.mutate({ path: `/specifications/${spec.id}/submit`, body: { revision: spec.revision } })
                }
              >
                {action.isPending ? "확인 중…" : "사양·BOM 확인 후 제출"}
              </Button>
            </div>
          )}
          {rd && spec.status === "submitted" && (
            <form
              className="grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                action.mutate(
                  {
                    path: "/specifications",
                    body: {
                      code: spec.code,
                      name: spec.name,
                      product_type: spec.product_type,
                      previous_id: spec.id,
                      reason,
                      graph: spec.graph,
                    },
                  },
                  { onSuccess: (next: Specification) => void navigate(`/specifications/${next.id}`) },
                );
              }}
            >
              <Field label="사양 변경 사유">
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  required
                  maxLength={2000}
                />
              </Field>
              <Button type="submit" disabled={action.isPending} variant="primary">
                이 버전에서 새 작업본 만들기
              </Button>
            </form>
          )}
        </div>
      </Panel>
      <div className="grid gap-5">
        <Panel>
          <h2 className="mb-4 font-semibold">제품 문서</h2>
          <DocumentUpload
            user={spec.status === "draft" ? user : { ...user, department: null }}
            documents={documents}
            specificationId={spec.id}
            onCandidate={
              !disabled
                ? (doc) => {
                    setGraph((current) => mergeDocumentCandidate(current, doc));
                    setDirty(true);
                    setReviewed(false);
                  }
                : undefined
            }
          />
        </Panel>
        <Panel>
          <h2 className="mb-4 font-semibold">근거 검색</h2>
          <div className="mb-4">
            <Badge status={spec.index_status} />
          </div>
          {spec.index_error && <Notice tone="error">{spec.index_error}</Notice>}
          <p className="text-muted my-3 text-sm leading-6">
            확정된 원문·사양·BOM을 Neo4j와 Ollama 임베딩으로 연결합니다.
          </p>
          <div className="flex flex-wrap gap-2">
            {rd && spec.status === "submitted" && (
              <Button
                disabled={action.isPending}
                onClick={() => action.mutate({ path: `/specifications/${spec.id}/index` })}
              >
                색인·재시도
              </Button>
            )}
            <Link className="inline-flex items-center px-2 py-2 text-sm" to={`/knowledge?specification=${spec.id}`}>
              근거에 질문하기 →
            </Link>
          </div>
        </Panel>
      </div>
    </div>
  );
};
const SpecificationPage = () => {
  const { specificationId } = useParams();
  const user = useOutletContext<CurrentUser>();
  const spec = useQuery({
    queryKey: ["workspace", "specification", specificationId],
    queryFn: () => getWorkspace<Specification>(`/specifications/${specificationId}`),
    refetchOnWindowFocus: false,
  });
  const documents = useQuery({
    queryKey: ["workspace", "documents", specificationId],
    queryFn: () => getWorkspace<WorkDocument[]>(`/documents?specification_id=${specificationId}`),
    refetchInterval: documentPollInterval,
  });
  const previous = useQuery({
    queryKey: ["workspace", "specification", spec.data?.previous_id],
    enabled: !!spec.data?.previous_id,
    queryFn: () => getWorkspace<Specification>(`/specifications/${spec.data?.previous_id}`),
  });
  if (spec.error || documents.error) return <Notice error={spec.error || documents.error} />;
  if (!spec.data || !documents.data) return <p role="status">사양과 원문을 불러오고 있습니다…</p>;
  return (
    <>
      <PageTitle
        title={spec.data.name}
        description={`${spec.data.code} · ${productNames[spec.data.product_type]} · 사양/BOM v${spec.data.version} · 편집 버전 ${spec.data.revision}`}
      >
        <Link to="/history">버전·제출 이력 →</Link>
      </PageTitle>
      <Panel className="mb-6">
        <p className="text-sm font-semibold">R&D부서 · ① 제품사양서 → ② BOM 및 양산 이관</p>
        <p className="text-muted mt-2 text-sm">
          두 문서의 사양·구성을 확인해 제출하면 품질부서의 ③ 구매 부품 수입검사로 이어집니다.
        </p>
      </Panel>
      {previous.data && (
        <Panel className="mb-6">
          <details>
            <summary className="text-sm font-semibold">이전 사양 v{previous.data.version}와 비교</summary>
            <Table headings={["품목 · 사양", "이전 값·버전", "현재 값·버전"]}>
              {spec.data.graph.items.flatMap((item) =>
                item.attributes.map((attribute) => {
                  const oldItem = previous.data!.graph.items.find((candidate) => candidate.code === item.code);
                  const old = oldItem?.attributes.find((candidate) => candidate.field === attribute.field);
                  return (
                    <tr key={`${item.key}:${attribute.field}`}>
                      <td>
                        {item.name} · {attribute.field}
                      </td>
                      <td>{old ? `${old.value} ${old.unit} · v${oldItem!.version}` : "신규"}</td>
                      <td>
                        {attribute.value} {attribute.unit} · v{item.version}
                      </td>
                    </tr>
                  );
                }),
              )}
            </Table>
          </details>
        </Panel>
      )}
      <SpecificationEditor
        key={`${spec.data.id}:${spec.data.revision}`}
        specification={spec.data}
        documents={documents.data}
        user={user}
      />
    </>
  );
};
export default SpecificationPage;

export const meta = () => [{ title: "사양·BOM · Ontomatic" }];
