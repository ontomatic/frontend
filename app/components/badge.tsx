import type { ReactNode } from "react";

import { statusNames } from "~/lib/api/workspace";

interface BadgeProps {
  status?: string;
  children?: ReactNode;
}
const Badge = ({ status = "waiting", children }: BadgeProps) => (
  <span
    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs whitespace-nowrap ${["passed", "completed", "submitted", "ready"].includes(status) ? "bg-emerald-50 text-emerald-800" : ["held", "error"].includes(status) ? "bg-red-50 text-red-800" : ["producing", "inspection", "indexing", "partial", "completed_with_defects"].includes(status) ? "bg-orange-50 text-orange-900" : "bg-stone-100 text-stone-600"}`}
  >
    <span aria-hidden="true" className="size-1.5 rounded-full bg-current opacity-60" />
    {children ?? statusNames[status] ?? status}
  </span>
);

export default Badge;
