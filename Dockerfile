FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
ARG TARGETARCH
COPY package.json package-lock.json ./
RUN npm ci \
    && if [ "$TARGETARCH" = "arm64" ]; then \
         npm install --no-save --no-package-lock \
           @next/swc-linux-arm64-gnu@16.2.6 \
           @tailwindcss/oxide-linux-arm64-gnu@4.2.1 \
           lightningcss-linux-arm64-gnu@1.31.1; \
       else \
         npm install --no-save --no-package-lock \
           @next/swc-linux-x64-gnu@16.2.6 \
           @tailwindcss/oxide-linux-x64-gnu@4.2.1 \
           lightningcss-linux-x64-gnu@1.31.1; \
       fi

FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    DATABASE_PATH=/app/data/anime-cloud.sqlite

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs \
    && mkdir -p /app/data \
    && chown nextjs:nodejs /app/data

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "server.js"]
