import { useNavigate } from "react-router";

import Panel from "~/components/panel";
import LoginForm from "~/features/auth/login-form";

export const meta = () => [{ title: "로그인" }];

const Login = () => {
  const navigate = useNavigate();

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-[472px] content-center gap-6 px-4 py-12">
      <div className="flex items-center justify-center gap-3 text-2xl font-bold tracking-tight">
        <span className="text-accent grid size-10 place-items-center rounded-xl bg-orange-200">O</span>Ontomatic
      </div>
      <Panel>
        <h1 id="login-title" className="text-xl font-semibold">
          워크스페이스 로그인
        </h1>
        <LoginForm onLogin={() => navigate("/", { replace: true })} />
      </Panel>
      <p className="text-muted text-center text-xs">문서에서 생산까지 · 부서별 담당 계정으로 로그인하세요.</p>
    </main>
  );
};

export default Login;
