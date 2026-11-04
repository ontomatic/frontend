import { kindNames } from "~/lib/api/workspace";
import type { CompositionGroup, Target } from "~/lib/api/workspace";

import Badge from "./badge";

interface BomGraphProps {
  targets: Record<string, Target>;
  selected: string;
  onSelect: (id: string) => void;
  groups?: CompositionGroup[];
  actionLabels?: Record<string, string>;
}
const BomGraph = ({ targets, selected, onSelect, groups = [], actionLabels = {} }: BomGraphProps) => {
  const qualityStage = (kind: Target["kind"]) => (kind === "material" ? 1 : kind === "product" ? 3 : 2);
  const columns: Target[][] = [[], [], []];
  Object.values(targets).forEach((target) => {
    columns[3 - qualityStage(target.kind)].push(target);
  });
  const root = columns[0][0];
  const flows = new Map<string, { parents: Target[]; children: Target[] }>();
  columns[2].forEach((target) => {
    let parents = columns[1].filter((parent) => target.parents.includes(parent.id));
    if (!parents.length) {
      parents = columns[1].filter((parent) =>
        groups.some((group) => group.target_ids.includes(target.id) && group.target_ids.includes(parent.id)),
      );
    }
    if (!parents.length) parents = columns[1];
    if (!parents.length) return;
    const key = JSON.stringify(parents.map((parent) => parent.id));
    const flow = flows.get(key);
    if (flow) flow.children.push(target);
    else flows.set(key, { parents, children: [target] });
  });
  const positions = Object.fromEntries(
    columns.flatMap((column, level) =>
      column.map((target, row) => [target.id, { x: level * 270 + 12, y: row * 172 + 44 }]),
    ),
  );
  const width = Math.max(columns.length * 270, 300);
  const height = Math.max(...columns.map((column) => column.length), 1) * 172 + 55;
  return (
    <div className="border-line overflow-auto rounded-lg border bg-stone-50/50">
      <p className="text-muted px-3 pt-3 text-xs">품질 단계 연결 · 모듈별 묶음, 미분류 품목은 공통 묶음</p>
      <div className="relative" style={{ width, height }}>
        <svg aria-hidden="true" className="pointer-events-none absolute inset-0" width={width} height={height}>
          {root &&
            columns[1].map((target) => {
              const from = positions[root.id];
              const to = positions[target.id];
              const highlighted = selected === root.id || selected === target.id;
              return (
                <path
                  key={`${root.id}:${target.id}`}
                  d={`M${from.x + 230},${from.y + 72} C${from.x + 250},${from.y + 72} ${to.x - 20},${to.y + 72} ${to.x},${to.y + 72}`}
                  fill="none"
                  stroke={highlighted ? "#d59358" : "#ddd6ca"}
                  strokeWidth={highlighted ? 2 : 1}
                >
                  <title>{`${root.name} → ${target.name}`}</title>
                </path>
              );
            })}
          {[...flows.entries()].map(([key, flow], index) => {
            const x = positions[flow.parents[0].id].x + 230 + (40 * (index + 1)) / (flows.size + 1);
            const centers = [...flow.parents, ...flow.children].map((target) => positions[target.id].y + 72);
            const highlighted = [...flow.parents, ...flow.children].some((target) => target.id === selected);
            return (
              <path
                key={key}
                d={[
                  `M${x},${Math.min(...centers)} V${Math.max(...centers)}`,
                  ...flow.parents.map(
                    (target) => `M${positions[target.id].x + 230},${positions[target.id].y + 72} H${x}`,
                  ),
                  ...flow.children.map((target) => `M${x},${positions[target.id].y + 72} H${positions[target.id].x}`),
                ].join(" ")}
                fill="none"
                stroke={highlighted ? "#d59358" : "#ddd6ca"}
                strokeWidth={highlighted ? 2 : 1}
              >
                <title>{`${flow.parents.map((target) => target.name).join(", ")} → ${flow.children.map((target) => target.name).join(", ")}`}</title>
              </path>
            );
          })}
        </svg>
        {columns.map((column, level) => (
          <div key={level}>
            <p className="text-muted absolute top-3 text-xs font-medium" style={{ left: level * 270 + 15 }}>
              구성 깊이 {level} · 품질 {3 - level}차
            </p>
            {column.map((target) => {
              const moduleNames = groups
                .filter((group) => group.target_ids.includes(target.id))
                .map((group) => group.name)
                .join(", ");
              return (
                <button
                  key={target.id}
                  aria-pressed={selected === target.id}
                  onClick={() => onSelect(target.id)}
                  className={`absolute grid h-36 w-[230px] gap-1.5 rounded-lg border bg-white p-3 text-left ${selected === target.id ? "border-orange-400 ring-2 ring-orange-100" : "border-line hover:border-orange-200"}`}
                  style={{ left: positions[target.id].x, top: positions[target.id].y }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted text-[11px]">
                      {kindNames[target.kind]} · 품질 {qualityStage(target.kind)}차
                    </span>
                    <Badge status={target.status} />
                  </div>
                  <strong className="truncate text-sm">{target.name}</strong>
                  {moduleNames && (
                    <span className="text-muted truncate text-[11px]" title={moduleNames}>
                      {moduleNames}
                    </span>
                  )}
                  <span className="text-muted truncate text-xs">
                    {target.code} v{target.version} · {target.quantity}
                    {target.unit} · 회차 {target.round}
                  </span>
                  <span className="text-muted truncate text-[11px]">
                    {["passed", "partial"].includes(target.status)
                      ? "현재 회차 양품 승인"
                      : (actionLabels[target.id] ?? target.waiting_reasons[0] ?? target.condition)}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

export default BomGraph;
