# AI 어시스턴트 웹앱 — Next.js 서버 + PGlite(파일 저장, /data)
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3200 \
    DATABASE_URL=pglite:/data/pglite
COPY --from=build /app/package.json /app/package-lock.json /app/next.config.ts ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/drizzle ./drizzle
VOLUME ["/data"]
EXPOSE 3200
# 서버가 뜰 때 instrumentation.ts가 PGlite 마이그레이션을 적용한다.
CMD ["sh", "-c", "exec node_modules/.bin/next start -H 0.0.0.0 -p ${PORT}"]
