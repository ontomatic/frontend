import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router";

import { logout } from "~/lib/api/auth";
import { departmentNames } from "~/lib/api/workspace";
import type { CurrentUser } from "~/lib/api/workspace";

import Button from "./button";

interface WorkspaceShellProps {
  user: CurrentUser;
  children: ReactNode;
}
const links = [
  ["/", "워크스페이스", "◫"],
  ["/?view=specifications", "제품·사양", "▤"],
  ["/?view=rd", "R&D 확인", "◎"],
  ["/?view=jobs", "구성·생산 건", "◇"],
  ["/?view=quality", "품질관리", "✓"],
  ["/?view=production", "생산·계획", "▥"],
  ["/documents", "문서함", "▧"],
  ["/history", "버전·이력", "◷"],
  ["/knowledge", "근거 기반 질문", "✧"],
];
const WorkspaceShell = ({ user, children }: WorkspaceShellProps) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only z-50 rounded-md bg-white p-3 focus:not-sr-only focus:absolute">
        본문으로 이동
      </a>
      {open && (
        <button
          aria-label="메뉴 닫기"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-stone-950/25 lg:hidden"
        />
      )}
      <aside
        id="workspace-navigation"
        className={`border-line bg-canvas fixed inset-y-0 left-0 z-40 w-60 flex-col border-r px-5 py-7 ${open ? "flex" : "hidden lg:flex"}`}
      >
        <Link to="/" className="text-ink mb-9 flex items-center gap-2.5 px-2 text-xl font-bold tracking-tight">
          <span className="text-accent grid size-8 place-items-center rounded-lg bg-orange-200">O</span>Ontomatic
        </Link>
        <p className="text-muted mb-3 px-3 text-[11px] font-semibold tracking-widest">WORKSPACE</p>
        <nav aria-label="주 메뉴" className="grid gap-1">
          {links.map(([href, label, icon]) => (
            <Link
              key={href}
              to={href}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm ${location.pathname + location.search === href ? "text-accent bg-orange-100/80 font-semibold" : "text-ink hover:bg-white/80"}`}
            >
              <span aria-hidden="true" className="text-muted w-4 text-center text-base">
                {icon}
              </span>
              {label}
            </Link>
          ))}
          {user.role === "system_admin" && (
            <Link to="/admin" className="px-3 py-3 text-sm">
              계정·부서 관리
            </Link>
          )}
        </nav>
        <div className="border-line text-muted mt-auto border-t px-2 pt-5 text-xs leading-6">
          문서에서 생산까지
          <br />
          <span className="text-stone-500">사양 · BOM · 생산 · 검사</span>
        </div>
      </aside>
      <div className="lg:ml-60">
        <header className="flex min-h-20 items-center gap-3 px-5 md:px-9">
          <Button
            aria-label={open ? "메뉴 닫기" : "메뉴 열기"}
            aria-expanded={open}
            aria-controls="workspace-navigation"
            variant="ghost"
            className="px-2 lg:hidden"
            onClick={() => setOpen(!open)}
          >
            ☰
          </Button>
          <form
            className="max-w-xl flex-1"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              void navigate(`/?q=${encodeURIComponent(search)}`);
            }}
          >
            <input
              aria-label="품목명·코드·부서별 별칭 검색"
              placeholder="⌕  품목명·코드·부서별 별칭 검색"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </form>
          <details className="relative ml-auto shrink-0 text-sm">
            <summary className="text-muted rounded-md px-2 py-2">
              {departmentNames[user.department?.code ?? user.role] ?? user.name}⌄
            </summary>
            <div className="border-line absolute right-0 z-20 mt-2 w-52 rounded-lg border bg-white p-4 shadow-lg">
              <p className="font-semibold">{user.name}</p>
              <p className="text-muted my-2 text-xs">{user.emp_id}</p>
              <Button
                className="w-full"
                onClick={() => {
                  logout();
                  queryClient.clear();
                  void navigate("/auth/login");
                }}
              >
                로그아웃
              </Button>
            </div>
          </details>
        </header>
        <main id="main" className="mx-auto max-w-[1600px] px-5 pt-5 pb-12 md:px-9 md:pt-8">
          {children}
        </main>
      </div>
    </div>
  );
};

export default WorkspaceShell;
