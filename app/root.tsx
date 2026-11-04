import type { ReactNode } from "react";
import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";

import type { Route } from "./+types/root";
import AppProviders from "./providers";

import appStylesHref from "./styles/app.css?url";

export const Layout = ({ children }: { children: ReactNode }) => {
  return (
    <html lang="ko">
      <head>
        <meta charSet="utf-8" />
        <meta content="width=device-width, initial-scale=1" name="viewport" />
        <Meta />
        <Links />
        <link href={appStylesHref} rel="stylesheet" />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
};

const App = () => {
  return (
    <AppProviders>
      <Outlet />
    </AppProviders>
  );
};

export const ErrorBoundary = ({ error }: Route.ErrorBoundaryProps) => {
  let title = "오류가 발생했습니다";
  let description = "요청을 처리하지 못했습니다.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    title = error.status === 404 ? "페이지를 찾을 수 없습니다" : `오류 ${error.status}`;
    description = error.statusText || description;
  } else if (import.meta.env.DEV && error instanceof Error) {
    description = error.message;
    stack = error.stack;
  }

  return (
    <main className="grid min-h-screen place-items-center p-8">
      <div className="border-line w-full max-w-2xl rounded-xl border bg-white p-8">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="text-muted mt-4 text-sm">{description}</p>
        <a href="/" className="mt-5 inline-block text-sm">
          워크스페이스로 돌아가기 →
        </a>
        {stack ? (
          <pre className="mt-5 overflow-auto rounded-lg bg-stone-900 p-4 text-xs text-white">{stack}</pre>
        ) : null}
      </div>
    </main>
  );
};

export default App;
