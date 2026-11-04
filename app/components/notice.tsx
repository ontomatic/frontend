import type { ReactNode } from "react";

import { getErrorMessage } from "~/lib/api/client";

interface NoticeProps {
  children?: ReactNode;
  error?: unknown;
  tone?: "error" | "info" | "success";
}
const Notice = ({ children, error, tone = "info" }: NoticeProps) => (
  <div
    role={error || tone === "error" ? "alert" : "status"}
    className={`rounded-lg border px-4 py-3 text-sm leading-relaxed ${error || tone === "error" ? "border-red-200 bg-red-50 text-red-800" : tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-100 bg-amber-50 text-amber-900"}`}
  >
    {error ? getErrorMessage(error) : children}
  </div>
);

export default Notice;
