# ==========================================
# oewang APP — Coolify Environment Variables
# Set the referenced KEYs once in Coolify → Shared Variables → Projects →
# oewang, then paste this block into the app's own Environment Variables.
# ==========================================

# ── Application ───────────────────────────
NODE_ENV="{{project.NODE_ENV}}"

# ── Auth & Security ───────────────────────
JWT_SECRET="{{project.JWT_SECRET}}"
ENCRYPTION_KEY="{{project.ENCRYPTION_KEY}}"
# Gates /auth/oauth/connect on the API — the OAuth callback route below sends
# this header when minting a session. REQUIRED in practice.
OAUTH_CONNECT_SECRET="{{project.OAUTH_CONNECT_SECRET}}"

# ── OAuth (Login) ─────────────────────────
GOOGLE_CLIENT_ID="{{project.GOOGLE_CLIENT_ID}}"
GOOGLE_CLIENT_SECRET="{{project.GOOGLE_CLIENT_SECRET}}"
GITHUB_CLIENT_ID="{{project.GITHUB_CLIENT_ID}}"
GITHUB_CLIENT_SECRET="{{project.GITHUB_CLIENT_SECRET}}"

# ── AI Sidecar (direct call from /api/chat/stream) ────────
# The chat streaming route calls apps/ai directly, bypassing apps/api.
# REQUIRED in practice for chat to work.
AI_SERVICE_URL="{{project.AI_SERVICE_URL}}"
AI_SERVICE_API_KEY="{{project.AI_SERVICE_API_KEY}}"

# ── Public URLs ───────────────────────────
NEXT_PUBLIC_APP_URL="{{project.NEXT_PUBLIC_APP_URL}}"
NEXT_PUBLIC_ADMIN_URL="{{project.NEXT_PUBLIC_ADMIN_URL}}"
NEXT_PUBLIC_API_URL="{{project.NEXT_PUBLIC_API_URL}}"
NEXT_PUBLIC_WEBSITE_URL="{{project.NEXT_PUBLIC_WEBSITE_URL}}"

# ── Public Config ─────────────────────────
NEXT_PUBLIC_SESSION_COOKIE_NAME="{{project.NEXT_PUBLIC_SESSION_COOKIE_NAME}}"
NEXT_PUBLIC_TELEGRAM_BOT_USER="{{project.NEXT_PUBLIC_TELEGRAM_BOT_USER}}"
NEXT_PUBLIC_VAPID_PUBLIC_KEY="{{project.NEXT_PUBLIC_VAPID_PUBLIC_KEY}}"

# ── Monitoring ────────────────────────────
# NEXT_PUBLIC_SENTRY_DSN="{{project.NEXT_PUBLIC_SENTRY_DSN}}"

# ── NOT needed here (server-only, handled by apps/api) ────
# DATABASE_URL, MAYAR_*, BUCKET_*, MODEL_*, TELEGRAM_BOT_TOKEN,
# RESEND_API_KEY, CURRENCYFREAKS_API_KEY — see docs/ENV_VARS.md
