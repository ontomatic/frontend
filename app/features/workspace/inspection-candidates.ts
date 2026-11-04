import { getProcessCountCandidates, inspectionKinds } from "~/lib/api/workspace";
import type { Evidence, Job, Target, WorkDocument } from "~/lib/api/workspace";

const text = (value: unknown) =>
  typeof value === "string" || (typeof value === "number" && Number.isFinite(value)) ? String(value).trim() : "";
const codes = (value: unknown) =>
  text(value)
    .split(/[,，+\s]+/)
    .filter(Boolean);
const source = (document: WorkDocument, row: Record<string, unknown>): Evidence => ({
  document_id: document.id,
  page: row.page == null ? null : Number(row.page),
  block_index: row.block_index == null ? null : Number(row.block_index),
  row: text(row.row),
});
const documentValue = (document: WorkDocument, labels: string[]) => {
  for (const block of document.blocks) {
    if (block.kind !== "table") continue;
    for (const row of block.rows ?? []) {
      for (let index = 0; index < row.length - 1; index += 2) {
        if (labels.includes(text(row[index])) && text(row[index + 1])) return text(row[index + 1]);
      }
    }
  }
  return "";
};
const measurementUnit = (value: string) => {
  const units = [
    ...new Set(
      [...value.matchAll(/\d[\d.,~±/]*\s*(대분|mm|ms|mΩ|%|N|개|대|건|회|초)(?![A-Za-zΩ가-힣])/g)].map(
        (match) => match[1],
      ),
    ),
  ];
  return units.length === 1 ? units[0] : "";
};

export const getInspectionCandidates = (job: Job, target: Target, documents: WorkDocument[]) =>
  documents.flatMap((document) => {
    if (
      document.job_id !== job.id ||
      document.kind !== inspectionKinds[target.kind] ||
      document.status !== "parsed" ||
      document.candidates.status !== "ready" ||
      document.scope.specification_id !== job.specification_id ||
      document.scope.round !== target.round ||
      document.scope.plan_version !== target.plan_version ||
      !document.scope.target_ids.includes(target.id) ||
      !document.candidates.data ||
      !("rows" in document.candidates.data)
    )
      return [];
    const rows = document.candidates.data.rows;
    const targetProcessCodes: string[] = target.process_code
      ? [target.process_code]
      : target.condition?.startsWith("자체 가공")
        ? (target.condition.match(/[A-Za-z0-9]+(?:[-._][A-Za-z0-9]+)+/g) ?? [])
        : target.kind === "product" && document.scope.target_ids.length === 1
          ? rows
              .filter((row) => text(row.process).includes("최종") && row.input_quantity != null)
              .flatMap((row) => codes(row.process_codes))
          : [];
    const number = documentValue(document, ["문서번호"]);
    const version = documentValue(document, ["문서 버전", "버전"]);
    const reference = number ? `${number}${version ? ` v${version}` : ""}` : "";
    const ruleBlock = document.blocks.find(
      (block) => block.kind === "text" && /불량[^.。]*격리[^.。]*양품/.test(block.text ?? ""),
    );
    const rule = ruleBlock?.text?.match(/[^.。]*불량[^.。]*격리[^.。]*양품[^.。]*[.。]?/)?.[0].trim() ?? "";
    const declaredUnit = document.blocks
      .map((block) => block.text?.match(/수량 단위는\s*(대분|대|개|매)/)?.[1])
      .find(Boolean);
    const instructions = documents
      .filter(
        (doc) =>
          doc.job_id === job.id &&
          doc.kind.startsWith("work_instruction_") &&
          doc.status === "parsed" &&
          doc.candidates.status === "ready" &&
          doc.scope.specification_id === job.specification_id &&
          doc.scope.plan_version === target.plan_version &&
          doc.scope.target_ids.includes(target.id),
      )
      .flatMap((doc) =>
        doc.candidates.data && "rows" in doc.candidates.data
          ? doc.candidates.data.rows.map((row) => ({ document: doc, row }))
          : [],
      );
    const counts = targetProcessCodes.flatMap((process_code) =>
      getProcessCountCandidates({ ...target, process_code }, [document]).map((count) => ({
        ...count,
        process_code,
        unit:
          declaredUnit ||
          rows
            .filter((row) => codes(row.process_codes).includes(process_code))
            .map((row) => text(row["불합격"]).match(/^\d[\d,]*\s*(대분|대|개|매)$/)?.[1])
            .find(Boolean) ||
          "",
      })),
    );
    const candidates = rows.flatMap((row, index) => {
      if (document.kind === "inspection_final" && /^제품번호\s/.test(text(row.section_title))) return [];
      const field = (...keys: string[]) => keys.map((key) => text(row[key])).find(Boolean) ?? "";
      const targetId = text(row.target_id);
      const code = field("item_code", "품목코드");
      const version = field("version", "품목 버전", "사양 버전");
      const name = field("name", "품목명");
      const embeddedCodes: string[] = name.match(/[A-Za-z0-9]+(?:[-._][A-Za-z0-9]+)+/g) ?? [];
      const namedCode = embeddedCodes.includes(target.code);
      const processCodes = codes(row.process_codes);
      const matchingProcess = processCodes.some((code) => targetProcessCodes.includes(code));
      if (
        (targetId && targetId !== target.id) ||
        (code && code !== target.code) ||
        (version && Number(version) !== target.version) ||
        (!code && embeddedCodes.length > 0 && !namedCode) ||
        (targetProcessCodes.length > 0 && processCodes.length > 0 && !matchingProcess)
      )
        return [];
      const identified = targetId || code || namedCode || matchingProcess;
      if (!identified && processCodes.length > 0) return [];
      if (!identified && name && name !== target.name) return [];
      if (!identified && !name && document.scope.target_ids.length !== 1) return [];
      const rowStandard = field("standard", "시험 기준", "표준 번호/버전");
      const rowCriterion = field("criterion", "허용 기준", "판정 기준", "기준", "check_description", "확인 내용");
      const rowMeasurement = field("measured_value", "측정값", "시험 결과", "check_description", "확인 내용");
      const rowGrade = field("grade", "등급");
      const rowSource = source(document, row);
      const ownCount = counts.find(
        (candidate) =>
          candidate.source.page === rowSource.page &&
          candidate.source.block_index === rowSource.block_index &&
          candidate.source.row === rowSource.row,
      );
      const matchingCounts = processCodes.length
        ? counts.filter((count) => processCodes.includes(count.process_code))
        : counts;
      const count = ownCount ?? (matchingCounts.length === 1 ? matchingCounts[0] : undefined);
      const hasMeasurement = !!(rowStandard || rowCriterion || rowMeasurement || rowGrade);
      if (!hasMeasurement && !ownCount) return [];
      const instruction = instructions.find(
        ({ row }) =>
          text(row.check_description) && codes(row.process_codes).some((code) => processCodes.includes(code)),
      );
      const rawResult = (
        field("result", "raw_result", "판정", "결과") || documentValue(document, ["종합 판정"])
      ).toLowerCase();
      const values = {
        standard: rowStandard || reference,
        criterion: rowCriterion || text(instruction?.row.check_description) || rule,
        measured_value:
          rowMeasurement ||
          (count ? `투입 ${count.input} / 양품 ${count.good} / 불량 ${count.defect}` : field("raw_result", "결과")),
        unit: field("unit", "단위") || (rowMeasurement ? measurementUnit(rowMeasurement) : (count?.unit ?? "")),
        grade: rowGrade,
      };
      const sources = [rowSource, ...(count && !ownCount ? [count.source] : [])];
      if (!rowCriterion && instruction) sources.push(source(instruction.document, instruction.row));
      else if (!rowCriterion && ruleBlock && rule)
        sources.push(
          source(document, {
            block_index: ruleBlock.location.block_index,
            page: ruleBlock.location.page_number,
            row: "문단",
          }),
        );
      return [
        {
          key: `${document.id}:${rowSource.block_index ?? ""}:${rowSource.page ?? ""}:${rowSource.row || index}`,
          label: `${document.filename} · ${rowSource.block_index ? `블록 ${rowSource.block_index} · ` : ""}행 ${rowSource.row} · ${field("inspection_field", "field", "name") || values.criterion || values.measured_value}`,
          values,
          result: ["fail", "불합격", "부적합"].includes(rawResult)
            ? "fail"
            : ["pass", "합격", "적합", "ok", "양품 적합", "양품 적합 / 불량 격리", "양품 합격 / 불량 격리"].includes(
                  rawResult,
                )
              ? "pass"
              : undefined,
          source: rowSource,
          sources,
          count,
          countOnly: !hasMeasurement,
        },
      ];
    });
    return candidates.filter(
      (candidate) =>
        !candidate.countOnly || !candidates.some((other) => !other.countOnly && other.count === candidate.count),
    );
  });
