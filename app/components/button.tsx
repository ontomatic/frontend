import type { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
}
const Button = ({ variant = "secondary", className = "", type = "button", ...props }: ButtonProps) => (
  <button
    type={type}
    className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${variant === "primary" ? "border-orange-400 bg-orange-400 text-stone-950 hover:bg-orange-300" : variant === "danger" ? "border-red-200 bg-red-50 text-red-800 hover:bg-red-100" : variant === "ghost" ? "border-transparent hover:bg-stone-100" : "border-line bg-white hover:bg-stone-50"} ${className}`}
    {...props}
  />
);

export default Button;
