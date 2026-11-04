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
const { getInspectionCandidates } = await server.ssrLoadModule("/app/features/workspace/inspection-candidates.ts");
const { default: TargetActions } = await server.ssrLoadModule("/app/features/workspace/target-actions.tsx");
const job = { id: "job", specification_id: "spec", revision: 1 };
const target = {
  id: "target",
  code: "MAT-01",
  name: "렌즈 소재",
  kind: "material",
  version: 2,
  round: 1,
  plan_version: 0,
  status: "waiting",
  waiting_reasons: [],
};
const row = {
  item_code: "MAT-01",
  version: "2",
  standard: "TEST-v2",
  criterion: "8 ± 0.1 mm",
  measured_value: 0,
  unit: "mm",
  grade: "A",
  result: "fail",
  page: 1,
  row: "3",
};
const document = {
  id: "report",
  file_id: 1,
  job_id: "job",
  filename: "수입검사.csv",
  kind: "incoming_inspection",
  status: "parsed",
  scope: { specification_id: "spec", target_ids: ["target"], round: 1, plan_version: 0 },
  candidates: { status: "ready", data: { rows: [row] } },
  blocks: [{ kind: "table", location: { page_number: 1 } }],
};
const render = (documents, selectedTarget = target) => {
  const client = new QueryClient();
  try {
    return renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client },
        createElement(TargetActions, {
          job,
          target: selectedTarget,
          documents,
          user: { department: { code: "quality_assurance" } },
          specifications: [],
          events: [],
          mode: "quality",
        }),
      ),
    );
  } finally {
    client.clear();
  }
};

await test("prefills the matching inspection row and evidence without confirming or submitting", () => {
  const multiItem = {
    ...document,
    candidates: {
      status: "ready",
      data: {
        rows: [{ ...row, item_code: "OTHER", measured_value: 99 }, { ...row, version: "1", measured_value: 77 }, row],
      },
    },
  };
  const candidates = getInspectionCandidates(job, target, [multiItem]);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].key, getInspectionCandidates(job, target, [document])[0].key);
  assert.deepEqual(candidates[0].values, {
    standard: "TEST-v2",
    criterion: "8 ± 0.1 mm",
    measured_value: "0",
    unit: "mm",
    grade: "A",
  });
  assert.deepEqual(candidates[0].source, { document_id: "report", page: 1, block_index: null, row: "3" });
  const html = render([multiItem]);
  assert.match(html, /name="standard"[^>]*value="TEST-v2"/);
  assert.match(html, /<textarea name="criterion"[^>]*>8 ± 0.1 mm<\/textarea>/);
  assert.match(html, /name="measured_value"[^>]*value="0"/);
  assert.match(html, /name="unit"[^>]*value="mm"/);
  assert.match(html, /name="grade"[^>]*value="A"/);
  assert.match(html, /value="report" selected=""/);
  assert.match(html, /value="fail" selected=""/);
  assert.match(html, /<button type="submit"[^>]*disabled=""/);
  assert.doesNotMatch(html, /type="checkbox"[^>]*checked/);
});

await test("uses only parsed, extracted documents for this job, inspection kind, specification, round, and plan", () => {
  const excluded = [
    { ...document, job_id: "other" },
    { ...document, kind: "inspection_module1" },
    { ...document, status: "error" },
    ...["not_extracted", "extracting", "error"].map((status) => ({
      ...document,
      candidates: { ...document.candidates, status },
    })),
    ...[{ specification_id: "old" }, { round: 2 }, { plan_version: 1 }, { target_ids: ["other"] }].map((scope) => ({
      ...document,
      scope: { ...document.scope, ...scope },
    })),
  ];
  assert.deepEqual(getInspectionCandidates(job, target, excluded), []);
  assert.equal(getInspectionCandidates(job, target, [...excluded, document]).length, 1);
  assert.match(render(excluded), /name="standard"[^>]*value=""/);
});

await test("preserves Korean fields and DOCX locations and prefills the first matching inspection row", () => {
  const korean = {
    "시험 기준": "KS-TEST",
    criterion: "이상 없음",
    measured_value: "정상",
    unit: "",
    등급: "B",
    raw_result: "합격",
    block_index: 8,
    page: null,
    row: "2",
    inspection_field: "외관",
  };
  const docx = {
    ...document,
    filename: "검사.docx",
    blocks: [{ kind: "table", location: { block_index: 8 } }],
    candidates: { status: "ready", data: { rows: [korean] } },
  };
  const [candidate] = getInspectionCandidates(job, target, [docx]);
  assert.equal(candidate.values.standard, "KS-TEST");
  assert.equal(candidate.values.grade, "B");
  assert.equal(candidate.result, "pass");
  assert.deepEqual(candidate.source, { document_id: "report", page: null, block_index: 8, row: "2" });
  assert.match(render([docx]), /value="8" selected=""/);
  const multiple = {
    ...docx,
    candidates: { status: "ready", data: { rows: [korean, { ...korean, row: "3", inspection_field: "치수" }] } },
  };
  const html = render([multiple]);
  assert.match(html, /2개 검사 행/);
  assert.match(html, /외관/);
  assert.match(html, /치수/);
  assert.match(html, /name="standard"[^>]*value="KS-TEST"/);
});

await test("does not assign unrelated or unidentified rows from a shared document to this target", () => {
  const shared = {
    ...document,
    scope: { ...document.scope, target_ids: ["target", "other"] },
    candidates: {
      status: "ready",
      data: {
        rows: [
          { ...row, target_id: "other" },
          { standard: "UNIDENTIFIED", row: "2" },
          { name: "다른 소재", standard: "OTHER", row: "3" },
        ],
      },
    },
  };
  assert.deepEqual(getInspectionCandidates(job, target, [shared]), []);
  const koreanIdentity = {
    ...document,
    candidates: {
      status: "ready",
      data: {
        rows: [
          { 품목코드: "OTHER", "사양 버전": 2, "시험 기준": "OTHER" },
          { 품목코드: "MAT-01", "사양 버전": 1, "시험 기준": "OLD" },
        ],
      },
    },
  };
  assert.deepEqual(getInspectionCandidates(job, target, [koreanIdentity]), []);
});

await test("prefills process counts from the same row while keeping other processes separate", () => {
  const processTarget = { ...target, kind: "component", status: "inspection", process_code: "P-01" };
  const processRow = { ...row, process_codes: "P-01", input_quantity: "10", good_quantity: "8", defect_quantity: "2" };
  const processDoc = {
    ...document,
    kind: "inspection_module1",
    candidates: { status: "ready", data: { rows: [{ ...processRow, process_codes: "P-010" }, processRow] } },
  };
  const [candidate] = getInspectionCandidates(job, processTarget, [processDoc]);
  assert.equal(candidate.count.good, 8);
  assert.equal(candidate.count.defect, 2);
  const html = render([processDoc], processTarget);
  assert.match(html, /양품 수량[\s\S]*?value="8"/);
  assert.match(html, /불량 격리 수량[\s\S]*?value="2"/);
  assert.match(html, /name="standard"[^>]*value="TEST-v2"/);
});

await test("matches a DOCX part name containing its code and fills the original check description", () => {
  const part = { ...target, code: "D100-P03", name: "센서 칩 (실리콘)" };
  const check = "수량·로트 일치, 수광면 이물·긁힘 0건, 포장 정상";
  const docx = {
    ...document,
    scope: { ...document.scope, target_ids: [target.id, "other"] },
    candidates: {
      status: "ready",
      data: {
        rows: [
          { name: "센서 칩\nD100-P030", check_description: "다른 부품", block_index: 5, row: "3" },
          { name: "센서 칩\nD100-P03", check_description: check, raw_result: "합격", block_index: 5, row: "2" },
        ],
      },
    },
  };
  const candidates = getInspectionCandidates(job, part, [docx]);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].values.criterion, check);
  assert.equal(candidates[0].values.measured_value, check);
  assert.equal(candidates[0].values.standard, "");
  assert.equal(candidates[0].source.block_index, 5);
  assert.match(render([docx], part), /name="measured_value"[^>]*value="수량·로트 일치/);
});

await test("prefills a legacy BOM target from the exact process code in its procurement condition", () => {
  const part = {
    ...target,
    kind: "component",
    code: "D300-P01",
    name: "렌즈",
    status: "inspection",
    condition: "자체 가공 (D300-02)",
  };
  const docx = {
    ...document,
    kind: "inspection_module1",
    scope: { ...document.scope, target_ids: [part.id, "other"] },
    candidates: {
      status: "ready",
      data: {
        rows: [
          {
            process_codes: "D300-02",
            process: "렌즈 가공",
            input_quantity: "360",
            good_quantity: "358",
            defect_quantity: "2",
            block_index: 6,
            row: "2",
          },
          {
            process_codes: "D300-03",
            process: "경통 가공",
            input_quantity: "360",
            good_quantity: "359",
            defect_quantity: "1",
            block_index: 9,
            row: "2",
          },
        ],
      },
    },
  };
  const [candidate] = getInspectionCandidates(job, part, [docx]);
  assert.ok(candidate);
  assert.equal(candidate.count.good, 358);
  assert.equal(candidate.values.measured_value, "투입 360 / 양품 358 / 불량 2");
  assert.equal(candidate.values.standard, "");
  const html = render([docx], part);
  assert.match(html, /name="measured_value"[^>]*value="투입 360 \/ 양품 358 \/ 불량 2"/);
  assert.match(html, /양품 수량[\s\S]*?value="358"/);
});

await test("combines separate count and measurement tables for the same process with both sources", () => {
  const processTarget = { ...target, kind: "component", status: "inspection", process_code: "P-01" };
  const docx = {
    ...document,
    kind: "inspection_module1",
    candidates: {
      status: "ready",
      data: {
        rows: [
          {
            process_codes: "P-01",
            input_quantity: "10",
            good_quantity: "8",
            defect_quantity: "2",
            block_index: 6,
            row: "2",
          },
          {
            process_codes: "P-01",
            field: "광축 중심",
            criterion: "0.030 mm 이하",
            measured_value: "0.010~0.027 mm",
            raw_result: "합격",
            block_index: 7,
            row: "2",
          },
        ],
      },
    },
  };
  const candidates = getInspectionCandidates(job, processTarget, [docx]);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].values.criterion, "0.030 mm 이하");
  assert.equal(candidates[0].count.good, 8);
  assert.deepEqual(
    candidates[0].sources.map((source) => source.block_index),
    [7, 6],
  );
  const html = render([docx], processTarget);
  assert.match(html, /name="measured_value"[^>]*value="0.010~0.027 mm"/);
  assert.match(html, /양품 수량[\s\S]*?value="8"/);
});

await test("does not pair a measurement with quantities from a different related process", () => {
  const part = { ...target, kind: "component", condition: "자체 가공 (P-01, P-02)" };
  const docx = {
    ...document,
    kind: "inspection_module1",
    candidates: {
      status: "ready",
      data: {
        rows: [
          {
            process_codes: "P-01",
            input_quantity: "10",
            good_quantity: "8",
            defect_quantity: "2",
            block_index: 6,
            row: "2",
          },
          {
            process_codes: "P-02",
            criterion: "0.030 mm 이하",
            measured_value: "0.010~0.027 mm",
            block_index: 7,
            row: "2",
          },
        ],
      },
    },
  };
  const candidates = getInspectionCandidates(job, part, [docx]);
  assert.equal(candidates.length, 2);
  const measurement = candidates.find((candidate) => candidate.values.criterion);
  assert.equal(measurement.count, undefined);
  assert.equal(measurement.sources.length, 1);
});

await test("uses the actual document reference, work-order checks, and declared count units without inventing a standard or grade", () => {
  const selected = { ...target, kind: "component", status: "inspection", process_code: "D300-02" };
  const report = {
    ...document,
    kind: "inspection_module1",
    blocks: [
      {
        kind: "table",
        location: { block_index: 3 },
        rows: [
          ["문서번호", "D300-검사-06", "검사일", "2026-11-24"],
          ["근거 부품표", "D300-BOM-02 v1.0", "문서 버전", "1.0"],
        ],
      },
      {
        kind: "text",
        location: { block_index: 4 },
        text: "수량 단위는 대분이며, 렌즈 가공 1대분은 BOM의 렌즈 매수를 뜻합니다. 불량은 격리하고 양품만 다음 공정에 투입합니다.",
      },
      {
        kind: "table",
        location: { block_index: 6 },
        rows: [
          ["공정번호", "투입", "양품", "불량"],
          ["D300-02", "360", "358", "2"],
        ],
      },
    ],
    candidates: {
      status: "ready",
      data: {
        rows: [
          {
            process_codes: "D300-02",
            input_quantity: "360",
            good_quantity: "358",
            defect_quantity: "2",
            block_index: 6,
            row: "2",
          },
        ],
      },
    },
  };
  const instruction = {
    ...document,
    id: "instruction",
    kind: "work_instruction_module1",
    candidates: {
      status: "ready",
      data: { rows: [{ process_codes: "D300-02", check_description: "외관·수량 확인", block_index: 6, row: "2" }] },
    },
  };
  const [candidate] = getInspectionCandidates(job, selected, [report, instruction]);
  assert.deepEqual(candidate.values, {
    standard: "D300-검사-06 v1.0",
    criterion: "외관·수량 확인",
    measured_value: "투입 360 / 양품 358 / 불량 2",
    unit: "대분",
    grade: "",
  });
  assert.ok(candidate.sources.some((source) => source.document_id === "instruction"));
  const html = render([report, instruction], selected);
  assert.match(html, /근거 문서·버전/);
  assert.match(html, /name="standard"[^>]*value="D300-검사-06 v1.0"/);
  assert.doesNotMatch(html, /시연용 기준|직접 입력해 주세요/);
  assert.match(html, /placeholder="문서에 기재된 등급 없음"/);
  for (const scope of [{ specification_id: "other" }, { plan_version: 2 }, { target_ids: ["other"] }]) {
    const [fallback] = getInspectionCandidates(job, selected, [
      report,
      { ...instruction, scope: { ...instruction.scope, ...scope } },
    ]);
    assert.equal(fallback.values.criterion, "불량은 격리하고 양품만 다음 공정에 투입합니다.");
    assert.ok(fallback.sources.some((source) => source.block_index === 4 && source.row === "문단"));
    assert.ok(fallback.sources.every((source) => source.document_id === report.id));
  }
});

await test("copies only unambiguous units printed in the measurement and leaves dimensionless or mixed results empty", () => {
  for (const [measured_value, unit] of [
    ["7.80~8.20 ms", "ms"],
    ["0.010~0.027 mm", "mm"],
    ["0.69~0.78", ""],
    ["0.015~0.040 mm\n10회 정상", ""],
  ]) {
    const report = {
      ...document,
      candidates: { status: "ready", data: { rows: [{ ...row, measured_value, unit: "" }] } },
    };
    assert.equal(getInspectionCandidates(job, target, [report])[0].values.unit, unit);
  }
});

await test("prefills the lot's final inspection and keeps the three product sample checklists separate", () => {
  const selected = { ...target, kind: "product", status: "inspection", condition: "root" };
  const report = {
    ...document,
    kind: "inspection_final",
    candidates: {
      status: "ready",
      data: {
        rows: [
          {
            process_codes: "D300-16",
            process: "최종 결합·검사",
            input_quantity: "354",
            good_quantity: "351",
            defect_quantity: "3",
            block_index: 6,
            row: "2",
          },
          {
            process_codes: "D300-16",
            field: "최종 검사",
            criterion: "전수 화질·기능·외관 검사",
            measured_value: "합격 351대\n불합격 3대",
            raw_result: "양품 적합",
            block_index: 8,
            row: "2",
          },
          ...["001", "176", "351"].map((serial) => ({
            process_codes: "D300-16",
            inspection_field: "촬영 화질",
            criterion: "이물 0건",
            raw_result: "OK",
            section_title: `제품번호 LO-D300-${serial} 점검표`,
            block_index: 16,
            row: "2",
          })),
        ],
      },
    },
  };
  const candidates = getInspectionCandidates(job, selected, [report]);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].values.measured_value, "합격 351대\n불합격 3대");
  assert.equal(candidates[0].values.unit, "대");
  assert.equal(candidates[0].count.good, 351);
  assert.equal(candidates[0].result, "pass");
});
