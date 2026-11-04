import type { ReactNode } from "react";

interface TitleProps {
  title: string;
  description?: string;
  children?: ReactNode;
}
const PageTitle = ({ title, description, children }: TitleProps) => (
  <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
    <div>
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      {description && <p className="text-muted mt-2 text-sm">{description}</p>}
    </div>
    {children}
  </div>
);

export default PageTitle;
