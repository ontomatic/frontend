import type { ReactNode } from "react";

interface CheckProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  children: ReactNode;
  disabled?: boolean;
}
const Check = ({ checked, onChange, children, disabled }: CheckProps) => (
  <label className="flex items-start gap-2.5 text-sm leading-relaxed">
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
      className="mt-1 size-4 shrink-0 accent-orange-700"
    />
    <span>{children}</span>
  </label>
);

export default Check;
