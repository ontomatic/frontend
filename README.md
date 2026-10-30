# React Router Starter

React Router framework mode, TypeScript, Tailwind CSS, TanStack Query, React Hook Form, Zod, ky, oxlint, oxfmt 기반 프로젝트입니다.

## 시작

```bash
pnpm install
cp .env.example .env
pnpm dev
```

`VITE_API_BASE_URL`을 API 서버 주소로 변경하세요.

## 명령

```bash
pnpm dev
pnpm typecheck
pnpm lint
pnpm format
pnpm build
pnpm start
```

## 배포

`pnpm build`로 서버 빌드를 생성합니다. 포함된 `Dockerfile`로 컨테이너 배포할 수 있습니다.
