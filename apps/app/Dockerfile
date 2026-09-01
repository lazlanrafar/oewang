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
COPY --from=installer /app/node_modules ./node_modules
COPY --from=installer /app/apps/app/.next ./apps/app/.next
COPY --from=installer /app/apps/app/public ./apps/app/public
COPY --from=installer /app/apps/app/package.json ./apps/app/package.json
COPY --from=installer /app/apps/app/next.config.mjs ./apps/app/next.config.mjs

WORKDIR /app/apps/app
EXPOSE 3000
CMD ["bun", "run", "start"]
