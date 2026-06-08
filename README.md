# oewang

**Track daily money without manual spreadsheets.**

oewang is a personal finance tracker for daily use in Indonesia. AI-powered insights, simple transaction input, automatic categorization, receipts, wallets, and more.

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

See `.env.example` for all required environment variables.

For production webhook and third-party payment setup, see:

- `docs/PRODUCTION_WEBHOOK_SETUP.md`

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
