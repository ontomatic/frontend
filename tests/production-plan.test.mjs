import assert from "node:assert/strict";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
const { getPlanCandidates, applyPlanCandidate, getDocumentSchedule } = await server.ssrLoadModule(
  "/app/features/workspace/plan-candidates.ts",
);
const { getProcessCountCandidates } = await server.ssrLoadModule("/app/lib/api/workspace.ts");
const { getGanttData } = await server.ssrLoadModule("/app/features/workspace/gantt-tasks.ts");
const { default: ProductionPlan } = await server.ssrLoadModule("/app/features/workspace/production-plan.tsx");
const { default: GanttChart } = await server.ssrLoadModule("/app/components/gantt-chart.tsx");
const job = { specification_id: "spec", plan_version: 0, targets: {} };
const document = {
  id: "plan-doc",
  kind: "production_plan",
  scope: { specification_id: "spec", plan_version: 1, target_ids: ["target"] },
  candidates: {
    status: "ready",
    data: {
      rows: [
        {
          품목: "경통 공정",
          process: "D100-03 경통 가공",
          assignee: "작업자",
          start_date: "2026-11-02",
          end_date: "2026-11-05",
          block_index: 10,
          page: null,
          row: "4",
        },
      ],
    },
  },
};
const line = {
  target_id: "target",
  process: "",
  track: "",
  quantity: 120,
  unit: "개",
  duration: 0,
  duration_unit: "minute",
  time_basis: "batch",
  resource: "",
  start: "",
  end: "",
  predecessors: [],
  sources: [],
};

await test("loads Korean production-plan rows without internal target IDs and applies an explicitly selected row", () => {
  const candidates = getPlanCandidates(job, [document]);
  assert.equal(candidates.length, 1);
  const applied = applyPlanCandidate(line, candidates[0]);
  assert.equal(applied.target_id, "target");
  assert.equal(applied.process, "D100-03 경통 가공");
  assert.equal(applied.track, "경통 공정");
  assert.equal(applied.resource, "작업자");
  assert.equal(applied.quantity, 120);
  assert.equal(applied.duration, 0);
  assert.equal(applied.start, "");
  assert.equal(applied.end, "");
  assert.deepEqual(applied.sources, [{ document_id: "plan-doc", page: null, block_index: 10, row: "4" }]);
  assert.equal(line.process, "");
});

const dailyRows = [
  {
    품목: "경통 공정",
    수량: "120대분",
    start_date: "2026-11-02",
    end_date: "2026-11-05",
    block_index: 6,
    row: "2",
  },
  { 품목: "카메라", 수량: "120대", start_date: "2026-11-06", end_date: "2026-11-06", block_index: 6, row: "3" },
  {
    process_codes: "D100-03",
    process: "경통 가공",
    start_date: "2026-11-02",
    end_date: "2026-11-05",
    working_days: "4",
    "선행 작업": "—",
    block_index: 8,
    row: "2",
  },
  {
    process_codes: "D100-16",
    process: "최종 결합·검사",
    start_date: "2026-11-06",
    end_date: "2026-11-06",
    working_days: "1",
    "선행 작업": "D100-03",
    block_index: 8,
    row: "3",
  },
  {
    품목: "경통 공정",
    process: "D100-03 경통 가공",
    raw_time_range: "2026-11-02\n~ 2026-11-05",
    process_owner: "책임자",
    assignee: "담당자",
    assistants: "보조자",
    headcount: "3",
    block_index: 10,
    row: "2",
  },
  { 품목: "완제품 공정", process: "D100-16 최종 결합·검사", assignee: "조립 담당자", block_index: 10, row: "3" },
];
const dailyDocument = {
  ...document,
  file_id: 42,
  candidates: { status: "ready", data: { rows: dailyRows } },
};

await test("joins summary, schedule, and worker tables by process code without inventing hours", () => {
  const { entries, quantity, warnings } = getDocumentSchedule(getPlanCandidates(job, [dailyDocument]));
  assert.equal(entries.length, 4);
  assert.equal(quantity, 120);
  assert.deepEqual(warnings, []);
  const operation = entries.find((entry) => entry.code === "D100-03");
  assert.equal(operation.process, "경통 가공");
  assert.equal(operation.track, "경통 공정");
  assert.equal(operation.quantity, "120대분");
  assert.equal(operation.working_days, 4);
  assert.equal(operation.resource, "담당자");
  assert.equal(operation.owner, "책임자");
  assert.equal(operation.assistants, "보조자");
  assert.equal(operation.headcount, 3);
  assert.deepEqual(
    operation.sources.map(({ block_index, row }) => [block_index, row]),
    [
      [8, "2"],
      [10, "2"],
      [6, "2"],
    ],
  );
  assert.equal(operation.start, "2026-11-02");
  assert.equal(operation.end, "2026-11-05");
  assert.equal("duration" in operation, false);
  assert.equal("target_id" in operation, false);
  const sameDay = entries.find((entry) => entry.code === "D100-16");
  assert.equal(sameDay.start, sameDay.end);
  assert.deepEqual(sameDay.predecessors, ["D100-03"]);
});

await test("does not multiply schedules when one original is linked to several targets", () => {
  const broad = { ...dailyDocument, id: "broad", scope: { ...document.scope, target_ids: ["target", "other"] } };
  const schedule = getDocumentSchedule(getPlanCandidates(job, [dailyDocument, broad]));
  assert.equal(schedule.entries.length, 4);
  assert.ok(schedule.entries.every((entry) => entry.sources.every((source) => source.document_id === "broad")));
});

await test("keeps different originals separate and only joins exact process codes within each original", () => {
  const unrelated = {
    ...dailyDocument,
    id: "other-original",
    file_id: 43,
    candidates: { status: "ready", data: { rows: dailyRows.map((row) => ({ ...row, assignee: "다른 원본 담당자" })) } },
  };
  const entries = getDocumentSchedule(getPlanCandidates(job, [dailyDocument, unrelated])).entries;
  assert.equal(entries.length, 8);
  assert.equal(entries.find((entry) => entry.code === "D100-03").resource, "담당자");
  const ambiguous = {
    ...dailyDocument,
    candidates: { status: "ready", data: { rows: [dailyRows[2], { ...dailyRows[4], process: "D100-030 다른 공정" }] } },
  };
  const entry = getDocumentSchedule(getPlanCandidates(job, [ambiguous])).entries[0];
  assert.equal(entry.resource, "");
  assert.equal(entry.sources.length, 1);
});

await test("reports invalid dates instead of silently normalizing or reversing them", () => {
  const invalid = {
    ...dailyDocument,
    candidates: {
      status: "ready",
      data: {
        rows: [
          { ...dailyRows[2], start_date: "2026-02-30" },
          { ...dailyRows[3], start_date: "2026-11-08", end_date: "2026-11-06" },
        ],
      },
    },
  };
  const { entries, warnings } = getDocumentSchedule(getPlanCandidates(job, [invalid]));
  assert.equal(entries.length, 0);
  assert.equal(warnings.length, 2);
});

await test("daily Gantt tasks include the last day and keep same-day tasks visible without changing saved dates", () => {
  const { entries } = getDocumentSchedule(getPlanCandidates(job, [dailyDocument]));
  const original = structuredClone(entries);
  const { tasks } = getGanttData(entries);
  const operation = tasks.find((task) => task.text.startsWith("D100-03 "));
  assert.equal(operation.start.getDate(), 2);
  assert.equal(operation.end.getDate(), 6);
  const sameDay = tasks.find((task) => task.text.startsWith("D100-16 "));
  assert.equal(sameDay.start.getHours(), 0);
  assert.equal(sameDay.start.getDate(), 6);
  assert.equal(sameDay.end.getDate(), 7);
  assert.ok(sameDay.end > sameDay.start);
  const monthEnd = getGanttData([{ ...entries[0], start: "2026-12-31", end: "2026-12-31" }]).tasks.find(
    (task) => task.type === "task",
  );
  assert.equal(monthEnd.end.getFullYear(), 2027);
  assert.equal(monthEnd.end.getMonth(), 0);
  assert.equal(monthEnd.end.getDate(), 1);
  assert.deepEqual(entries, original);
});

await test("hourly Gantt tasks preserve KST clock times, minutes, and seconds without adding a day", () => {
  const timed = { ...line, start: "2026-11-02T09:15:30+09:00", end: "2026-11-02T00:45:45Z" };
  const original = structuredClone(timed);
  const task = getGanttData([timed]).tasks.find((task) => task.type === "task");
  assert.equal(task.start.getDate(), 2);
  assert.equal(task.start.getHours(), 9);
  assert.equal(task.start.getMinutes(), 15);
  assert.equal(task.start.getSeconds(), 30);
  assert.equal(task.end.getDate(), 2);
  assert.equal(task.end.getHours(), 9);
  assert.equal(task.end.getMinutes(), 45);
  assert.equal(task.end.getSeconds(), 45);
  assert.deepEqual(timed, original);
  assert.deepEqual(getGanttData([]), { tasks: [] });
});

await test("Gantt keeps one flat row per entry in source order without summaries, parents, or dependency links", () => {
  const { entries } = getDocumentSchedule(getPlanCandidates(job, [dailyDocument]));
  const original = structuredClone(entries);
  const data = getGanttData(entries);
  const { tasks } = data;
  assert.equal(tasks.length, entries.length);
  assert.deepEqual(
    tasks.map((task) => task.id),
    [1, 2, 3, 4],
  );
  assert.deepEqual(
    tasks.map((task) => task.text),
    entries.map((entry) => `${entry.code} ${entry.process}`.trim()),
  );
  assert.ok(tasks.every((task) => task.type === "task" && !("parent" in task) && !("open" in task)));
  assert.equal("links" in data, false);
  assert.deepEqual(entries, original);
});

await test("Gantt header shows actual months across year boundaries and keeps an inclusive same-day month", () => {
  for (const [start, end, expected] of [
    ["2026-11-02", "2026-11-30", "2026.11"],
    ["2026-12-31", "2027-01-02", "2026.12–2027.01"],
    ["2026-12-31", "2026-12-31", "2026.12"],
  ]) {
    const { entries } = getDocumentSchedule(getPlanCandidates(job, [dailyDocument]));
    const { tasks } = getGanttData([{ ...entries[0], start, end }]);
    const html = renderToStaticMarkup(
      createElement(GanttChart, { tasks, unit: "day", label: "계획", onSelect: () => {} }),
    );
    assert.ok(html.includes(expected));
    assert.doesNotMatch(html, /aria-colcount/);
    assert.match(html, /height:240px/);
    assert.doesNotMatch(html, /Invalid Date/);
  }
  const empty = renderToStaticMarkup(
    createElement(GanttChart, { tasks: [], unit: "day", label: "계획", onSelect: () => {} }),
  );
  assert.match(empty, /공정명/);
  assert.doesNotMatch(empty, /Invalid Date/);
});

await test("selected Gantt layout hides the name grid and keeps adjustable day and hour cells", () => {
  const tasks = [{ id: 1, text: "D100-01 소재 준비", start: new Date(2026, 10, 2), end: new Date(2026, 10, 5) }];
  for (const [unit, label] of [
    ["day", "날짜 셀 너비"],
    ["hour", "시간 셀 너비"],
  ]) {
    const html = renderToStaticMarkup(createElement(GanttChart, { tasks, unit, label: "계획", onSelect: () => {} }));
    assert.doesNotMatch(html, /aria-colcount/);
    assert.match(html, /type="range"/);
    assert.match(html, /min="24" max="160" step="4"/);
    assert.match(html, /class="gantt-scale-controls"/);
    assert.match(html, /aria-valuetext="100px" value="100"/);
    assert.match(html, /<output[^>]*>100px<\/output>/);
    assert.ok(html.includes(label));
    assert.equal((html.match(/class="[^"]*\bwx-row\b/g) || []).length, 2);
    const fiveRows = renderToStaticMarkup(
      createElement(GanttChart, {
        tasks: Array.from({ length: 5 }, (_, id) => ({ ...tasks[0], id: id + 1 })),
        unit,
        label: "계획",
        onSelect: () => {},
      }),
    );
    assert.match(fiveRows, /height:296px/);
  }
});

await test("track colors and labels survive filtering without changing source entries", () => {
  const { entries } = getDocumentSchedule(getPlanCandidates(job, [dailyDocument]));
  const source = entries.map((entry, index) => ({ ...entry, track: ["경통", "렌즈", "경통", ""][index] }));
  const original = structuredClone(source);
  const all = getGanttData(source).tasks;
  assert.equal(all[0].colorIndex, all[2].colorIndex);
  assert.notEqual(all[0].colorIndex, all[1].colorIndex);
  const filtered = getGanttData(
    source.filter((entry) => entry.track === "렌즈"),
    source,
  ).tasks;
  assert.equal(filtered[0].colorIndex, all[1].colorIndex);
  assert.equal(filtered[0].track, "렌즈");
  assert.equal(all[3].track, "트랙 미기재");
  assert.deepEqual(source, original);
  const html = renderToStaticMarkup(
    createElement(GanttChart, { tasks: all, unit: "day", label: "계획", onSelect: () => {} }),
  );
  assert.match(html, /aria-label="트랙별 막대 색상"/);
  assert.match(html, /gantt-track-0/);
  assert.match(html, /gantt-track-1/);
  assert.match(html, /트랙 미기재/);
});

await test("a saved daily plan reloads as a SVAR Gantt with joined worker details", () => {
  const { entries } = getDocumentSchedule(getPlanCandidates(job, [dailyDocument]));
  const queryClient = new QueryClient();
  try {
    const html = renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(ProductionPlan, {
          job: { ...job, plan_version: 1 },
          documents: [dailyDocument],
          canEdit: false,
          plans: [
            {
              id: "saved",
              version: 1,
              created_at: "2026-11-02T00:00:00Z",
              data: { quantity: 120, reason: "원문 확인", lines: [], schedule: entries, warnings: [] },
            },
          ],
        }),
      ),
    );
    assert.match(html, /일 단위 생산계획 Gantt/);
    assert.match(html, /D100-03/);
    assert.match(html, /조립 담당자/);
    assert.match(html, /책임자/);
    assert.match(html, /보조자/);
    assert.match(html, /wx-gantt/);
    assert.doesNotMatch(html, /Invalid Date/);
  } finally {
    queryClient.clear();
  }
});

await test("only offers completed production-plan candidates for the next plan and current specification", () => {
  const excluded = [
    { ...document, kind: "incoming_inspection" },
    { ...document, scope: { ...document.scope, plan_version: 0 } },
    { ...document, scope: { ...document.scope, specification_id: "other" } },
    ...["not_extracted", "extracting", "error"].map((status) => ({
      ...document,
      candidates: { ...document.candidates, status },
    })),
    { ...document, candidates: { status: "ready", data: { items: [] } } },
  ];
  assert.deepEqual(getPlanCandidates(job, excluded), []);
  assert.equal(getPlanCandidates(job, [...excluded, document]).length, 1);
});

await test("preserves canonical CSV values and the exact source of rows from different document blocks", () => {
  const row = {
    target_id: "target",
    process: "가공",
    track: "A",
    resource: "설비1",
    duration: "2.5",
    duration_unit: "hour",
    time_basis: "per_item",
    start: "2026-11-02T09:00:00+09:00",
    end: "2026-11-02T12:00:00+09:00",
    page: "1",
    row: "2",
  };
  const applied = applyPlanCandidate(line, { document, row });
  for (const field of ["process", "track", "resource", "duration_unit", "time_basis", "start", "end"])
    assert.equal(applied[field], row[field]);
  assert.equal(applied.duration, 2.5);
  assert.deepEqual(applied.sources, [{ document_id: "plan-doc", page: 1, block_index: null, row: "2" }]);
  const next = applyPlanCandidate(applied, { document, row: { ...row, block_index: 8 } });
  assert.equal(next.sources.length, 2);
  assert.deepEqual(applyPlanCandidate(next, { document, row: { ...row, block_index: 8 } }), next);
});

await test("does not replace existing values with missing, invalid, or date-only candidates", () => {
  const existing = { ...line, duration: 60, process: "가공", start: "2026-11-02T09:00:00+09:00" };
  for (const duration of [undefined, "invalid", 0, -1, Infinity]) {
    const applied = applyPlanCandidate(existing, {
      document,
      row: { duration, start: "2026-11-02", end: "invalidT", duration_unit: "day", time_basis: "working_days" },
    });
    for (const field of ["duration", "duration_unit", "time_basis", "process", "start", "end"])
      assert.equal(applied[field], existing[field]);
  }
});

await test("process lot candidates keep original counts and reject invalid or unrelated rows", () => {
  const target = { kind: "component", process_code: "P-02" };
  const doc = {
    id: "quality",
    filename: "원문.docx",
    kind: "inspection_module1",
    candidates: {
      data: {
        rows: [
          {
            process_codes: "P-02",
            input_quantity: "119",
            good_quantity: "118",
            defect_quantity: "1",
            block_index: 6,
            row: "3",
          },
          { process_codes: "P-02", input_quantity: "119", good_quantity: "119", defect_quantity: "1" },
          { process_codes: "P-02", input_quantity: "", good_quantity: "0", defect_quantity: "0" },
          { process_codes: "P-03", input_quantity: "1", good_quantity: "1", defect_quantity: "0" },
        ],
      },
    },
  };
  const candidates = getProcessCountCandidates(target, [doc]);
  assert.equal(candidates.length, 1);
  assert.deepEqual([candidates[0].input, candidates[0].good, candidates[0].defect], [119, 118, 1]);
  assert.deepEqual(candidates[0].source, { document_id: "quality", page: null, block_index: 6, row: "3" });
  assert.equal(getProcessCountCandidates(target, [{ ...doc, kind: "inspection_final" }]).length, 0);
});
