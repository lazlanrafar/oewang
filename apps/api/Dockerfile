# syntax=docker/dockerfile:1
FROM oven/bun:1.3.3 AS base
WORKDIR /app

FROM base AS pruner
COPY . .
RUN bunx turbo@2.8.5 prune api --docker

FROM base AS installer
COPY --from=pruner /app/out/json/ .
# turbo prune's pruned bun.lock isn't reliably frozen-installable (real
# version drift vs the root lockfile) — bun regenerates a correct one
# for the pruned subset instead.
RUN bun install
COPY --from=pruner /app/out/full/ .
RUN bunx turbo build --filter=api
# Prune devDependencies now that the build output exists — dist is already
# compiled JS, so typescript/drizzle-kit/test tooling aren't needed at runtime.
RUN rm -rf node_modules && bun install --production

FROM base AS runner
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 oewang && adduser --system --uid 1001 --ingroup oewang oewang
COPY --from=installer /app/node_modules ./node_modules
COPY --from=installer /app/apps/api/dist ./apps/api/dist
COPY --from=installer /app/apps/api/package.json ./apps/api/package.json
RUN mkdir -p /app/logs && chown -R oewang:oewang /app

USER oewang
EXPOSE 3002
CMD ["bun", "run", "apps/api/dist/index.js"]
