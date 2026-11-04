import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";

import Badge from "~/components/badge";
import Button from "~/components/button";
import DocumentPreview from "~/components/document-preview";
import Empty from "~/components/empty";
import Field from "~/components/field";
import Notice from "~/components/notice";
import PageTitle from "~/components/page-title";
import Panel from "~/components/panel";
import apiClient from "~/lib/api/client";
import { getWorkspace, sourceLocation } from "~/lib/api/workspace";
import type { Job, Specification, WorkDocument } from "~/lib/api/workspace";

interface RagAnswer {
  answer: string;
  sources: {
    id: string;
    document_id: string;
    page: number | null;
    block_index?: number | null;
    row: string;
    text: string;
    score: number;
  }[];
  graph: {
    item_key: string;
    name: string;
    related_key: string;
    related_name: string;
    quantity: number;
    condition: string;
  }[];
}
const KnowledgePage = () => {
  const [params, setParams] = useSearchParams();
  const [question, setQuestion] = useState("");
  const [jobId, setJobId] = useState("");
  const [preview, setPreview] = useState<WorkDocument | null>(null);
  const specs = useQuery({
    queryKey: ["workspace", "specifications"],
    queryFn: () => getWorkspace<Specification[]>("/specifications"),
  });
  const jobs = useQuery({ queryKey: ["workspace", "jobs"], queryFn: () => getWorkspace<Job[]>("/jobs") });
  const docs = useQuery({
    queryKey: ["workspace", "documents"],
    queryFn: () => getWorkspace<WorkDocument[]>("/documents"),
  });
  const status = useQuery({
    queryKey: ["workspace", "rag-status"],
    queryFn: () => getWorkspace<{ enabled: boolean; embedding_model: string; graph_database: string }>("/rag/status"),
  });
  const selected = specs.data?.find((spec) => spec.id === params.get("specification"));
  const answer = useMutation({
    mutationFn: async () =>
      (
        await apiClient.post<RagAnswer>(
          "/api/v1/workspace/rag/ask",
          { question, specification_id: selected?.id, job_id: jobId || null },
          { timeout: 180_000 },
        )
      ).data,
  });
  return (
    <>
      <PageTitle title="근거 기반 질문" description="선택한 사양 버전의 원문과 BOM 관계를 함께 찾아 답변합니다." />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Panel>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              answer.mutate();
            }}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="사양·BOM 버전">
                <select
                  value={selected?.id ?? ""}
                  onChange={(event) => {
                    setParams({ specification: event.target.value });
                    setJobId("");
                    answer.reset();
                  }}
                >
                  <option value="">확인된 사양 선택</option>
                  {specs.data
                    ?.filter((spec) => spec.status === "submitted")
                    .map((spec) => (
                      <option key={spec.id} value={spec.id}>
                        {spec.name} v{spec.version}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="생산 건 (선택)">
                <select
                  value={jobId}
                  onChange={(event) => {
                    setJobId(event.target.value);
                    answer.reset();
                  }}
                >
                  <option value="">공통 사양만 질문</option>
                  {jobs.data
                    ?.filter((job) => job.specification_id === selected?.id)
                    .map((job) => (
                      <option key={job.id} value={job.id}>
                        {job.name}
                      </option>
                    ))}
                </select>
              </Field>
            </div>
            <Field label="궁금한 내용">
              <textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                minLength={2}
                maxLength={2000}
                required
                placeholder="예: 이 카메라의 렌즈 모듈은 어떤 재료로 구성되나요? 근거 페이지도 알려주세요."
              />
            </Field>
            <Button
              type="submit"
              variant="primary"
              disabled={answer.isPending || !selected || selected.index_status !== "ready" || !status.data?.enabled}
            >
              {answer.isPending ? "근거 검색·답변 중…" : "근거 찾아 질문하기"}
            </Button>
          </form>
          {(specs.error || jobs.error || docs.error || status.error) && (
            <div className="mt-4">
              <Notice error={specs.error || jobs.error || docs.error || status.error} />
            </div>
          )}
          {answer.error && (
            <div className="mt-4">
              <Notice error={answer.error} />
            </div>
          )}
          {answer.data ? (
            <div className="border-line mt-6 grid gap-5 border-t pt-6" aria-live="polite">
              <h2 className="font-semibold">근거 기반 답변</h2>
              <p className="text-sm leading-8 whitespace-pre-wrap">{answer.data.answer}</p>
              {answer.data.sources.map((source, index) => (
                <article key={source.id} className="border-line rounded-lg border p-4">
                  <button
                    className="text-accent text-left text-sm font-medium"
                    onClick={() => {
                      const doc = docs.data?.find((candidate) => candidate.id === source.document_id);
                      if (doc) setPreview(doc);
                    }}
                  >
                    [{index + 1}] {docs.data?.find((doc) => doc.id === source.document_id)?.filename ?? "원문"} ·{" "}
                    {sourceLocation(source)} / {source.row} ↗
                  </button>
                  <p className="text-muted mt-2 text-xs leading-6 whitespace-pre-wrap">{source.text}</p>
                </article>
              ))}
              {answer.data.graph.length > 0 && (
                <details>
                  <summary className="text-sm">함께 검색한 BOM 연결</summary>
                  <ul className="text-muted mt-3 grid gap-2 text-xs">
                    {answer.data.graph.map((edge, index) => (
                      <li key={index}>
                        {edge.name} ↔ {edge.related_name ?? "직접 연결 없음"}
                        {edge.quantity ? ` · ${edge.quantity} · ${edge.condition}` : ""}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          ) : (
            <Empty title="원문과 구성에 질문하세요">
              사양·BOM 버전을 고르면 해당 버전의 근거만 검색합니다. 생산 건을 선택하면 현재 생산·검사 상태도 함께
              확인합니다.
            </Empty>
          )}
        </Panel>
        <Panel>
          <h2 className="mb-4 font-semibold">검색 연결 상태</h2>
          <p className="mb-3 text-sm">Neo4j · {status.data?.embedding_model ?? "Ollama"}</p>
          <Badge status={selected?.index_status ?? "waiting"}>{selected ? undefined : "사양 선택 대기"}</Badge>
          {selected?.index_error && (
            <div className="mt-4">
              <Notice tone="error">{selected.index_error}</Notice>
            </div>
          )}
          <p className="text-muted my-4 text-sm leading-7">
            R&D 확인·제출 후 원문 임베딩과 BOM 관계를 색인합니다. 질문은 읽기 전용이며 업무 판정은 담당자 확인으로
            진행합니다.
          </p>
          {selected && (
            <Link to={`/specifications/${selected.id}`} className="text-sm">
              사양·색인 상태 확인 →
            </Link>
          )}
          {!status.data?.enabled && (
            <div className="mt-4">
              <Notice>GraphDB 연결이 아직 설정되지 않았습니다. 서버 연결 후 R&D에서 색인을 실행해 주세요.</Notice>
            </div>
          )}
        </Panel>
      </div>
      {preview && <DocumentPreview document={preview} onClose={() => setPreview(null)} />}
    </>
  );
};
export default KnowledgePage;

export const meta = () => [{ title: "근거 기반 질문 · Ontomatic" }];
