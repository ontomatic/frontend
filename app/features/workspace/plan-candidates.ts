import type { Evidence, Job, PlanLine, ScheduleEntry, WorkDocument } from "~/lib/api/workspace";

interface PlanCandidate {
  document: WorkDocument;
  row: Record<string, unknown>;
}
const text = (value: unknown) => (typeof value === "string" || typeof value === "number" ? String(value).trim() : "");
const evidence = ({ document, row }: PlanCandidate): Evidence => ({
  document_id: document.id,
  page: row.page == null ? null : Number(row.page),
  block_index: row.block_index == null ? null : Number(row.block_index),
  row: text(row.row),
});
export const getPlanCandidates = (job: Job, documents: WorkDocument[]): PlanCandidate[] =>
  documents
    .filter(
      (doc) =>
        doc.kind === "production_plan" &&
        doc.scope.plan_version === job.plan_version + 1 &&
        doc.scope.specification_id === job.specification_id &&
        doc.candidates.status === "ready",
    )
    .flatMap((document) =>
      document.candidates.data && "rows" in document.candidates.data
        ? document.candidates.data.rows.map((row) => ({ document, row }))
        : [],
    );

export const applyPlanCandidate = (line: PlanLine, { document, row }: PlanCandidate): PlanLine => {
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  const timestamp = (value: unknown, current: string) =>
    typeof value === "string" && value.includes("T") && Number.isFinite(Date.parse(value)) ? value : current;
  const duration = Number(row.duration);
  const source = {
    document_id: document.id,
    page: row.page == null ? null : Number(row.page),
    block_index: row.block_index == null ? null : Number(row.block_index),
    row: text(row.row),
  };
  return {
    ...line,
    process: text(row.process) || text(row.process_codes) || text(row["품목"]) || line.process,
    track: text(row.track) || text(row["품목"]) || line.track,
    resource: text(row.resource) || text(row.assignee) || line.resource,
    start: timestamp(row.start, line.start),
    end: timestamp(row.end, line.end),
    duration: Number.isFinite(duration) && duration > 0 ? duration : line.duration,
    duration_unit:
      row.duration_unit === "hour" || row.duration_unit === "minute" ? row.duration_unit : line.duration_unit,
    time_basis:
      row.time_basis === "per_item" || row.time_basis === "setup" || row.time_basis === "batch"
        ? row.time_basis
        : line.time_basis,
    sources: [
      ...line.sources.filter(
        (existing) =>
          existing.document_id !== source.document_id ||
          existing.page !== source.page ||
          existing.block_index !== source.block_index ||
          existing.row !== source.row,
      ),
      source,
    ],
  };
};

export const getDocumentSchedule = (candidates: PlanCandidate[]) => {
  const documents = new Map<number | string, WorkDocument>();
  for (const { document } of candidates) {
    const key = document.file_id ?? document.id;
    const current = documents.get(key);
    if (!current || current.scope.target_ids.length < document.scope.target_ids.length) documents.set(key, document);
  }
  const entries: ScheduleEntry[] = [];
  const warnings: string[] = [];
  const date = (value: unknown) => {
    const raw = text(value);
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) &&
      Number.isFinite(Date.parse(raw)) &&
      new Date(raw).toISOString().slice(0, 10) === raw
      ? raw
      : "";
  };
  const count = (value: unknown) => {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : null;
  };
  for (const document of documents.values()) {
    const rows = candidates.filter((candidate) => candidate.document.id === document.id);
    for (const candidate of rows) {
      const { row } = candidate;
      if (!row.start_date && !row.end_date) continue;
      const start = date(row.start_date),
        end = date(row.end_date);
      const process = text(row.process) || text(row["품목"]) || text(row.name);
      if (!process || !start || !end || end < start) {
        warnings.push(
          `${document.filename ?? "생산계획서"} ${text(row.row)}행: 공정명과 시작·종료 날짜를 확인해 주세요.`,
        );
        continue;
      }
      const code = text(row.process_codes);
      const kind = row.process || code ? "operation" : "summary";
      const assignments =
        kind === "operation"
          ? rows.filter(
              ({ row: other }) =>
                other !== row &&
                (other.assignee || other.resource || other.process_owner) &&
                ((code && text(other.process_codes) === code) ||
                  (code && (text(other.process) === code || text(other.process).startsWith(`${code} `))) ||
                  (!code && text(other.process) === process)),
            )
          : [];
      const joined = (field: string) =>
        [...new Set(assignments.map(({ row: other }) => text(other[field])).filter(Boolean))].join(", ");
      const track = text(row.track) || joined("품목") || (kind === "summary" ? process : "");
      const summary = rows.find(({ row: other }) => !other.process && text(other["품목"]) === track);
      entries.push({
        kind,
        code,
        process,
        track,
        quantity: text(row.quantity) || text(row["수량"]) || text(summary?.row["수량"]),
        start,
        end,
        working_days: count(row.working_days),
        resource: text(row.resource) || text(row.assignee) || joined("assignee") || joined("resource"),
        owner: text(row.process_owner) || joined("process_owner"),
        assistants: text(row.assistants) || joined("assistants"),
        headcount: count(row.headcount) ?? (assignments.length === 1 ? count(assignments[0].row.headcount) : null),
        predecessors: text(row["선행 작업"])
          .split(/[,;\n]/)
          .map((value) => value.trim())
          .filter((value) => value && !["—", "-", "없음"].includes(value)),
        note: text(row.note),
        sources: [candidate, ...assignments, ...(summary && summary !== candidate ? [summary] : [])].map(evidence),
      });
    }
  }
  const quantities = [
    ...new Set(
      entries
        .filter((entry) => entry.kind === "summary")
        .map((entry) => entry.quantity.match(/^(\d+)\s*(?:대|개)$/)?.[1])
        .filter(Boolean)
        .map(Number),
    ),
  ];
  return { entries, warnings, quantity: quantities.length === 1 ? quantities[0] : undefined };
};
