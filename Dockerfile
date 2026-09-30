FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx tsc --noEmit && npx vite build --outDir release --emptyOutDir --logLevel warn

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    STATIC_DIR=/app/release \
    PUBLIC_URL=https://grudge.evilma.id
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY tools/server.ts tools/netrelay.ts ./tools/
COPY --from=build /app/release ./release
USER node
EXPOSE 8080
CMD ["node", "--no-warnings", "tools/server.ts"]
