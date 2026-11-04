import type { RouteConfig } from "@react-router/dev/routes";
import { index, layout, route } from "@react-router/dev/routes";

export default [
  route("auth/login", "routes/auth/login.tsx"),
  layout("routes/need-auth-layout.tsx", [
    index("routes/home.tsx"),
    route("specifications/:specificationId", "routes/specification.tsx"),
    route("jobs/:jobId", "routes/job.tsx"),
    route("documents", "routes/documents.tsx"),
    route("history", "routes/history.tsx"),
  ]),
] satisfies RouteConfig;
