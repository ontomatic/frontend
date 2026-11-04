import type { ReactNode } from "react";

interface PanelProps {
  children: ReactNode;
  className?: string;
}
const Panel = ({ children, className = "" }: PanelProps) => (
  <section className={`border-line rounded-xl border bg-white p-5 md:p-6 ${className}`}>{children}</section>
);

export default Panel;
