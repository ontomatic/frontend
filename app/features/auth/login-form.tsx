import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";

import { login } from "~/lib/api/auth";
import { getErrorMessage } from "~/lib/api/client";

export const LoginForm = ({ onLogin }: { onLogin: () => void }) => {
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
