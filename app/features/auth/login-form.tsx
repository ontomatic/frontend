import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";

import Button from "~/components/button";
import Field from "~/components/field";
import Notice from "~/components/notice";
import { login } from "~/lib/api/auth";

interface LoginFormProps {
  onLogin: () => void;
}
const LoginForm = ({ onLogin }: LoginFormProps) => {
  const { handleSubmit, register } = useForm<{ emp_id: string; password: string }>();
  const mutation = useMutation({ mutationFn: login, onSuccess: onLogin, retry: false, gcTime: 0 });

  return (
    <form className="mt-5 grid gap-4" onSubmit={handleSubmit((values) => mutation.mutate(values))}>
      <p className="text-muted text-sm">사양·생산·검사 업무를 이어서 확인하세요.</p>
      <Field label="사번">
        <input autoComplete="username" maxLength={30} required disabled={mutation.isPending} {...register("emp_id")} />
      </Field>
      <Field label="비밀번호">
        <input
          autoComplete="current-password"
          maxLength={30}
          required
          type="password"
          disabled={mutation.isPending}
          {...register("password")}
        />
      </Field>
      <Button variant="primary" disabled={mutation.isPending} type="submit">
        {mutation.isPending ? "로그인 중…" : "로그인"}
      </Button>
      {mutation.error ? <Notice error={mutation.error} /> : null}
    </form>
  );
};

export default LoginForm;
