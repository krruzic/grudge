# pnpm comes from corepack, pinned by package.json "packageManager"; the 7-day minimum release age is in
# pnpm-workspace.yaml.
FROM node:22-alpine AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

FROM base AS build
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm exec tsc --noEmit && pnpm exec vite build --outDir release --emptyOutDir --logLevel warn \
 && node --experimental-transform-types --no-warnings tools/precompress.ts release

FROM base AS deps
RUN pnpm install --frozen-lockfile --prod

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    STATIC_DIR=/app/release \
    PUBLIC_URL=https://grudge.evilma.id \
    STATS_FILE=/app/data/stats.json
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY tools/server.ts tools/netrelay.ts ./tools/
COPY --from=build /app/release ./release
RUN mkdir -p /app/data && chown node:node /app/data
VOLUME /app/data
USER node
EXPOSE 8080
CMD ["node", "--no-warnings", "tools/server.ts"]
