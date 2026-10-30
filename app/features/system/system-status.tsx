import { useQuery } from "@tanstack/react-query";

type SystemStatusProps = {
  generatedAt: string;
};

export function SystemStatus({ generatedAt }: SystemStatusProps) {
  const statusQuery = useQuery({
    queryFn: async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));

      return {
        checkedAt: new Date().toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        label: "Ready",
      };
    },
    queryKey: ["system-status"],
  });

  return (
    <aside className="status-panel" aria-label="Template status">
      <div>
        <p className="eyebrow">Status</p>
        <strong>{statusQuery.data?.label ?? "Checking"}</strong>
      </div>
      <dl>
        <div>
          <dt>Generated</dt>
          <dd>{new Date(generatedAt).toLocaleDateString("en-US")}</dd>
        </div>
        <div>
          <dt>Client check</dt>
          <dd>{statusQuery.data?.checkedAt ?? "Pending"}</dd>
        </div>
      </dl>
    </aside>
  );
}
