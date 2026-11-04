import { useMutation, useQueryClient } from "@tanstack/react-query";

import apiClient from "./client";

export interface Evidence {
  document_id: string;
  page: number | null;
  block_index?: number | null;
  row: string;
  original_field?: string;
  original_value?: string;
  original_unit?: string;
}
export interface Attribute {
  field: string;
  value: string | number;
  unit: string;
  required: boolean;
  confirmed: boolean;
  source: Evidence | null;
}
export interface Item {
  key: string;
  code: string;
  name: string;
  kind: "product" | "assembly" | "component" | "material";
  version: number;
  unit: string;
  aliases: string[];
  confirmed: boolean;
  attributes: Attribute[];
}
export interface Relation {
  parent: string;
  child: string;
  quantity: number;
  condition: string;
  confirmed: boolean;
  source: Evidence | null;
}
export interface Graph {
  root: string;
  items: Item[];
  relations: Relation[];
}
export interface Specification {
  id: string;
  code: string;
  name: string;
  product_type: string;
  version: number;
  revision: number;
  status: string;
  graph: Graph;
  previous_id: string | null;
  reason: string;
  created_at: string;
  submitted_at: string | null;
  index_status: string;
  index_error: string | null;
}
export interface Target {
  id: string;
  item_key: string;
  code: string;
  name: string;
  kind: Item["kind"];
  version: number;
  quantity: number;
  unit: string;
  condition: string;
  children: string[];
  parents: string[];
  status: string;
  round: number;
  plan_version: number;
  completion_id: string | null;
  inspection_id: string | null;
  waiting_reasons: string[];
  issue: { cause: string; reason: string; event_id: string } | null;
  recheck_reason?: string;
  process_code?: string;
  instruction_group?: string;
  preparation?: boolean;
  inventory_of?: string;
  input_quantity?: number;
  good_quantity?: number;
  defect_quantity?: number;
  remaining_quantity?: number | null;
  remaining_by_output?: Record<string, number>;
}
export interface CompositionGroup {
  name: string;
  target_ids: string[];
}
export interface Job {
  id: string;
  name: string;
  specification_id: string;
  product_code: string;
  product_name: string;
  specification_version: number;
  quantity: number;
  revision: number;
  plan_version: number;
  status: string;
  production_result?: { input_quantity: number; good_quantity: number; defect_quantity: number; unit: string } | null;
  targets: Record<string, Target>;
  composition_groups?: CompositionGroup[];
  created_at: string;
}
export interface WorkDocument {
  id: string;
  file_id: number;
  filename: string;
  kind: string;
  department: string;
  specification_id: string | null;
  job_id: string | null;
  scope: { specification_id: string; target_ids: string[]; round: number; plan_version: number };
  blocks: {
    kind: string;
    text?: string;
    rows?: (string | null)[][];
    location: {
      page_number?: number;
      sheet_name?: string;
      cell_range?: string;
      block_index?: number;
      section_title?: string;
      document_number?: string;
    };
  }[];
  candidates: {
    status: string;
    progress?: {
      stage: "queued" | "preparing" | "extracting" | "merging" | "completed" | "failed";
      completed_chunks: number;
      total_chunks: number;
      started_at: string;
    };
    data?: Graph | { rows: Record<string, unknown>[] };
    reference?: { warnings: string[]; sections: { document_number: string; section_title: string }[] } | null;
  };
  status: string;
  error: string | null;
  created_at: string;
}
export interface PlanLine {
  target_id: string;
  process: string;
  track: string;
  quantity: number;
  unit: string;
  duration: number;
  duration_unit: "minute" | "hour";
  time_basis: "per_item" | "batch" | "setup";
  resource: string;
  start: string;
  end: string;
  predecessors: string[];
  sources: Evidence[];
}
export interface Plan {
  id: string;
  version: number;
  created_at: string;
  data: { quantity: number; reason: string; lines: PlanLine[]; schedule?: ScheduleEntry[]; warnings: string[] };
}
export interface ScheduleEntry {
  kind: "summary" | "operation";
  code: string;
  process: string;
  track: string;
  quantity: string;
  start: string;
  end: string;
  working_days: number | null;
  resource: string;
  owner: string;
  assistants: string;
  headcount: number | null;
  predecessors: string[];
  note: string;
  sources: Evidence[];
}
export interface WorkflowEvent {
  id: string;
  action: string;
  actor_name: string;
  department: string;
  created_at: string;
  specification_id: string | null;
  job_id: string | null;
  target_id: string | null;
  data: {
    round?: number;
    plan_version?: number;
    reason?: string;
    specification_id?: string;
    completion_id?: string;
    quantity?: number;
    unit?: string;
    criterion?: string;
    standard?: string;
    measured_value?: string;
    grade?: string;
    result?: string;
    affected?: string[];
    graph?: Graph;
    sources?: Evidence[];
    [key: string]: unknown;
  };
}
export interface CurrentUser {
  id: number;
  name: string;
  emp_id: string;
  role: string;
  department: { id: number; code: string; name: string } | null;
}

export const getWorkspace = async <T>(path: string): Promise<T> => {
  const { data } = await apiClient.get<T>(`/api/v1/workspace${path}`);
  return data;
};
export const documentPollInterval = ({ state }: { state: { data?: WorkDocument[] } }) =>
  state.data?.some((doc) => doc.candidates.status === "extracting") ? 1500 : false;
export const mergeDocumentCandidate = (graph: Graph, document: WorkDocument): Graph => {
  const candidate = document.candidates.data;
  if (!candidate || !("items" in candidate)) return graph;
  const replaceFacts = <T extends { source: Evidence | null }>(current: T[], incoming: T[]): T[] => {
    const index = current.findIndex((fact) => fact.source?.document_id === document.id);
    const preserved = current.filter((fact) => fact.source?.document_id !== document.id);
    preserved.splice(index < 0 ? preserved.length : index, 0, ...incoming);
    return preserved;
  };
  const items = [...graph.items];
  const keys = new Map<string, string>();
  const attributes = new Map<string, Attribute[]>();
  for (const incoming of candidate.items) {
    const coded = items.filter(
      (item) => incoming.code && item.code === incoming.code && item.version === incoming.version,
    );
    const matches = coded.length
      ? coded
      : items.filter(
          (item) =>
            item.version === incoming.version &&
            !(item.code && incoming.code) &&
            (item.key === incoming.key ||
              [item.name, ...item.aliases].some((name) => [incoming.name, ...incoming.aliases].includes(name))),
        );
    const current =
      incoming.key === candidate.root
        ? items.find((item) => item.key === graph.root)
        : (matches.find((item) => item.key === incoming.key) ?? (matches.length === 1 ? matches[0] : undefined));
    let key = current?.key ?? incoming.key;
    for (let suffix = 1; !current && items.some((item) => item.key === key); suffix++) {
      key = `${incoming.key.slice(0, 90)}#${suffix}`;
    }
    keys.set(incoming.key, key);
    attributes.set(key, [...(attributes.get(key) ?? []), ...incoming.attributes]);
    if (current) {
      const code = current.code || incoming.code;
      const kind = document.kind === "bom_transfer" ? incoming.kind : current.kind;
      const aliases = [
        ...new Set([
          ...current.aliases,
          ...incoming.aliases,
          ...(current.name === incoming.name ? [] : [incoming.name]),
        ]),
      ];
      items[items.indexOf(current)] = {
        ...current,
        code,
        kind,
        aliases,
        confirmed:
          current.confirmed &&
          code === current.code &&
          kind === current.kind &&
          aliases.length === current.aliases.length,
      };
    } else {
      items.push({ ...incoming, key, attributes: [] });
    }
  }
  return {
    ...graph,
    items: items.map((item) => ({
      ...item,
      attributes: replaceFacts(item.attributes, attributes.get(item.key) ?? []),
    })),
    relations: replaceFacts(
      graph.relations,
      candidate.relations.map((relation) => ({
        ...relation,
        parent: keys.get(relation.parent) ?? relation.parent,
        child: keys.get(relation.child) ?? relation.child,
      })),
    ),
  };
};
export const getProcessCountCandidates = (target: Target, documents: WorkDocument[]) =>
  documents.flatMap((doc) => {
    if (doc.kind !== inspectionKinds[target.kind] || !doc.candidates.data || !("rows" in doc.candidates.data))
      return [];
    const text = (value: unknown) =>
      typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
    return doc.candidates.data.rows.flatMap((row) => {
      const codes = text(row.process_codes)
        .split(/[,，+]/)
        .map((code) => code.trim());
      if (!target.process_code || !codes.includes(target.process_code)) return [];
      const fields = [row.input_quantity, row.good_quantity, row.defect_quantity];
      if (fields.some((value) => text(value) === "")) return [];
      const [input, good, defect] = fields.map(Number);
      if (
        ![input, good, defect].every((value) => Number.isFinite(value) && value >= 0) ||
        Math.abs(input - good - defect) > 1e-9
      )
        return [];
      return [
        {
          input,
          good,
          defect,
          label: `${doc.filename} · 행 ${text(row.row)} · 투입 ${input} / 양품 ${good} / 불량 ${defect}`,
          source: {
            document_id: doc.id,
            page: row.page == null ? null : Number(row.page),
            block_index: row.block_index == null ? null : Number(row.block_index),
            row: text(row.row),
          } as Evidence,
        },
      ];
    });
  });

export const getNextTarget = (job: Job, department?: string) => {
  const targets = Object.values(job.targets).filter((target) => !target.inventory_of);
  return (
    targets.find((target) =>
      department === "quality_assurance"
        ? target.status === "inspection" || (target.kind === "material" && target.status === "waiting")
        : department === "production_management"
          ? target.status === "producing" ||
            (target.kind !== "material" && target.status === "waiting" && !target.waiting_reasons.length) ||
            target.issue?.cause === "physical"
          : target.issue?.cause === "specification",
    ) ??
    targets.find((target) => target.status === "held") ??
    targets.find((target) => !["passed", "partial"].includes(target.status))
  );
};
export const useWorkspaceAction = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ path, body, method = "post" }: { path: string; body?: unknown; method?: "put" | "post" }) => {
      const { data } = await apiClient.request({
        url: `/api/v1/workspace${path}`,
        method,
        data: body,
        timeout: 180_000,
      });
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workspace"] }),
  });
};
export const kindNames: Record<string, string> = {
  product: "완제품",
  assembly: "반제품",
  component: "주요 부품",
  material: "재료",
};
export const productNames: Record<string, string> = {
  digital: "일반 디지털",
  telephoto: "초망원 디지털",
  film: "필름",
  polaroid: "폴라로이드",
};
export const statusNames: Record<string, string> = {
  draft: "R&D 확인 중",
  submitted: "사양 확정",
  active: "진행 중",
  completed: "생산 건 완료",
  completed_with_defects: "생산 완료 · 불량 격리",
  partial: "양품 승인 · 불량 격리",
  waiting: "대기",
  producing: "생산 중",
  inspection: "검사 대기",
  passed: "합격",
  held: "전체 보류",
  parsed: "원문 준비",
  extracting: "후보 추출 중",
  attached: "선택 첨부",
  error: "처리 실패",
  pending: "대기",
  ready: "검색 가능",
  disabled: "연결 미설정",
  indexing: "색인 중",
  not_extracted: "후보 추출 전",
};
export const documentNames: Record<string, string> = {
  product_detail: "사양-01 · 제품사양서",
  bom_transfer: "BOM-02 · BOM 및 양산 이관",
  incoming_inspection: "수입검사-03 · 수입검사성적서",
  production_plan: "계획-04 · 생산계획서",
  work_instruction_module1: "순서-05 · 작업 순서 (1차 모듈)",
  inspection_module1: "검사-06 · 검사성적서 (1차 모듈)",
  work_instruction_lens: "순서-07 · 작업 순서 (렌즈 공정)",
  work_instruction_body: "순서-08 · 작업 순서 (본체 공정)",
  inspection_module2: "검사-09 · 검사성적서 (2차 모듈)",
  work_instruction_final: "순서-10 · 작업 순서 (완제품 공정)",
  inspection_final: "검사-11 · 검사성적서 (완제품)",
};
export const kindsByDepartment: Record<string, string[]> = {
  research_and_development: ["product_detail", "bom_transfer"],
  quality_assurance: ["incoming_inspection", "inspection_module1", "inspection_module2", "inspection_final"],
  production_management: [
    "production_plan",
    "work_instruction_module1",
    "work_instruction_lens",
    "work_instruction_body",
    "work_instruction_final",
  ],
};
export const documentTargetKinds: Record<string, Item["kind"][]> = {
  incoming_inspection: ["material"],
  production_plan: ["component", "assembly", "product"],
  work_instruction_module1: ["component"],
  inspection_module1: ["component"],
  work_instruction_lens: ["assembly"],
  work_instruction_body: ["assembly"],
  inspection_module2: ["assembly"],
  work_instruction_final: ["product"],
  inspection_final: ["product"],
};
export const inspectionKinds: Record<Item["kind"], string> = {
  material: "incoming_inspection",
  component: "inspection_module1",
  assembly: "inspection_module2",
  product: "inspection_final",
};
export const departmentNames: Record<string, string> = {
  research_and_development: "R&D",
  quality_assurance: "품질관리",
  production_management: "생산관리",
  system_admin: "시스템 관리자",
};
export const sourceLocation = (source?: { page?: number | null; block_index?: number | null } | null) =>
  source?.block_index ? `블록 ${source.block_index}` : source?.page ? `p${source.page}` : "위치 미확인";
export const dateTime = (value: string) =>
  new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Seoul" }).format(
    new Date(value),
  );
