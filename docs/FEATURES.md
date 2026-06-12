# Features Index

This index provides a complete list of features implemented in the **oewang** SaaS platform, mapping each to its dedicated technical documentation (`FEAT_*.md`).

---

## 🤖 AI Agent: Update This Doc When

- Creating a new feature module in `apps/api/modules/`
- Adding a new `FEAT_*.md` file to the `docs/` directory

---

## Central Feature Docs

Each feature document contains detailed documentation on the purpose, data models, API endpoints, business logic, source files, and known constraints/edge cases.

| Feature                            | Doc                                                              | Purpose                                                                                               |
| ---------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **AI Assistant**                   | [FEAT_AI.md](./FEAT_AI.md)                                       | Multi-model chatbot (GPT/Claude/Gemini) that responds, processes receipts, and executes actions.      |
| **Billing & Subscription**         | [FEAT_BILLING.md](./FEAT_BILLING.md)                             | Mayar checkout, cancel/resume, scheduled plan switches, internal billing invoices, past-due grace, vault downgrade lifecycle. |
| **Budgets**                        | [FEAT_BUDGETS.md](./FEAT_BUDGETS.md)                             | Category-specific limits with monthly recurrence, threshold notifications, and rollover options.      |
| **Categories**                     | [FEAT_CATEGORIES.md](./FEAT_CATEGORIES.md)                       | Transaction classification system (`income` / `expense`) seeded on onboarding.                        |
| **Contacts**                       | [FEAT_CONTACTS.md](./FEAT_CONTACTS.md)                           | Payee/payer directory linked to transactions for debtor tracking.                                     |
| **Debts & Loans**                  | [FEAT_DEBTS.md](./FEAT_DEBTS.md)                                 | Lending and borrowing tracker with installment payments and balance amortization.                     |
| **Invoices**                       | [FEAT_INVOICES.md](./FEAT_INVOICES.md)                           | Professional PDF invoicing, itemized line tables, and secure token-based public share links.          |
| **Metrics & Analytics**            | [FEAT_METRICS.md](./FEAT_METRICS.md)                             | Cashflow dashboard, daily/monthly summaries, and net worth progress calculation.                      |
| **Transactions**                   | [FEAT_TRANSACTIONS.md](./FEAT_TRANSACTIONS.md)                   | Double-entry ledger (incomes, expenses, wallet transfers) supporting attachments.                     |
| **Vault File Storage**             | [FEAT_VAULT.md](./FEAT_VAULT.md)                                 | Cloudflare R2 bucket storage integration for receipt images, PDFs, and invoices.                      |
| **Wallets & Wallet Groups**        | [FEAT_WALLETS.md](./FEAT_WALLETS.md)                             | Multi-currency cash, card, bank account tracking with drag-and-drop ordering.                         |
| **Workspaces & Members**           | [FEAT_WORKSPACES.md](./FEAT_WORKSPACES.md)                       | Multi-workspace tenant isolation, secure invitations, and roles.                                      |
| **Workspace Settings**             | [FEAT_SETTINGS.md](./FEAT_SETTINGS.md)                           | Workspace display preferences, start screens, main currency formats, and custom R2 settings.          |
| **Notifications & Alerts**         | [FEAT_NOTIFICATIONS.md](./FEAT_NOTIFICATIONS.md)                 | In-app WebSocket alerts, transactional emails, and Web Push notifications (VAPID).                    |
| **Messaging Integrations**         | [FEAT_INTEGRATIONS.md](./FEAT_INTEGRATIONS.md)                   | WhatsApp (Evolution API / WhatsApp Web) and Telegram bot integration for AI receipt uploads and chat. |
| **Workspaces, Settings & Billing** | [WORKSPACE_BILLING_SETTINGS.md](./WORKSPACE_BILLING_SETTINGS.md) | Unified architectural guide detailing how tenancy, settings, plan pricing, and Mayar billing connect. |

---

## Feature-Specific Guidelines for AI Agents

When modifying features, you **must** review the corresponding `FEAT_*.md` file before starting, and update the document if your changes modify:

1. The **database schema** (tables, columns, types, indexes).
2. The **API controllers/endpoints** (methods, path variables, DTO schemas).
3. The **core business services** (permission locks, calculations, third-party calls).
4. The **frontend components/actions** (Next.js server actions, page layouts).
