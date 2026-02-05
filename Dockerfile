FROM oven/bun:1.3-alpine AS base

FROM base AS builder

WORKDIR /app

COPY package* bun.lock tsconfig.json ./

RUN bun install

COPY . .

RUN bun --env-file=./config/api.env.example --env-file=./config/db.env.example prisma generate && bun run typecheck && bun run build

FROM base AS runner

WORKDIR /app

COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/package.json /app/package.json

ENTRYPOINT [ "bun", "run" ]

CMD [ "start" ]
