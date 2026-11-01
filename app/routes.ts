import type { RouteConfig } from "@react-router/dev/routes";
import { index, layout, route } from "@react-router/dev/routes";

export default [
  route("auth/login", "routes/auth/login.tsx"),
  layout("routes/need-auth-layout.tsx", [index("routes/home.tsx")]),
] satisfies RouteConfig;
