import axios from "axios";
import { Outlet, redirect } from "react-router";

import { logout } from "~/lib/api/auth";
import apiClient from "~/lib/api/client";

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
  <main className="page-shell">
    <p role="status">로그인 상태를 확인하고 있습니다…</p>
  </main>
);

const NeedAuthLayout = () => <Outlet />;

export default NeedAuthLayout;
