import assert from "node:assert/strict";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  root: fileURLToPath(new URL("..", import.meta.url)),
  resolve: { tsconfigPaths: true },
  server: { middlewareMode: true, hmr: false },
});
after(() => server.close());
const { default: WorkflowProgress, getWorkflowSteps } = await server.ssrLoadModule(
  "/app/features/workspace/workflow-progress.tsx",
);
const { getTargetTask, getWorkflowTask } = await server.ssrLoadModule("/app/features/workspace/workflow-guidance.ts");
const { default: TaskGuide } = await server.ssrLoadModule("/app/features/workspace/task-guide.tsx");
const { default: WorkflowStepper } = await server.ssrLoadModule("/app/features/workspace/workflow-stepper.tsx");
const productionUser = { role: "general", department: { code: "production_management" } };
const target = (id, kind, extra = {}) => ({
  id,
  name: id,
  item_key: id,
  kind,
  status: "waiting",
  plan_version: 1,
  condition: kind === "material" ? "구매" : "",
  waiting_reasons: [],
  children: [],
  parents: [],
  round: 1,
  ...extra,
});
const document = (kind, ids, extra = {}) => ({
  job_id: "job",
  kind,
  status: "parsed",
  candidates: {},
  scope: { specification_id: "spec", plan_version: 1, round: 1, target_ids: ids },
  ...extra,
});
const materials = Array.from({ length: 14 }, (_, index) => target(`material-${index}`, "material"));
const first = Array.from({ length: 7 }, (_, index) =>
  target(`first-${index}`, "component", {
    instruction_group: `group-${Math.min(index, 5)}`,
    completion_id: `completion-${index}`,
  }),
);
const stages = [
  document(
    "work_instruction_module1",
    first.map((item) => item.id),
  ),
  document("work_instruction_lens", ["lens"]),
  document("work_instruction_body", ["body"]),
  document("work_instruction_final", ["final"]),
];
const makeJob = (targets) => ({
  id: "job",
  specification_id: "spec",
  plan_version: 1,
  status: "active",
  targets: Object.fromEntries(targets.map((item) => [item.id, item])),
});

await test("visual steps show the first unfinished stage even when a later stage is already complete", () => {
  const html = renderToStaticMarkup(
    createElement(WorkflowStepper, { steps: getWorkflowSteps(makeJob(materials), []), onNavigate: () => {} }),
  );
  assert.match(html, /현재 2 \/ 9단계 · 수입검사/);
  assert.match(html, /완료 2 \/ 9단계/);
  assert.equal((html.match(/aria-current="step"/g) ?? []).length, 1);
  assert.match(html, /aria-label="1단계 사양·BOM · 완료"/);
  assert.match(html, /aria-label="2단계 수입검사 · 현재 단계"/);
  assert.match(html, /aria-label="3단계 생산계획 · 완료"/);
  assert.match(html, /aria-label="4단계 1차 모듈 생산 · 대기"/);
});

await test("visual steps advance with inspection approval and show full completion without a current step", () => {
  const targets = [
    ...materials,
    ...first,
    target("lens", "assembly"),
    target("body", "assembly"),
    target("final", "product", { completion_id: "completion-final" }),
  ].map((item) => ({ ...item, status: "passed" }));
  const job = makeJob(targets);
  job.targets.final.status = "inspection";
  const render = () =>
    renderToStaticMarkup(
      createElement(WorkflowStepper, { steps: getWorkflowSteps(job, stages), onNavigate: () => {} }),
    );
  assert.match(render(), /현재 9 \/ 9단계 · 완제품 검사/);
  assert.match(render(), /완료 8 \/ 9단계/);
  job.targets.final.status = "passed";
  const html = render();
  assert.match(html, /전체 단계 완료/);
  assert.match(html, /완료 9 \/ 9단계/);
  assert.doesNotMatch(html, /aria-current|현재 단계/);
});

await test("shows all eleven documents in department order, fourteen purchased types, and the saved completion date", () => {
  const job = makeJob(materials);
  const steps = getWorkflowSteps(job, []);
  assert.match(steps[1].detail, /구매 14종/);
  assert.equal(
    steps.findIndex((step) => !step.done),
    1,
  );
  const html = renderToStaticMarkup(
    createElement(WorkflowProgress, {
      job,
      user: productionUser,
      documents: [],
      onNavigate: () => {},
      plans: [
        {
          version: 1,
          data: {
            lines: [],
            schedule: [{ end: "2026-11-12" }, { end: "2026-11-09" }],
          },
        },
      ],
    }),
  );
  for (const number of "①②③④⑤⑥⑦⑧⑨⑩⑪") assert.ok(html.includes(number));
  assert.match(html, /aria-current="step"/);
  assert.match(html, /완성 예정.*2026-11-12/);
  assert.ok(html.indexOf("R&amp;D부서") < html.indexOf("품질부서"));
});

await test("counts shared work-order rows once and requires quality approval after production completion", () => {
  const job = makeJob([...materials.map((item) => ({ ...item, status: "passed" })), ...first]);
  const steps = getWorkflowSteps(job, stages);
  assert.equal(steps[3].done, true);
  assert.match(steps[3].detail, /6공정/);
  assert.equal(steps[4].done, false);
  assert.equal(
    steps.findIndex((step) => !step.done),
    4,
  );
  assert.equal(steps[5].done, false);
});

await test("each second-module branch and final inspection have independent approval states", () => {
  const targets = [
    ...materials,
    ...first,
    target("lens", "assembly"),
    target("body", "assembly"),
    target("final", "product"),
  ].map((item) => ({ ...item, status: "passed" }));
  const job = makeJob(targets);
  job.targets.body.status = "inspection";
  assert.equal(getWorkflowSteps(job, stages)[6].done, false);
  job.targets.body.status = "partial";
  job.targets.final.status = "inspection";
  assert.equal(getWorkflowSteps(job, stages)[6].done, true);
  assert.equal(getWorkflowSteps(job, stages)[8].done, false);
  job.targets.final.status = "passed";
  assert.ok(getWorkflowSteps(job, stages).every((step) => step.done));
});

await test("ignores unrelated, unreadable, or superseded instructions while retaining valid unchanged targets after replanning", () => {
  const job = makeJob(first);
  const doc = stages[0];
  for (const invalid of [
    { ...doc, job_id: "another-job" },
    { ...doc, status: "error" },
    { ...doc, scope: { ...doc.scope, specification_id: "other" } },
    { ...doc, scope: { ...doc.scope, plan_version: 2 } },
  ])
    assert.equal(getWorkflowSteps(job, [invalid])[3].done, false);
  job.plan_version = 2;
  assert.equal(getWorkflowSteps(job, [doc])[3].done, true);
});

await test("does not invent a completion date before plan confirmation", () => {
  const html = renderToStaticMarkup(
    createElement(WorkflowProgress, {
      job: makeJob(materials),
      user: productionUser,
      documents: [],
      plans: [],
      onNavigate: () => {},
    }),
  );
  assert.match(html, /생산계획 확정 후 표시/);
  assert.doesNotMatch(html, /2026-11-12/);
});

await test("missing work instructions identify the department, exact document, screen, and upload steps", () => {
  for (const [kind, expected] of [
    ["component", "work_instruction_module1"],
    ["product", "work_instruction_final"],
  ]) {
    const item = target("part", kind, { waiting_reasons: ["해당 단계 작업 순서 연결 대기"] });
    const task = getTargetTask(makeJob([item]), item, []);
    assert.equal(task.department, "production_management");
    assert.equal(task.tab, "documents");
    assert.equal(task.kind, expected);
    assert.equal(task.targetId, item.id);
    assert.match(task.where, /문서 탭/);
    assert.match(task.how.join(" "), /문서 종류.*원본 파일.*문서 업로드/);
    assert.match(task.completion, /공정번호.*투입·산출/);
  }
});

await test("an existing production completion directs quality staff to inspection instead of asking for a work order", () => {
  const item = target("part", "component", {
    status: "inspection",
    waiting_reasons: ["해당 단계 작업 순서 연결 대기"],
  });
  const job = makeJob([item]);
  const report = document("inspection_module1", [item.id], { candidates: { status: "ready" } });
  const task = getTargetTask(job, item, [report]);
  assert.equal(task.department, "quality_assurance");
  assert.equal(task.tab, "quality");
  assert.equal(task.kind, "inspection_module1");
  assert.doesNotMatch(task.what, /작업 순서/);
  const unextracted = getTargetTask(job, item, [{ ...report, candidates: { status: "not_extracted" } }]);
  assert.equal(unextracted.tab, "documents");
  assert.match(unextracted.what, /후보 추출/);
  assert.match(unextracted.how[0], /연결된 검사성적서/);
});

await test("dependency guidance follows the actual blocker and keeps production ownership", () => {
  const parent = target("root", "product", { children: ["part"], waiting_reasons: ["part: 하위 대상 합격 대기"] });
  const child = target("part", "component", { waiting_reasons: ["해당 단계 작업 순서 연결 대기"] });
  const task = getTargetTask(makeJob([parent, child]), parent, []);
  assert.equal(task.kind, "work_instruction_module1");
  assert.equal(task.targetId, "part");
  assert.equal(task.department, "production_management");
  assert.equal(getWorkflowTask({ tab: "production", kind: "inspection_module1" }).department, "production_management");
  child.status = "passed";
  assert.equal(getTargetTask(makeJob([child]), child, []), null);
  const process = target("process", "component", { status: "producing" });
  const inventory = target("inventory", "component", { inventory_of: process.id });
  const inventoryTask = getTargetTask(makeJob([inventory, process]), inventory, []);
  assert.equal(inventoryTask.targetId, process.id);
  assert.equal(inventoryTask.department, "production_management");
});

await test("task guidance separates the responsible department from the viewing account", () => {
  const task = getWorkflowTask({ tab: "documents", kind: "work_instruction_module1", targetId: "part" });
  for (const user of [
    productionUser,
    { role: "system_admin", department: null },
    { role: "general", department: { code: "quality_assurance" } },
  ]) {
    const html = renderToStaticMarkup(createElement(TaskGuide, { task, user, onNavigate: () => {} }));
    assert.match(html, /누가 · 담당자.*생산관리 담당자/);
    assert.match(html, /어디서 · 이동 화면.*문서 탭/);
    assert.match(html, /어떻게 · 진행 방법/);
    assert.match(html, /무엇을 · 필요한 작업/);
    assert.match(html, /순서-05/);
    assert.match(html, /완료 기준/);
    if (user.department?.code === "production_management") {
      assert.match(html, /순서-05 연결하기/);
      assert.match(html, /직접 진행할 수 있습니다/);
    } else {
      assert.match(html, /조회만 가능합니다/);
      assert.doesNotMatch(html, /직접 진행할 수 있습니다/);
    }
  }
});

await test("production completion first requests quality-owned count evidence when no usable process row exists", () => {
  const item = target("process", "component", { process_code: "P-01", status: "producing" });
  const job = makeJob([item]);
  const missing = getTargetTask(job, item, []);
  assert.equal(missing.department, "quality_assurance");
  assert.equal(missing.tab, "documents");
  assert.match(missing.what, /원문 투입실적/);
  const report = document("inspection_module1", [item.id], {
    candidates: {
      status: "ready",
      data: { rows: [{ process_codes: "P-01", input_quantity: 10, good_quantity: 9, defect_quantity: 1, row: "2" }] },
    },
  });
  const ready = getTargetTask(job, item, [report]);
  assert.equal(ready.department, "production_management");
  assert.equal(ready.tab, "production");
  assert.match(ready.what, /생산 완료 기록/);
});
