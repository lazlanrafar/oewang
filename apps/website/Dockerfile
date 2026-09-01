# syntax=docker/dockerfile:1
FROM oven/bun:1.3.3 AS base
WORKDIR /app

FROM base AS pruner
COPY . .
RUN bunx turbo@2.8.5 prune website --docker

FROM base AS installer
COPY --from=pruner /app/out/json/ .
# turbo prune's pruned bun.lock isn't reliably frozen-installable (real
# version drift vs the root lockfile) — bun regenerates a correct one
# for the pruned subset instead.
RUN bun install
COPY --from=pruner /app/out/full/ .
RUN bunx turbo build --filter=website

FROM base AS runner
ENV NODE_ENV=production
COPY --from=installer /app/node_modules ./node_modules
COPY --from=installer /app/apps/website/.next ./apps/website/.next
COPY --from=installer /app/apps/website/public ./apps/website/public
COPY --from=installer /app/apps/website/package.json ./apps/website/package.json
COPY --from=installer /app/apps/website/next.config.mjs ./apps/website/next.config.mjs

WORKDIR /app/apps/website
EXPOSE 3003
CMD ["bun", "run", "start"]
