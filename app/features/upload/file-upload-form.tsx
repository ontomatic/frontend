import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";

import { getAccessToken, login, logout } from "~/lib/api/auth";
import { getErrorMessage } from "~/lib/api/client";
import { uploadFiles } from "~/lib/api/file";

const LoginForm = ({ onLogin }: { onLogin: (accessToken: string) => void }) => {
  const { handleSubmit, register } = useForm<{ emp_id: string; password: string }>();
  const mutation = useMutation({ mutationFn: login, onSuccess: onLogin, retry: false, gcTime: 0 });

  return (
    <form className="form" onSubmit={handleSubmit((values) => mutation.mutate(values))}>
      <p className="form-note">파일을 업로드하려면 로그인해 주세요.</p>
      <label>
        <span>사번</span>
        <input autoComplete="username" maxLength={30} required disabled={mutation.isPending} {...register("emp_id")} />
      </label>
      <label>
        <span>비밀번호</span>
        <input
          autoComplete="current-password"
          maxLength={30}
          required
          type="password"
          disabled={mutation.isPending}
          {...register("password")}
        />
      </label>
      <button disabled={mutation.isPending} type="submit">
        {mutation.isPending ? "로그인 중…" : "로그인"}
      </button>
      {mutation.error ? <p role="alert">{getErrorMessage(mutation.error)}</p> : null}
    </form>
  );
};

const UploadForm = ({ onLogout }: { onLogout: () => void }) => {
  const { handleSubmit, register, reset } = useForm<{ files: FileList }>();
  const mutation = useMutation({
    mutationFn: uploadFiles,
    onSuccess: () => reset(),
    retry: false,
    gcTime: 0,
  });

  return (
    <form
      className="form"
      aria-busy={mutation.isPending}
      onSubmit={handleSubmit(({ files }) => mutation.mutate(Array.from(files)))}
    >
      <label>
        <span>파일 선택</span>
        <input
          accept=".csv,.docx,.pdf,.xlsx"
          aria-describedby="upload-help"
          disabled={mutation.isPending}
          multiple
          required
          type="file"
          {...register("files", { onChange: () => mutation.reset() })}
        />
      </label>
      <p className="form-note" id="upload-help">
        CSV, DOCX, PDF, XLSX 파일을 한 번에 최대 10개까지 업로드할 수 있습니다.
      </p>
      <div className="upload-actions">
        <button disabled={mutation.isPending} type="submit">
          {mutation.isPending ? "업로드 및 문서 처리 중…" : "업로드"}
        </button>
        <button disabled={mutation.isPending} onClick={onLogout} type="button">
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
    </form>
  );
};

export const FileUploadForm = () => {
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    setAccessToken(getAccessToken());
  }, []);

  return accessToken ? (
    <UploadForm
      onLogout={() => {
        logout();
        setAccessToken(null);
      }}
    />
  ) : (
    <LoginForm onLogin={setAccessToken} />
  );
};
