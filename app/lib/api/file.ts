import axios from "axios";
import { z } from "zod";

import apiClient, { getErrorMessage } from "./client";

const uploadUrlsSchema = z.array(
  z.object({
    file_id: z.number().int().positive(),
    upload_url: z.url(),
  }),
);

export type UploadResult = { fileId: number; filename: string; error?: string };
type UploadUrl = z.infer<typeof uploadUrlsSchema>[number];

const getUploadUrls = async (files: File[]): Promise<UploadUrl[]> => {
  if (files.length < 1 || files.length > 10) throw new Error("파일은 한 번에 1~10개까지 선택해 주세요.");

  if (files.some(({ name }) => !name || name.length > 255)) throw new Error("파일 이름은 1~255자여야 합니다.");

  if (files.some(({ name }) => !/\.(csv|docx|pdf|xlsx)$/i.test(name)))
    throw new Error("CSV, DOCX, PDF, XLSX 파일만 업로드할 수 있습니다.");

  const metadata = files.map(({ name, type }) => ({
    filename: name,
    content_type: type || "application/octet-stream",
  }));

  const { data } = await apiClient.post<unknown>("/api/v1/uploads", { files: metadata });
  const urls = uploadUrlsSchema.length(files.length).safeParse(data);
  if (!urls.success) throw new Error("업로드 URL 응답이 올바르지 않습니다. 다시 시도해 주세요.");

  return urls.data;
};

const uploadFileToStorage = async (file: File, uploadUrl: string): Promise<void> => {
  await axios.put(uploadUrl, file, {
    headers: { "Content-Type": file.type || "application/octet-stream" },
    timeout: 0,
  });
};

const completeFileUpload = async (fileId: number): Promise<void> => {
  await apiClient.post(`/api/v1/uploads/${fileId}/complete`, undefined, {
    timeout: 0,
  });
};

export const uploadFiles = async (files: File[]): Promise<UploadResult[]> => {
  const urls = await getUploadUrls(files);

  return Promise.all(
    files.map(async (file, index): Promise<UploadResult> => {
      const { file_id, upload_url } = urls[index];
      let step = "스토리지 업로드";
      try {
        await uploadFileToStorage(file, upload_url);
        step = "완료 처리";
        await completeFileUpload(file_id);
        return { fileId: file_id, filename: file.name };
      } catch (error) {
        return {
          fileId: file_id,
          filename: file.name,
          error: `${step} 실패: ${getErrorMessage(error)}`,
        };
      }
    }),
  );
};
