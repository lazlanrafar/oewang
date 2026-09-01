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
# bun's hoisting isn't deterministic across installs in this monorepo — "next"
# sometimes lands in root node_modules/.bin, sometimes only in the
# workspace-local apps/website/node_modules/.bin (or is missing from root
# entirely). The real binary always ends up inside root node_modules/.bun/
# (bun's central package store) regardless, so resolve it here — while the
# full pruned workspace is still available — and guarantee a root .bin/next
# symlink exists no matter what bun picked.
RUN test -e node_modules/.bin/next || { \
      NEXT_BIN=$(find . -path "*/node_modules/.bun/next@*/node_modules/next/dist/bin/next" 2>/dev/null | head -1); \
      test -n "$NEXT_BIN" && mkdir -p node_modules/.bin && ln -sf "/app/${NEXT_BIN#./}" node_modules/.bin/next; \
    }
COPY --from=pruner /app/out/full/ .
RUN bunx turbo build --filter=website

FROM base AS runner
ENV NODE_ENV=production
# WORKDIR below is apps/website, but only root node_modules is copied — bun
# run can't walk up to find node_modules/.bin without root package.json (not
# copied), so point PATH at it directly. The symlink guaranteed above ensures
# next resolves regardless of where bun's hoisting put it.
ENV PATH="/app/node_modules/.bin:${PATH}"
COPY --from=installer /app/node_modules ./node_modules
COPY --from=installer /app/apps/website/.next ./apps/website/.next
COPY --from=installer /app/apps/website/public ./apps/website/public
COPY --from=installer /app/apps/website/package.json ./apps/website/package.json
COPY --from=installer /app/apps/website/next.config.mjs ./apps/website/next.config.mjs

WORKDIR /app/apps/website
EXPOSE 3003
CMD ["bun", "run", "start"]
