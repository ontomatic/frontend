import Cookies from "universal-cookie";

import apiClient from "./client";

export { getAccessToken } from "./client";

type LoginValues = { emp_id: string; password: string };

export const login = async (values: LoginValues): Promise<string> => {
  const { data } = await apiClient.post<{ accessToken: string }>("/api/v1/auth/login", values);

  new Cookies().set("accessToken", data.accessToken, {
    path: "/",
    sameSite: "lax",
    secure: document.location.protocol === "https:",
  });
  return data.accessToken;
};

export const logout = (): void => {
  new Cookies().remove("accessToken", { path: "/", sameSite: "lax" });
};
