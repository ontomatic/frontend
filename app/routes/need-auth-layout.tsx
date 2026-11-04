import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { Outlet, redirect } from "react-router";

import Notice from "~/components/notice";
import WorkspaceShell from "~/components/workspace-shell";
import { logout } from "~/lib/api/auth";
import apiClient from "~/lib/api/client";
import type { CurrentUser } from "~/lib/api/workspace";

export const clientLoader = async () => {
  try {
    await apiClient.get("/api/v1/auth/me");
    return null;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      logout();
      throw redirect("/auth/login");
    }
    throw error;
  }
};

clientLoader.hydrate = true as const;

export const HydrateFallback = () => (
  <main className="grid min-h-screen place-items-center">
    <p role="status">로그인 상태를 확인하고 있습니다…</p>
  </main>
);

const NeedAuthLayout = () => {
  const query = useQuery({
    queryKey: ["workspace", "me"],
    queryFn: async () => (await apiClient.get<CurrentUser>("/api/v1/auth/me")).data,
  });
  if (query.error) return <Notice error={query.error} />;
  if (!query.data) return <HydrateFallback />;
  return (
    <WorkspaceShell user={query.data}>
      <Outlet context={query.data} />
    </WorkspaceShell>
  );
};

export default NeedAuthLayout;
