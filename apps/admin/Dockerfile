# syntax=docker/dockerfile:1
FROM oven/bun:1.3.3 AS base
WORKDIR /app

FROM base AS pruner
COPY . .
RUN bunx turbo@2.8.5 prune admin --docker

FROM base AS installer
COPY --from=pruner /app/out/json/ .
# turbo prune's pruned bun.lock isn't reliably frozen-installable (real
# version drift vs the root lockfile) — bun regenerates a correct one
# for the pruned subset instead.
RUN bun install
COPY --from=pruner /app/out/full/ .
RUN bunx turbo build --filter=admin

FROM base AS runner
ENV NODE_ENV=production
# bun's hoisting isn't deterministic across installs in this monorepo — ANY
# directly-imported package (next's own binary, @sentry/nextjs in
# next.config.mjs, etc.) can end up in root node_modules or in the
# workspace-local apps/admin/node_modules depending on the install. Copying
# only curated paths risks missing wherever a given package actually landed
# ("next: command not found", "Cannot find module '@sentry/nextjs'", etc. —
# hit both in practice). Copying the whole installer output instead — root
# package.json/bun.lock included — so resolution works regardless of the
# layout bun picked, at the cost of a slower/larger image build.
COPY --from=installer /app ./

WORKDIR /app/apps/admin
EXPOSE 3001
CMD ["bun", "run", "start"]
