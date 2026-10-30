import axios from "axios";

const apiClient = axios.create({
  baseURL: process.env.BACKEND_API_URL,
  timeout: 3000,
  headers: {
    "Content-Type": "application/json",
  },
});

export default apiClient;
