import assert from "node:assert/strict";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  root: fileURLToPath(new URL("..", import.meta.url)),
  resolve: { tsconfigPaths: true },
  server: { middlewareMode: true, hmr: false },
});
after(() => server.close());
const { default: JobPage } = await server.ssrLoadModule("/app/routes/job.tsx");
const targets = [
  { id: "material", code: "MAT-01", name: "렌즈 소재", kind: "material", status: "waiting", condition: "구매" },
  { id: "component", code: "MOD-01", name: "1차 모듈", kind: "component", status: "producing", condition: "가공" },
  { id: "ready", code: "MOD-02", name: "착수 대상", kind: "component", status: "waiting" },
  {
    id: "blocked",
    code: "MOD-03",
    name: "선행 승인 대기",
    kind: "component",
    status: "waiting",
    waiting_reasons: ["하위 대상 합격 대기"],
  },
  {
    id: "inspection",
    code: "MOD-04",
    name: "검사 대상",
    kind: "component",
    status: "inspection",
    completion_id: "completion",
  },
  {
    id: "inspection-blocked",
    code: "MOD-05",
    name: "검사 선행 승인 대기",
    kind: "component",
    status: "inspection",
    completion_id: "completion",
    waiting_reasons: ["하위 대상 합격 대기"],
  },
  { id: "passed", code: "MAT-02", name: "승인 완료", kind: "material", status: "passed" },
  { id: "partial", code: "MOD-06", name: "양품 승인 완료", kind: "component", status: "partial" },
  { id: "physical", code: "MAT-03", name: "실물 보완", kind: "material", status: "held", issue: { cause: "physical" } },
  {
    id: "specification",
    code: "MOD-07",
    name: "사양 보완",
    kind: "component",
    status: "held",
    issue: { cause: "specification" },
  },
  { id: "evidence", code: "MAT-04", name: "증빙 보완", kind: "material", status: "held", issue: { cause: "evidence" } },
  {
    id: "inventory",
    code: "INV-01",
    name: "자동 집계 재고",
    kind: "component",
    status: "producing",
    inventory_of: "component",
  },
].map((target) => ({
  condition: "",
  item_key: target.id,
  version: 1,
  round: 1,
  plan_version: 1,
  quantity: 100,
  unit: "개",
  children: [],
  parents: [],
  waiting_reasons: [],
  ...target,
}));
const job = {
  id: "job",
  name: "생산 건",
  product_code: "PRODUCT-01",
  specification_id: "spec",
  specification_version: 1,
  revision: 1,
  quantity: 100,
  plan_version: 1,
  status: "active",
  targets: Object.fromEntries(targets.map((target) => [target.id, target])),
};
const render = (tab, selected, all = false, currentJob = job) => {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  client.setQueryData(["workspace", "job", "job"], currentJob);
  for (const kind of ["documents", "plans", "events"]) client.setQueryData(["workspace", kind, "job"], []);
  client.setQueryData(["workspace", "specifications"], []);
  const user = {
    role: "general",
    department: { code: tab === "quality" ? "quality_assurance" : "production_management" },
  };
  const router = createMemoryRouter(
    [
      {
        element: createElement(Outlet, { context: user }),
        children: [{ path: "/jobs/:jobId", element: createElement(JobPage) }],
      },
    ],
    { initialEntries: [`/jobs/job?tab=${tab}${selected ? `&target=${selected}` : ""}${all ? "&items=all" : ""}`] },
  );
  try {
    return renderToStaticMarkup(
      createElement(QueryClientProvider, { client }, createElement(RouterProvider, { router })),
    );
  } finally {
    router.dispose();
    client.clear();
  }
};

const listedTargets = (html) =>
  [...html.matchAll(/aria-haspopup="dialog"[^>]*>([^<]+)<\/button>/g)].map((match) => match[1]);

await test("production and quality default to their current tasks, keeping completed, blocked, and inventory items out", () => {
  for (const [tab, expected] of [
    ["production", ["1차 모듈", "착수 대상", "실물 보완", "사양 보완"]],
    ["quality", ["렌즈 소재", "검사 대상", "증빙 보완"]],
  ]) {
    const html = render(tab);
    assert.match(html, /작업 대상 검색/);
    assert.match(html, /max-h-\[60dvh\]/);
    assert.deepEqual(listedTargets(html), expected);
    assert.match(html, /aria-pressed="true"[^>]*>현재 처리할 품목/);
    assert.doesNotMatch(html, /<dialog|name="standard"|수량 확인·생산 완료/);
    assert.match(html, /<details[^>]*><summary[^>]*>현재 2 \/ 9단계/);
  }
});

await test("all items includes completed, blocked, and inventory rows in both tabs", () => {
  for (const tab of ["production", "quality"]) {
    const html = render(tab, undefined, true);
    assert.deepEqual(
      listedTargets(html),
      targets.map((target) => target.name),
    );
    assert.match(html, /aria-pressed="true"[^>]*>전체 품목/);
  }
});

await test("an empty current queue keeps all items available and explains where to find them", () => {
  const completedJob = { ...job, targets: { material: { ...targets[0], status: "passed" } } };
  for (const tab of ["production", "quality"]) {
    const html = render(tab, undefined, false, completedJob);
    assert.deepEqual(listedTargets(html), []);
    assert.match(html, /현재 처리할 품목이 없습니다/);
    assert.match(html, /전체 품목 \(1\)/);
  }
});

await test("direct links open the selected production or inspection form in a named dialog", () => {
  const production = render("production", "component");
  assert.match(production, /<dialog[^>]*aria-label="생산 완료 · 1차 모듈"/);
  assert.match(production, /완료 수량 \(개\)/);
  assert.match(production, /수량 확인·생산 완료/);
  const quality = render("quality", "material");
  assert.match(quality, /<dialog[^>]*aria-label="품질관리 · 렌즈 소재"/);
  assert.match(quality, /name="standard"/);
  assert.match(quality, /<details[^>]*><summary>작업 안내 · 담당 부서와 진행 방법<\/summary>/);
  assert.match(quality, /대상·버전·회차·증빙 범위·기준·결과를 원문과 대조했습니다/);
});
