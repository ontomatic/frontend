import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router";

import { FileUploadButton } from "~/features/upload/file-upload-button";
import { logout } from "~/lib/api/auth";
import { getErrorMessage } from "~/lib/api/client";
import { uploadFiles } from "~/lib/api/file";

export const meta = () => [{ title: "파일 업로드" }];

const Home = () => {
  const navigate = useNavigate();
  const mutation = useMutation({ mutationFn: uploadFiles, retry: false, gcTime: 0 });

  return (
    <main className="page-shell">
      <section className="panel" aria-labelledby="upload-title">
        <h1 id="upload-title">파일 업로드</h1>
        <div className="form" aria-busy={mutation.isPending}>
          <p className="form-note" id="upload-help">
            CSV, DOCX, PDF, XLSX 파일을 한 번에 최대 10개까지 업로드할 수 있습니다.
          </p>
          <div className="upload-actions">
            <FileUploadButton isPending={mutation.isPending} onUpload={mutation.mutate} />
            <button
              disabled={mutation.isPending}
              onClick={() => {
                logout();
                void navigate("/auth/login", { replace: true });
              }}
              type="button"
            >
              로그아웃
            </button>
          </div>
          {mutation.isPending ? <p role="status">완료될 때까지 이 페이지를 열어 두세요.</p> : null}
          {mutation.error ? <p role="alert">{getErrorMessage(mutation.error)} 필요하면 다시 로그인해 주세요.</p> : null}
          {mutation.data ? (
            <ul className="upload-results" aria-live="polite" aria-label="파일별 업로드 결과">
              {mutation.data.map((result) => (
                <li key={result.fileId}>
                  <strong>{result.filename}</strong>
                  <span>{result.error ?? `업로드 완료 (파일 ID: ${result.fileId})`}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>
    </main>
  );
};

export default Home;
