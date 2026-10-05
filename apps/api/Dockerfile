# syntax=docker/dockerfile:1
FROM node:22-slim AS builder

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.12.1 --activate

# openssl ANTES de install: el postinstall de @prisma/client detecta la
# versión de libssl del builder — sin él genera el engine para
# openssl-1.1.x y el runtime (openssl 3) no lo encuentra.
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/

RUN pnpm install --frozen-lockfile

COPY . .

# La API importa @omnidance/shared desde dist/ en runtime — el paquete
# debe compilarse antes de la API.
RUN pnpm --filter @omnidance/shared build
RUN pnpm --filter @omnidance/api prisma generate
RUN pnpm --filter @omnidance/api build

FROM node:22-slim AS runtime

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.12.1 --activate

# openssl: prisma engines en alpine-less slim; curl: healthcheck.
RUN apt-get update && apt-get install -y openssl curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production

COPY pnpm-workspace.yaml package.json ./
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 4000

CMD ["node", "apps/api/dist/main.js"]
