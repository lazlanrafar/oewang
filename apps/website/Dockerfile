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
ARG NEXT_PUBLIC_WEBSITE_URL
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_SENTRY_DSN
ARG SENTRY_ORG
ARG SENTRY_PROJECT
ENV NEXT_PUBLIC_WEBSITE_URL=$NEXT_PUBLIC_WEBSITE_URL \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    SENTRY_ORG=$SENTRY_ORG \
    SENTRY_PROJECT=$SENTRY_PROJECT
# SENTRY_AUTH_TOKEN is mounted as a BuildKit secret (never a build-arg/ENV)
# so it never lands in an image layer or build cache — only this RUN's
# process env sees it, for the sentry webpack plugin's source-map upload.
RUN --mount=type=secret,id=sentry_auth_token \
    SENTRY_AUTH_TOKEN="$(cat /run/secrets/sentry_auth_token 2>/dev/null || true)" \
    bunx turbo build --filter=website

FROM base AS runner
ENV NODE_ENV=production
# bun's hoisting isn't deterministic across installs in this monorepo — ANY
# directly-imported package (next's own binary, @sentry/nextjs in
# next.config.mjs, etc.) can end up in root node_modules or in the
# workspace-local apps/website/node_modules depending on the install. Copying
# only curated paths risks missing wherever a given package actually landed
# ("next: command not found", "Cannot find module '@sentry/nextjs'", etc. —
# hit both in practice). Copying the whole installer output instead — root
# package.json/bun.lock included — so resolution works regardless of the
# layout bun picked, at the cost of a slower/larger image build.
RUN addgroup --system --gid 1001 oewang && adduser --system --uid 1001 --ingroup oewang oewang
COPY --from=installer /app ./
RUN chown -R oewang:oewang /app

USER oewang
WORKDIR /app/apps/website
EXPOSE 3003
CMD ["bun", "run", "start"]
