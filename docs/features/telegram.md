# Feature: Telegram

Status: draft v0.1, 2026-11-05. Part of the [oewang docs](../README.md). Implements [PRD](../prd.md#611-telegram-tg) TG-1 to TG-10, under D83 to D86.

A private Telegram chat that acts for one member in one workspace. A receipt photo sent there is saved as an expense and answered with what was saved; a question sent there is answered by the assistant. Connected from the Apps page.

## Update this doc when

- Changing what the bot accepts, what it replies, or its buttons.
- Changing how a chat is linked or unlinked.
- Changing the Apps page.
- Adding another app. That is a new PRD section first: every other integration is a [non-goal](../prd.md#non-goals-for-v1).

## How it is split

| Process | Job |
|---|---|
| `apps/app` | The Apps page: status, the one-time link and its QR code, disconnect |
| `apps/api` | Polls Telegram, owns the links, saves receipts, runs chat turns, answers buttons |
| `apps/ai` | Reads the receipt (`/receipt/parse`), suggests a category (`/receipt/categorize`), answers the chat turn (`/chat/stream`). Never sees Telegram |

The bot token lives on the API only. The AI service is handed strings and documents by the API, exactly as for the web.

## Connecting

1. The member opens Apps and taps Connect. The page posts the `connect` action; the API mints a token for that member in the session's workspace and answers `https://t.me/<bot>?start=<token>`.
2. The page draws a QR code of that link on the server and shows it in a dialog with Open bot and Copy link. The link is never put in the address bar.
3. The member opens it on a phone and taps Start. Telegram sends `/start <token>` to the bot.
4. The API claims the token (unused, unexpired, then marked used in one statement), checks the member still belongs to the workspace, ends whatever this chat or this member was linked to before, and stores the link: chat id, Telegram user id, username.
5. The dialog polls the page's data every two seconds and closes with a toast when the link appears.

A token is 32 random bytes, stored as SHA-256, valid for ten minutes, once (D85). Anything else after `/start` gets one answer, "That link has expired or was already used", whether it was never minted, expired, used, or minted for a member who has since left.

### What ends a link

| Event | Where |
|---|---|
| Disconnect on the Apps page | `POST /v1/integrations/telegram/unlink`; the chat is told |
| `/disconnect` in the chat | The bot |
| Sign out everywhere | `logout_everywhere` |
| Password reset | `complete_password_reset` |
| Removed from the workspace | `remove_member`, and the next update from a member who is no longer one |
| The chat is linked again | Linking moves the chat; the old link ends |

## Who a message is from

In this order, for every update:

1. The chat is private. In a group, `/start` is answered once with "only works in a private chat" and everything else is ignored.
2. The sender is not a bot.
3. `/start <token>` may link. Anything else needs a live link for this chat id whose Telegram user id is the sender's.
4. The membership row is re-read. A member who left has the link ended and is told. The role decides what follows: a `member` can ask but cannot save a receipt.

Nothing in a message, a caption or a button names a workspace or a user.

## Receipts

A photo (the largest size Telegram kept) or a document typed JPEG, PNG, WebP or PDF.

1. Downloaded from Telegram's file host, capped at `MAX_FILE_BYTES`. The path comes from Telegram's own `getFile` answer and is refused if it is not a plain relative path.
2. Stored through `vault::service` (`begin`, `put_chunk`, `complete`): the type is sniffed, the daily upload ceiling applies, and the audit rows are the usual ones.
3. Read by `ai::service::parse_receipt`, the same call the web makes: the ladder with no tools, then the arithmetic check in Rust.
4. Refused, with nothing saved, when there is no readable total, when there is no account, or when no account holds the receipt's currency.
5. The account is the default one if it holds the receipt's currency, otherwise the first that does. Nothing is converted.
6. A category is suggested by `POST /receipt/categorize`: the merchant, the item names and the expense category names, one small call with `tools=[]`. The API keeps the answer only when it is exactly one of those names, emoji included.
7. Saved by `create_with_items`: an expense, the receipt's date (today when none was read, and flagged), the merchant as the name, the line items, the file attached, `source = 'telegram'`.

### The reply

```
✅ Saved HOLAN BY MEVUI
Rp 136.850 · 🍜 Food · 2026-10-23

• MINERAL WATER (Bottle)  Rp 20.000
• PHO SG - SPECIAL  Rp 81.000
• SPRITE  Rp 18.000

This month: Rp 136.850 total, Rp 136.850 on 🍜 Food.
⚠️ Please check: date.
Wrong category? Tap below.

[🍜 Food] [🛍️ Shopping] [🧾 Bills]
[🛵 Transport] [📦 Other]
[🗑️ Delete]
```

Built from the stored transaction, not the draft, so a tap rewrites the same message from the same source. Every figure is formatted by the API (D27). The two totals are this month's expenses and this category's, in the workspace currency, from the same summary query as the dashboard; the month is UTC's, as every date the API works out. "Please check" lists the fields the ladder was unsure of and the ones the arithmetic replaced (AI-11). The current category carries a tick; with none, the line reads "Uncategorised" and the prompt is "Pick a category below".

### Buttons

`callback_data` is `c:<category>:<transaction>`, `d:<transaction>`, `dc:<transaction>` or `dx:<transaction>`, at most 64 bytes.

| Tap | Effect |
|---|---|
| A category | `bulk_update` on that one transaction, then the message is rebuilt |
| Delete | The buttons become "Yes, delete it" and "Keep it" |
| Yes, delete it | Soft delete, and the message says it was deleted |
| Keep it | The message is rebuilt |

Every tap re-reads the link, checks the sender is the linked Telegram account, re-reads the role (writers only), and looks the transaction and the category up in the link's workspace. A forged id is not found.

## Chat

Any other text is a turn of the assistant in the chat's own conversation, an `ai_sessions` row titled "Telegram" made on the first message and visible in the web chat list.

The turn is the web's: `begin_turn` persists the message and builds the request, the turn budget opens, the stream pump stores the reply however it ends, and every tool call goes through `tools::execute`. Caps, the role gate and the delete confirmation apply unchanged. The per-workspace chat limit counts these turns with the web's.

Two things differ. The turn carries `channel: "telegram"`, and the prompt then asks for short plain text with no tables, no headings and no entity links. And the reply is collected rather than streamed, reduced to plain text (links to their label, emphasis removed), split under Telegram's 4096 characters, and sent while "typing…" shows.

## Commands

| Command | Effect |
|---|---|
| `/start <token>` | Link this chat |
| `/start`, `/help` | What the bot does |
| `/disconnect` | End this chat's link |

## The Apps page

The old app's layout: a search box and an All/Connected toggle on one line, then a grid of cards, Telegram the only one. Search, the toggle and the open details sheet (`?app=telegram`) are in the URL. Two empty states: nothing matches the search, and nothing connected yet. When the server has no bot, the card says "Not set up" and Connect is disabled.

## Limits and failure

- Each update id is handled once (`telegram_updates`), and claims older than 48 hours are pruned.
- A chat's updates run one at a time, in order; chats run in parallel.
- A failed update is logged by its error code and answered with "Something went wrong"; it never stops the chat's queue.
- 409 from Telegram (another poller) pauses the loop for a minute; a 429 waits as long as Telegram says.

## What is not built

Group chats, voice notes, edited messages, inline mode, a webhook, notifications pushed from the app to the chat, and every other app on the old Apps page.

## Related docs

- [PRD section 6.11](../prd.md#611-telegram-tg) and [decision log](../architecture.md#decision-log) D83 to D86
- [Architecture: Telegram lifecycle](../architecture.md#telegram)
- [Chat](chat.md): the turn this reuses, and the web receipt flow
- [AI safety](../security/ai-safety.md) and [hardening](../security/hardening.md#outbound-calls)
- [Auth](../security/auth.md#telegram-links)
- [Data model](../data-model.md#telegram) and [API endpoints](../api/endpoints.md#integrations)
