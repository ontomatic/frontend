import type { RouteConfig } from "@react-router/dev/routes";
import { index, layout, route } from "@react-router/dev/routes";

export default [
  route("api/*", "routes/api-proxy.ts"),
  route("auth/login", "routes/auth/login.tsx"),
  layout("routes/need-auth-layout.tsx", [
    index("routes/home.tsx"),
    route("specifications/:specificationId", "routes/specification.tsx"),
    route("jobs/:jobId", "routes/job.tsx"),
    route("documents", "routes/documents.tsx"),
    route("history", "routes/history.tsx"),
    route("knowledge", "routes/knowledge.tsx"),
    route("admin", "routes/admin.tsx"),
  ]),
] satisfies RouteConfig;
