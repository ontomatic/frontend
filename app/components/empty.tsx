import type { ReactNode } from "react";

interface EmptyProps {
  title?: string;
  children?: ReactNode;
}
const Empty = ({ title = "아직 등록된 항목이 없습니다", children }: EmptyProps) => (
  <div className="grid min-h-48 place-content-center gap-3 text-center">
    <p className="font-medium">{title}</p>
    <div className="text-muted max-w-md text-sm">{children}</div>
  </div>
);

export default Empty;
