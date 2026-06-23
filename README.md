# oewang

**Track daily money without manual spreadsheets.**

oewang is a personal finance tracker for everyone. AI-powered insights, simple transaction input, automatic categorization, receipts, wallets, and more.

## Features

- **Transactions** - Daily income and expenses, organized and categorized
- **AI Assistant** - Ask anything about your finances in plain language
- **Invoices** - Professional invoices, payments tracked automatically
- **Vault** - Receipts and documents, organized and secure
- **Multi-currency** - Support for 150+ currencies
- **Integrations** - Telegram, and more coming soon

## Tech Stack

- **App**: Next.js 16, React 19, TypeScript, Tailwind CSS, Shadcn UI
- **API**: ElysiaJS, Bun
- **Database**: PostgreSQL, Drizzle ORM
- **Auth**: Custom JWT (HS256), Google/GitHub OAuth
- **Payments**: Mayar (Indonesian Payment Gateway)
- **AI**: OpenAI, Claude, and multi-agent system

## Getting Started

### Prerequisites

- Bun 1.3+
- Node.js 18+
- PostgreSQL database

### Installation

```bash
# Install dependencies
bun install

# Copy environment variables
cp .env.example .env

# Run migrations
bun run migrate

# Start development servers
bun run dev
```

### Environment Variables

All env vars live in a **single root `.env`** file. Never create `.env` files inside `apps/*` or `packages/*` — Turborepo surfaces them via `turbo.json → globalEnv`.

Copy the example and fill in your values:

```bash
cp .env.example .env
```

---

#### Core (required for all apps)

| Variable         | Required | Description                             |
| ---------------- | -------- | --------------------------------------- |
| `NODE_ENV`       | Yes      | `development` \| `test` \| `production` |
| `DATABASE_URL`   | Yes      | PostgreSQL connection string            |
| `JWT_SECRET`     | Yes      | HS256 signing secret — **min 32 chars** |
| `ENCRYPTION_KEY` | Yes      | AES-256-GCM key — **exactly 32 chars**  |

---

#### App URLs

All URL configuration uses `NEXT_PUBLIC_*` vars — they work on both the client (Next.js static replacement) and server (Bun/Node reads them as regular env vars). No separate `APP_URL` / `API_BASE_URL` duplicates needed.

| Variable                  | Required | Description                                                                                                                                                 |
| ------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`     | Yes      | Base URL of `apps/api` — **without** a trailing `/v1` (e.g. `http://localhost:3002`). Used for OAuth callbacks, webhook registration, and the axios client. |
| `NEXT_PUBLIC_APP_URL`     | Yes      | URL of `apps/app` (e.g. `http://localhost:3000`). Used for invite links and OAuth redirects.                                                                |
| `NEXT_PUBLIC_ADMIN_URL`   | Yes      | URL of `apps/admin`                                                                                                                                         |
| `NEXT_PUBLIC_WEBSITE_URL` | No       | URL of `apps/website`                                                                                                                                       |
| `API_PORT`                | No       | Port the API listens on (default `3002`)                                                                                                                    |

> **Local dev**
>
> ```
> NEXT_PUBLIC_API_URL=http://localhost:3002
> NEXT_PUBLIC_APP_URL=http://localhost:3000
> NEXT_PUBLIC_ADMIN_URL=http://localhost:3001
> NEXT_PUBLIC_WEBSITE_URL=http://localhost:3003
> ```
>
> **Tunnel / production**
>
> ```
> NEXT_PUBLIC_API_URL=https://3002.yourtunnel.com
> NEXT_PUBLIC_APP_URL=https://app.oewang.com
> NEXT_PUBLIC_ADMIN_URL=https://console.oewang.com
> NEXT_PUBLIC_WEBSITE_URL=https://oewang.com
> ```

---

#### Redis

Use **one** of the two options. Local Docker uses `REDIS_URL`; Upstash (production) uses the REST vars.

| Variable                   | Description                                             |
| -------------------------- | ------------------------------------------------------- |
| `REDIS_URL`                | `redis://localhost:6379` — local ioredis TCP connection |
| `UPSTASH_REDIS_REST_URL`   | Upstash REST endpoint (production)                      |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash REST token (production)                         |

---

#### Auth & OAuth

| Variable               | Required | Description                     |
| ---------------------- | -------- | ------------------------------- |
| `JWT_EXPIRES_IN`       | No       | Token lifetime (default `7d`)   |
| `GOOGLE_CLIENT_ID`     | No       | Google OAuth — login via Google |
| `GOOGLE_CLIENT_SECRET` | No       | Google OAuth secret             |
| `GITHUB_CLIENT_ID`     | No       | GitHub OAuth — login via GitHub |
| `GITHUB_CLIENT_SECRET` | No       | GitHub OAuth secret             |

---

#### AI Providers

Set at least one. The AI service tries providers in order: OpenAI → Anthropic → Gemini.

| Variable            | Description                    |
| ------------------- | ------------------------------ |
| `OPENAI_API_KEY`    | OpenAI API key (`sk-proj-...`) |
| `ANTHROPIC_API_KEY` | Anthropic Claude API key       |
| `GEMINI_API_KEY`    | Google Gemini API key          |

---

#### Storage (S3-compatible)

Used by `apps/api` vault uploads. Works with MinIO (local), Cloudflare R2, AWS S3, or any S3-compatible provider.

| Variable                   | Default     | Description     |
| -------------------------- | ----------- | --------------- |
| `BUCKET_ENDPOINT`          | —           | S3 endpoint URL |
| `BUCKET_REGION`            | `us-east-1` | Bucket region   |
| `BUCKET_ACCESS_KEY_ID`     | —           | Access key      |
| `BUCKET_SECRET_ACCESS_KEY` | —           | Secret key      |
| `BUCKET_NAME`              | —           | Bucket name     |

> Local: `docker compose up -d` starts MinIO on `:9000`. Set `BUCKET_ENDPOINT=http://localhost:9000`.

---

#### Integrations

##### WhatsApp (Evolution API)

Self-hosted [Evolution API](https://github.com/EvolutionAPI/evolution-api) instance. The API auto-registers its webhook URL with Evolution on startup when all three vars are set.

| Variable                      | Description                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------ |
| `EVOLUTION_API_URL`           | Base URL of your Evolution API instance (e.g. `https://evolutionapi.oewang.com`)           |
| `EVOLUTION_API_TOKEN`         | API key / token from Evolution API                                                         |
| `EVOLUTION_API_INSTANCE`      | **Instance name** (not UUID) shown in the Evolution dashboard                              |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | WhatsApp number tied to the instance, e.g. `628123456789` — shown in the connect QR dialog |

> The webhook is registered at `{API_BASE_URL}/integrations/whatsapp/webhook`.
> `EVOLUTION_API_INSTANCE` must be the instance **name** (`my-instance`), not the UUID from the manager URL.

##### Telegram

| Variable                        | Description                                                    |
| ------------------------------- | -------------------------------------------------------------- |
| `TELEGRAM_BOT_TOKEN`            | Bot token from [@BotFather](https://t.me/BotFather)            |
| `TELEGRAM_WEBHOOK_SECRET`       | Optional shared secret for webhook signature verification      |
| `NEXT_PUBLIC_TELEGRAM_BOT_USER` | Bot username shown in the connect dialog (default `OewangBot`) |

##### Gmail OAuth

You can reuse the same OAuth client as Google login. The Gmail service falls back to `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` automatically when the Gmail-specific vars are not set.

| Variable                     | Description                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------- |
| `GOOGLE_GMAIL_CLIENT_ID`     | Gmail-specific client ID — **optional if `GOOGLE_CLIENT_ID` is set**         |
| `GOOGLE_GMAIL_CLIENT_SECRET` | Gmail-specific client secret — **optional if `GOOGLE_CLIENT_SECRET` is set** |

> **One-credential setup** (recommended): leave `GOOGLE_GMAIL_CLIENT_ID` and `GOOGLE_GMAIL_CLIENT_SECRET` unset and add the following to the same OAuth client used for login:
>
> 1. Redirect URI: `{API_BASE_URL}/v1/integrations/gmail/oauth-callback`
> 2. Scopes on the OAuth consent screen: `gmail.readonly`, `userinfo.email`

##### Outlook OAuth

| Variable                  | Description                          |
| ------------------------- | ------------------------------------ |
| `MICROSOFT_CLIENT_ID`     | Azure app registration client ID     |
| `MICROSOFT_CLIENT_SECRET` | Azure app registration client secret |

> Redirect URI to register: `{API_BASE_URL}/v1/integrations/outlook/oauth-callback`
> Required API permissions: `Mail.Read`, `User.Read`, `offline_access`

---

#### MCP Server (ChatGPT / Claude integration)

The API exposes an MCP server at `/mcp` with a full OAuth 2.0 authorization flow. All OAuth endpoints are served directly from the API at `{API_BASE_URL}/oauth/*` — no separate app URL is required.

Requires: `API_BASE_URL` (for discovery documents and OAuth redirect URIs).

> To connect ChatGPT: Apps → Add → Server URL → `{API_BASE_URL}/mcp`

---

#### Email (Resend)

| Variable         | Description                                                                     |
| ---------------- | ------------------------------------------------------------------------------- |
| `RESEND_API_KEY` | [Resend](https://resend.com) API key (`re_...`) — used for transactional emails |

---

#### Payments (Mayar)

Indonesian payment gateway. Required for invoice payments and subscriptions.

| Variable              | Description                    |
| --------------------- | ------------------------------ |
| `MAYAR_API_URL`       | `https://api.mayar.club/hl/v1` |
| `MAYAR_API_KEY`       | Mayar API key                  |
| `MAYAR_WEBHOOK_TOKEN` | Webhook verification token     |

---

#### Currency Rates

| Variable                 | Description                                                                    |
| ------------------------ | ------------------------------------------------------------------------------ |
| `CURRENCYFREAKS_API_KEY` | [CurrencyFreaks](https://currencyfreaks.com) key — used for exchange rate sync |

---

#### Monitoring & Logging

| Variable                 | Default | Description                                                                  |
| ------------------------ | ------- | ---------------------------------------------------------------------------- |
| `SENTRY_DSN`             | —       | Sentry DSN for `apps/api` error tracking                                     |
| `SENTRY_AUTH_TOKEN`      | —       | Sentry auth token for source map uploads                                     |
| `NEXT_PUBLIC_SENTRY_DSN` | —       | Sentry DSN for Next.js apps                                                  |
| `LOG_LEVEL`              | `info`  | Pino log level: `trace` \| `debug` \| `info` \| `warn` \| `error` \| `fatal` |
| `LOG_PRETTY`             | `true`  | Pretty-print logs in development                                             |
| `LOGS_DIR`               | —       | Directory for log file output                                                |

---

#### Testing (E2E)

| Variable          | Description                                 |
| ----------------- | ------------------------------------------- |
| `PLAYWRIGHT_USER` | Test account email for Playwright E2E suite |
| `PLAYWRIGHT_PASS` | Test account password                       |

---

For production webhook and third-party payment setup, see `docs/PRODUCTION_WEBHOOK_SETUP.md`.

## Apps

| App            | Description       | Port |
| -------------- | ----------------- | ---- |
| `apps/app`     | Main application  | 3000 |
| `apps/admin`   | Admin dashboard   | 3001 |
| `apps/api`     | REST API          | 3002 |
| `apps/website` | Marketing website | 3003 |

## License

MIT

© 2026 Latoe. All rights reserved.
