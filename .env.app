# ==========================================
# oewang APP — Railway Environment Variables
# Copy this into Railway → app service → Variables
# ==========================================

# ── Application ───────────────────────────
NODE_ENV="${{shared.NODE_ENV}}"

# ── Auth & Security ───────────────────────
JWT_SECRET="${{shared.JWT_SECRET}}"
ENCRYPTION_KEY="${{shared.ENCRYPTION_KEY}}"

# ── OAuth (Login) ─────────────────────────
GOOGLE_CLIENT_ID="${{shared.GOOGLE_CLIENT_ID}}"
GOOGLE_CLIENT_SECRET="${{shared.GOOGLE_CLIENT_SECRET}}"
GITHUB_CLIENT_ID="${{shared.GITHUB_CLIENT_ID}}"
GITHUB_CLIENT_SECRET="${{shared.GITHUB_CLIENT_SECRET}}"

# ── Public URLs ───────────────────────────
NEXT_PUBLIC_APP_URL="https://${{RAILWAY_PUBLIC_DOMAIN}}"
NEXT_PUBLIC_ADMIN_URL="https://${{admin.RAILWAY_PUBLIC_DOMAIN}}"
NEXT_PUBLIC_API_URL="https://${{api.RAILWAY_PUBLIC_DOMAIN}}"
NEXT_PUBLIC_WEBSITE_URL="https://${{website.RAILWAY_PUBLIC_DOMAIN}}"

# ── Public Config ─────────────────────────
NEXT_PUBLIC_SESSION_COOKIE_NAME="${{shared.NEXT_PUBLIC_SESSION_COOKIE_NAME}}"
NEXT_PUBLIC_TELEGRAM_BOT_USER="${{shared.NEXT_PUBLIC_TELEGRAM_BOT_USER}}"
NEXT_PUBLIC_WHATSAPP_NUMBER="${{shared.NEXT_PUBLIC_WHATSAPP_NUMBER}}"
NEXT_PUBLIC_VAPID_PUBLIC_KEY="${{shared.NEXT_PUBLIC_VAPID_PUBLIC_KEY}}"

# ── Monitoring ────────────────────────────
# NEXT_PUBLIC_SENTRY_DSN="${{shared.NEXT_PUBLIC_SENTRY_DSN}}"
