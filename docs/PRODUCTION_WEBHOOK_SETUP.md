# Production Webhook And Payment Setup

This guide explains how to configure third-party services for `oewang` in production.

## 1) Required Base URLs

Set your production API base URL first:

- `API_BASE_URL=https://api.yourdomain.com`

All webhook URLs below assume your API is served under:

- `https://api.yourdomain.com/v1`

## 2) Required Environment Variables

Add these to your production environment:

```env
# Core
NODE_ENV=production
JWT_SECRET=replace-with-strong-secret-min-32-chars

# Mayar
MAYAR_API_KEY=sk_live_xxx
MAYAR_WEBHOOK_TOKEN=replace-with-random-secret

# Twilio WhatsApp
TWILIO_ACCOUNT_SID=ACxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxx
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886

# Telegram
TELEGRAM_BOT_TOKEN=xxxx:yyyy
TELEGRAM_WEBHOOK_SECRET=replace-with-random-secret
```

## 3) Webhook URLs

Use these exact endpoints:

- Mayar webhook:
  - `POST https://api.yourdomain.com/v1/mayar/webhook`
- Twilio WhatsApp events:
  - `POST https://api.yourdomain.com/v1/integrations/whatsapp/twilio/webhook`
- Telegram bot webhook:
  - `POST https://api.yourdomain.com/v1/integrations/telegram/webhook`

## 4) Third-Party Dashboard Setup

### Mayar

1. Open your Mayar dashboard webhook settings.
2. Set webhook URL to:
   - `https://api.yourdomain.com/v1/mayar/webhook`
3. Configure callback token to exactly match:
   - `MAYAR_WEBHOOK_TOKEN`
4. Save and send a test event.
5. Confirm your API returns success.

### Twilio WhatsApp

1. In Twilio Console, open WhatsApp sender webhook settings.
2. Set incoming webhook URL to:
   - `https://api.yourdomain.com/v1/integrations/whatsapp/twilio/webhook`
3. Method: `POST`
4. Ensure API env has:
   - `TWILIO_AUTH_TOKEN`
5. Send a test message and verify delivery logs.

### Telegram Bot

1. Create a bot via `@BotFather` (or use existing bot token).
2. Set webhook with secret token:

```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://api.yourdomain.com/v1/integrations/telegram/webhook",
    "secret_token": "<TELEGRAM_WEBHOOK_SECRET>"
  }'
```

3. Verify webhook info:

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo"
```

## 5) Security Notes

- Always use HTTPS in production.
- Do not expose secrets in frontend `NEXT_PUBLIC_*` variables.
- Rotate webhook secrets if leaked.
- Keep `JWT_SECRET` and webhook secrets unique per environment.

## 6) Quick Validation Checklist

Before go-live, verify all items:

- [ ] `apps/api` starts with `NODE_ENV=production` and no env validation errors.
- [ ] Mayar test webhook is accepted with correct token and rejected with wrong token.
- [ ] Twilio webhook accepts valid signature and rejects invalid signature.
- [ ] Telegram webhook accepts valid secret token and rejects invalid token.
- [ ] End-to-end payment flow creates order and updates workspace plan/addon.
- [ ] API is served behind TLS and reverse proxy forwards `x-forwarded-host` and `x-forwarded-proto`.

## 7) Troubleshooting

- `403 Forbidden` on webhook:
  - Signature/token mismatch. Re-check dashboard secret vs environment variable.
- `500 ... not configured` on webhook:
  - Required env variable is missing in production.
- No webhook events arriving:
  - Check provider delivery logs and API ingress firewall/routing.
