import type { ReactNode } from "react";
import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";

import type { Route } from "./+types/root";
import { AppProviders } from "./providers";

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
    <main className="error-page">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
        {stack ? <pre>{stack}</pre> : null}
      </div>
    </main>
  );
};

export default App;
