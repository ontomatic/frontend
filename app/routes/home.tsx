import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useOutletContext, useSearchParams } from "react-router";

import Badge from "~/components/badge";
import Button from "~/components/button";
import Empty from "~/components/empty";
import Field from "~/components/field";
import Modal from "~/components/modal";
import Notice from "~/components/notice";
import PageTitle from "~/components/page-title";
import Panel from "~/components/panel";
import Table from "~/components/table";
import { getNextTarget, getWorkspace, kindNames, productNames, useWorkspaceAction } from "~/lib/api/workspace";
import type { CurrentUser, Job, Specification } from "~/lib/api/workspace";

export const meta = () => [{ title: "워크스페이스 · Ontomatic" }];
const Home = () => {
  const user = useOutletContext<CurrentUser>();
  const [params, setParams] = useSearchParams();
  const view = params.get("view") ?? "all";
  const search = params.get("q")?.toLowerCase() ?? "";
  const [modal, setModal] = useState<"specification" | "job" | null>(null);
  const [type, setType] = useState("digital");
  const specs = useQuery({
    queryKey: ["workspace", "specifications"],
    queryFn: () => getWorkspace<Specification[]>("/specifications"),
  });
  const jobs = useQuery({ queryKey: ["workspace", "jobs"], queryFn: () => getWorkspace<Job[]>("/jobs") });
  const action = useWorkspaceAction();
  const navigate = useNavigate();
  const submitted = specs.data?.filter((spec) => spec.status === "submitted") ?? [];
  const filteredSpecs =
    specs.data?.filter(
      (spec) =>
        (view !== "rd" || spec.status === "draft") &&
        `${spec.name} ${spec.code} ${spec.graph.items.flatMap((item) => [item.name, item.code, ...item.aliases]).join(" ")}`
          .toLowerCase()
          .includes(search),
    ) ?? [];
  const filteredJobs =
    jobs.data?.filter(
      (job) =>
        `${job.name} ${job.product_name} ${job.product_code} ${job.id}`.toLowerCase().includes(search) &&
        (view !== "quality" ||
          Object.values(job.targets).some((target) => ["waiting", "inspection", "held"].includes(target.status))),
    ) ?? [];
  const showSpecs = ["all", "specifications", "rd"].includes(view);
  const showJobs = !["specifications", "rd"].includes(view);
  const title =
    view === "rd"
      ? "R&D 확인"
      : view === "quality"
        ? "품질관리"
        : view === "production"
          ? "생산·계획"
          : view === "specifications"
            ? "제품·사양"
            : view === "jobs"
              ? "구성·생산 건"
              : "워크스페이스";
  const department = user.department?.code;
  return (
    <>
      <PageTitle title={title} description="확인된 사양과 생산 건별 다음 작업을 확인하세요.">
        <div className="flex gap-2">
          {department === "research_and_development" && (
            <Button variant="primary" onClick={() => setModal("specification")}>
              ＋ 새 제품
            </Button>
          )}
          {department === "production_management" && (
            <Button variant="primary" disabled={!submitted.length} onClick={() => setModal("job")}>
              ＋ 생산 건 만들기
            </Button>
          )}
        </div>
      </PageTitle>
      <div className="border-line mb-6 flex gap-1 overflow-x-auto border-b" aria-label="조회 범위">
        {[
          ["all", "전체"],
          ["specifications", "제품·사양"],
          ["jobs", "생산 건"],
          ["rd", "R&D 확인"],
          ["quality", "품질 대기"],
        ].map(([value, label]) => (
          <button
            key={value}
            onClick={() => setParams({ view: value, ...(search ? { q: search } : {}) })}
            className={`shrink-0 border-b-2 px-4 py-3 text-sm ${view === value ? "text-accent border-orange-400 font-semibold" : "text-muted border-transparent"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {(specs.error || jobs.error) && <Notice error={specs.error || jobs.error} />}
      {(specs.isPending || jobs.isPending) && (
        <p role="status" className="text-muted py-8">
          업무 목록을 불러오고 있습니다…
        </p>
      )}
      <div className="grid gap-6">
        {showSpecs && (
          <Panel>
            <div className="mb-5 flex justify-between">
              <h2 className="font-semibold">제품 사양·BOM</h2>
              <span className="text-muted text-sm">{filteredSpecs.length}개 버전</span>
            </div>
            {!filteredSpecs.length ? (
              <Empty title={search ? "검색 결과가 없습니다" : "제품사양서에서 시작하세요"}>
                R&D가 제품 작업본을 만들고 제품사양서를 연결하면 사양·구성을 확인할 수 있습니다.
              </Empty>
            ) : (
              <Table headings={["제품", "종류", "사양·편집 버전", "상태", "다음 작업"]}>
                {filteredSpecs.map((spec) => (
                  <tr key={spec.id} className="hover:bg-orange-50/40">
                    <td>
                      <Link to={`/specifications/${spec.id}`} className="text-ink font-semibold">
                        {spec.name}
                      </Link>
                      <p className="text-muted mt-1 text-xs">{spec.code}</p>
                    </td>
                    <td>{productNames[spec.product_type]}</td>
                    <td>
                      v{spec.version} · 편집 {spec.revision}
                    </td>
                    <td>
                      <Badge status={spec.status} />
                    </td>
                    <td>
                      <Link to={`/specifications/${spec.id}`}>
                        {spec.status === "draft" ? "원문·후보 확인 →" : "사양·BOM 조회 →"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </Panel>
        )}
        {showJobs && (
          <Panel>
            <div className="mb-5 flex justify-between">
              <h2 className="font-semibold">완제품 생산 건</h2>
              <span className="text-muted text-sm">{filteredJobs.length}건</span>
            </div>
            {!filteredJobs.length ? (
              <Empty title={search ? "검색 결과가 없습니다" : "아직 생산 건이 없습니다"}>
                생산관리가 R&D 확인을 마친 사양·BOM 버전으로 생산 건을 만듭니다. 같은 사양의 생산 건도 수량·검사·완료
                상태를 독립적으로 관리합니다.
              </Empty>
            ) : (
              <Table headings={["생산 건", "수량", "진행", "다음 작업"]}>
                {filteredJobs.map((job) => {
                  const targets = Object.values(job.targets);
                  const next = getNextTarget(job, department);
                  const nextTab =
                    job.plan_version === 0 && department === "production_management"
                      ? "plan"
                      : department === "quality_assurance"
                        ? "quality"
                        : department === "production_management"
                          ? "production"
                          : "graph";
                  const nextUrl = `/jobs/${job.id}?tab=${nextTab}${next ? `&target=${encodeURIComponent(next.id)}` : ""}`;
                  return (
                    <tr key={job.id} className="hover:bg-orange-50/40">
                      <td>
                        <Link to={nextUrl} className="text-ink font-semibold">
                          {job.name}
                        </Link>
                        <p className="text-muted mt-1 text-xs">
                          {job.product_code} v{job.specification_version} · {job.id.slice(0, 8)}
                        </p>
                      </td>
                      <td>
                        {job.quantity.toLocaleString()}{" "}
                        {job.production_result?.unit ??
                          targets.find((target) => target.kind === "product")?.unit ??
                          "개"}
                        <p className="text-muted mt-1 text-xs">
                          계획 {job.plan_version ? `v${job.plan_version}` : "미확정"}
                        </p>
                      </td>
                      <td>
                        <Badge status={job.status} />
                        <p className="text-muted mt-2 text-xs">
                          구성 {targets.filter((target) => ["passed", "partial"].includes(target.status)).length}/
                          {targets.length} 양품 승인
                        </p>
                      </td>
                      <td>
                        <Link to={nextUrl}>{next ? `${kindNames[next.kind]} · ${next.name}` : "완료 기록 보기"} →</Link>
                        <p className="text-muted mt-1 max-w-60 text-xs">{next?.waiting_reasons[0]}</p>
                      </td>
                    </tr>
                  );
                })}
              </Table>
            )}
          </Panel>
        )}
      </div>
      {modal && (
        <Modal
          title={modal === "job" ? "완제품 생산 건 만들기" : "새 제품 작업본"}
          onClose={() => {
            setModal(null);
            action.reset();
          }}
        >
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              if (modal === "job")
                action.mutate(
                  {
                    path: "/jobs",
                    body: {
                      name: form.get("name"),
                      specification_id: form.get("specification_id"),
                      quantity: Number(form.get("quantity")),
                    },
                  },
                  { onSuccess: (data: Job) => void navigate(`/jobs/${data.id}`) },
                );
              else {
                const code = form.get("code") as string;
                const name = form.get("name") as string;
                action.mutate(
                  {
                    path: "/specifications",
                    body: {
                      code,
                      name,
                      product_type: type,
                      graph: {
                        root: `${code}@1`,
                        items: [{ key: `${code}@1`, code, name, kind: "product", version: 1, unit: "개" }],
                        relations: [],
                      },
                    },
                  },
                  { onSuccess: (data: Specification) => void navigate(`/specifications/${data.id}`) },
                );
              }
            }}
          >
            <Field label={modal === "job" ? "생산 건 이름" : "제품명"}>
              <input
                name="name"
                required
                maxLength={150}
                placeholder={modal === "job" ? "예: 디지털 카메라 11월 1차" : "제품사양서의 제품명"}
              />
            </Field>
            {modal === "job" ? (
              <>
                <Field label="확인된 사양·BOM 버전">
                  <select name="specification_id" required>
                    {submitted.map((spec) => (
                      <option key={spec.id} value={spec.id}>
                        {spec.name} · {spec.code} v{spec.version}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="목표 수량">
                  <input name="quantity" type="number" min="1" max="1000000000" step="1" required />
                </Field>
              </>
            ) : (
              <>
                <Field label="제품 코드">
                  <input name="code" required pattern="[A-Za-z0-9._-]+" maxLength={80} placeholder="예: CAM-DIG-001" />
                </Field>
                <Field label="제품 종류">
                  <select value={type} onChange={(event) => setType(event.target.value)}>
                    {Object.entries(productNames).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Notice>작업본은 미확인 상태로 생성됩니다. 제품사양서를 연결한 뒤 사양과 BOM을 확인해 주세요.</Notice>
              </>
            )}
            {action.error && <Notice error={action.error} />}
            <Button type="submit" variant="primary" disabled={action.isPending}>
              {action.isPending ? "저장 중…" : "만들기"}
            </Button>
          </form>
        </Modal>
      )}
    </>
  );
};
export default Home;
