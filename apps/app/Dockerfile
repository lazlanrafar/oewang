# syntax=docker/dockerfile:1
FROM oven/bun:1.3.3 AS base
WORKDIR /app

FROM base AS pruner
COPY . .
RUN bunx turbo@2.8.5 prune app --docker

FROM base AS installer
COPY --from=pruner /app/out/json/ .
# turbo prune's pruned bun.lock isn't reliably frozen-installable (malformed
# tuple for the xlsx tarball-URL dep, plus real version drift on other
# apps) — bun regenerates a correct lockfile for the pruned subset instead.
RUN bun install
COPY --from=pruner /app/out/full/ .
RUN bunx turbo build --filter=app

FROM base AS runner
ENV NODE_ENV=production
# bun's hoisting isn't deterministic across installs in this monorepo — "next"
# sometimes lands in root node_modules/.bin, sometimes in the workspace-local
# apps/app/node_modules/.bin. Copying only curated paths risks missing
# wherever it actually landed ("next: command not found" at runtime). Copying
# the whole installer output instead — root package.json/bun.lock included —
# so bun run's workspace-root detection and node_modules resolution both work
# regardless of the layout bun picked.
COPY --from=installer /app ./

WORKDIR /app/apps/app
EXPOSE 3000
CMD ["bun", "run", "start"]
