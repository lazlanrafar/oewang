# Production image for the API.
#
# Two stages. The first has the Rust toolchain and the whole workspace; the
# second has a binary and the two libraries it links against, and no shell
# tooling, no compiler and no source. An image that cannot compile is one
# fewer thing an attacker who reaches the container can do.
#
# Migrations are not run from here. The application role owns no DDL rights
# in production and migrations run as a separate role in a separate step
# (docs/security/hardening.md#database, docs/deployment.md).

FROM rust:1-bookworm AS build

WORKDIR /app

# The committed .sqlx cache is what makes this build work without a
# database. A query added without `cargo sqlx prepare` fails here rather
# than at runtime, which is the point of it being checked in.
ENV SQLX_OFFLINE=true

# Dependencies first, in their own layer: they change on a lockfile edit,
# and the source changes on every commit. Without this split every push
# recompiles axum, sqlx and reqwest from nothing.
COPY Cargo.toml Cargo.lock ./
COPY crates/clients/Cargo.toml crates/clients/
COPY crates/db/Cargo.toml crates/db/
COPY crates/domain/Cargo.toml crates/domain/
COPY crates/server/Cargo.toml crates/server/
RUN mkdir -p crates/clients/src crates/db/src crates/domain/src crates/server/src \
 && echo "" > crates/clients/src/lib.rs \
 && echo "" > crates/db/src/lib.rs \
 && echo "" > crates/domain/src/lib.rs \
 && echo "fn main() {}" > crates/server/src/main.rs \
 && cargo build --release --bin oewang-api \
 && rm -rf crates/*/src

COPY .sqlx .sqlx
COPY crates crates
# `sqlx::migrate!` embeds the migration files at compile time, so they are a
# build input, not just a deployment artefact. The binary carries them; the
# separate migration step runs them as a role that may (hardening.md#database).
COPY migrations migrations
# The stub binary above is newer than the real source on some filesystems,
# so touch the entry points to force the rebuild cargo would otherwise skip.
RUN touch crates/*/src/lib.rs crates/server/src/main.rs \
 && cargo build --release --bin oewang-api

FROM debian:bookworm-slim AS runtime

# ca-certificates for the two outbound calls the API makes, to the AI
# service and to object storage (docs/security/hardening.md#outbound-calls).
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*

# Unprivileged, and it owns nothing it runs. The signing key is mounted
# read-only from the secret store, mode 0600, and never created here: the
# startup path refuses to create one outside development
# (docs/api/encryption.md#server-signing-keys).
RUN useradd --system --create-home --uid 10001 oewang
USER oewang
WORKDIR /home/oewang

COPY --from=build /app/target/release/oewang-api /usr/local/bin/oewang-api

EXPOSE 3002

# Liveness, not readiness: /health/ready touches the database, and a probe
# that fails because PostgreSQL blinked should not restart the API
# (docs/deployment.md).
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD curl -fsS http://127.0.0.1:3002/health || exit 1

CMD ["oewang-api"]
