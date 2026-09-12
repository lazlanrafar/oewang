# syntax=docker/dockerfile:1
FROM golang:1.25-alpine AS builder
WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 go build -o /out/worker ./cmd/worker

FROM alpine:3.20 AS runner
RUN apk add --no-cache ca-certificates && adduser -D -u 1001 oewang
COPY --from=builder /out/worker /usr/local/bin/worker

USER oewang
# Coolify (and most PaaS) inject $PORT — the binary reads it via config.Load,
# falling back to 3005 locally.
EXPOSE 3005
CMD ["worker"]
