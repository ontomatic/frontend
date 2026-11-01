import { useNavigate } from "react-router";

import { LoginForm } from "~/features/auth/login-form";

export const meta = () => [{ title: "로그인" }];

const Login = () => {
  const navigate = useNavigate();

  return (
    <main className="page-shell">
      <section className="panel" aria-labelledby="login-title">
        <h1 id="login-title">로그인</h1>
        <LoginForm onLogin={() => navigate("/", { replace: true })} />
      </section>
    </main>
  );
};

export default Login;
