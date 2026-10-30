import axios from "axios";
import Cookies from "universal-cookie";

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "/",
  timeout: 3000,
  headers: {
    "Content-Type": "application/json",
  },
});

export const getAccessToken = (): string | null =>
  new Cookies().get<string | undefined>("accessToken", { doNotParse: true }) || null;

apiClient.interceptors.request.use((config) => {
  const accessToken = getAccessToken();
  if (accessToken) config.headers.set("Authorization", `Bearer ${accessToken}`);
  else config.headers.delete("Authorization");
  return config;
});

export const getErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError<{ message?: string }>(error)) {
    if (typeof error.response?.data?.message === "string") return error.response.data.message;
    if (error.response) return `요청에 실패했습니다 (HTTP ${error.response.status}).`;
    return "서버에 연결하지 못했습니다. 네트워크 연결과 서버 설정을 확인해 주세요.";
  }
  return error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
};

export default apiClient;
