import type { ReactNode } from "react";

interface TableProps {
  headings: string[];
  children: ReactNode;
  className?: string;
}
const Table = ({ headings, children, className = "" }: TableProps) => (
  <div className={`border-line overflow-x-auto rounded-lg border ${className}`}>
    <table className="w-full border-collapse text-left text-sm">
      <thead className="text-muted bg-stone-50/70 text-xs">
        <tr>
          {headings.map((heading, i) => (
            <th key={`${heading}-${i}`} className="px-4 py-3 font-medium whitespace-nowrap" scope="col">
              {heading}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-line divide-y [&_td]:px-4 [&_td]:py-4">{children}</tbody>
    </table>
  </div>
);

export default Table;
