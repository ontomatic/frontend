import type { ReactNode } from "react";

interface FieldProps {
  label: string;
  children: ReactNode;
  hint?: string;
  className?: string;
}
const Field = ({ label, children, hint, className = "" }: FieldProps) => (
  <label className={`grid content-start gap-2 text-sm ${className}`}>
    <span className="font-medium">{label}</span>
    {children}
    {hint && <span className="text-muted text-xs">{hint}</span>}
  </label>
);

export default Field;
