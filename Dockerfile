FROM oven/bun:1.3-alpine

COPY package* bun.lock tsconfig.json ./

RUN bun install

COPY . .

RUN bun --env-file=./config/api.env.example --env-file=./config/db.env.example prisma generate
RUN bun run typecheck
RUN bun run build

ENTRYPOINT [ "bun", "run" ]

CMD [ "start" ]
