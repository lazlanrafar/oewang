# Production image for the web app.
#
# `adapter-node` is already configured, so `vite build` produces a server
# under `build/` that needs only a runtime and the production dependencies.
# Two stages so the toolchain, the dev dependencies and the source do not
# ship.
#
# This is the only one of the three images a browser reaches. It is also
# the only process that reads the session cookie and holds the OWE1 client
# for the API hop (D5), which is why nothing in `src/lib/server/` has a
# counterpart in the bundle the browser downloads.

FROM oven/bun:1 AS build

WORKDIR /app

# Dependencies first: they change on a lockfile edit, the source changes on
# every commit. `--ignore-scripts` matches CI and the supply-chain rule
# (docs/security/hardening.md#dependencies).
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts

COPY . .
# `check` regenerates the i18n key union from en.json before typechecking;
# the build needs the same generated file, and generating it here means a
# stale committed copy cannot reach production.
RUN bun run i18n:keys && bun run build

# Again from the lockfile, production only, into a clean tree the runtime
# stage copies whole.
RUN rm -rf node_modules && bun install --frozen-lockfile --ignore-scripts --production

FROM oven/bun:1-slim AS runtime

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

RUN useradd --system --create-home --uid 10003 oewang

WORKDIR /app
COPY --from=build --chown=oewang:oewang /app/build build
COPY --from=build --chown=oewang:oewang /app/node_modules node_modules
COPY --from=build --chown=oewang:oewang /app/package.json package.json

USER oewang

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD curl -fsS http://127.0.0.1:3000/health || exit 1

CMD ["bun", "run", "build/index.js"]
