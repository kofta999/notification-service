FROM oven/bun:1.3-alpine AS base
WORKDIR /app
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

FROM base AS builder
WORKDIR /app

COPY --chown=appuser:appgroup package.json bun.lock ./
COPY --chown=appuser:appgroup packages/api/package.json ./packages/api/
COPY --chown=appuser:appgroup packages/worker/package.json ./packages/worker/
COPY --chown=appuser:appgroup packages/shared/package.json ./packages/shared/

RUN bun install --production

COPY --chown=appuser:appgroup . .

RUN bun --filter=shared run build && bun run typecheck && bun run build

FROM base AS runner
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/api/dist ./packages/api/dist
COPY --from=builder /app/packages/worker/dist ./packages/worker/dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/packages/api/package.json ./packages/api/
COPY --from=builder /app/packages/worker/package.json ./packages/worker/
COPY --from=builder /app/packages/shared/package.json ./packages/shared/

USER appuser
CMD [ "bun", "run" ,"start" ]
