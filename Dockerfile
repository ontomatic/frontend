FROM node:24.14.0-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /app
COPY package.json ./
RUN corepack enable && corepack install && pnpm --version

FROM base AS development-dependencies-env
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN HUSKY=0 pnpm install --frozen-lockfile

FROM base AS production-dependencies-env
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN npm pkg delete scripts.prepare && pnpm install --prod --frozen-lockfile

FROM base AS build-env
COPY --from=development-dependencies-env /app/node_modules /app/node_modules
COPY . .
ARG VITE_API_BASE_URL=/
RUN pnpm build

FROM base
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --from=production-dependencies-env /app/node_modules /app/node_modules
COPY --from=build-env /app/build /app/build
EXPOSE 3000
CMD ["pnpm", "start"]
