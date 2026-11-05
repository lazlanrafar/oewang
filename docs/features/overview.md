# Feature: Overview

Status: v0.1, 2026-11-05. Part of the [oewang docs](../README.md). Implements [PRD](../prd.md) OVR-1 to OVR-5. Decisions D87 to D89.

The workspace's front page, ported from the old app's `overview`: a greeting, one date range, two tabs, and the assistant's composer floating under them.

## Update this doc when

- Adding, removing or changing a card, a chip or a chart.
- Changing where a figure comes from, or `GET /v1/overview`.
- Changing how a question starts a conversation.

## Shape

| Part | What it is |
|---|---|
| Route | `/overview`. `/` redirects here, keeping the query string |
| Header | "Good afternoon, {first name}", read from the clock after mount; the range picker; the two tabs |
| URL | `?tab=overview\|metrics` (default `overview`), `?from&to` (days, default the last twelve whole months). A malformed or half range falls back to the default as a whole. The tab is written with shallow routing (`replaceState`): both tabs read the same report, so switching runs no load, and the URL still restores it |
| Overview tab | Six cards, then seven prompt chips |
| Metrics tab | Income over time, expenses over time, income breakdown, expense breakdown, burn rate |
| Composer | `ChatInput` in a `ChatDock`, sticky to the bottom of the shell's scroll box: the old composer, with the history list and the `/` shortcuts ([chat](chat.md#the-composer)). It folds as the page scrolls, unless it is in use |
| Route group | `(dashboard)/(assistant)/` holds `/overview` and `/chat`, so one layout loads the conversation list for both |

## Where each figure comes from

Every money figure is computed by the API's report module (`server/src/reports`), the same one the chat's analysis canvases use, so the two cannot disagree about a month (D87, D88). The app prints each one from the raw decimal with `formatMoney`.

| Card | Source |
|---|---|
| Total income, total expenses, net income | `income`, `expense`, `net` over the range, each with `comparison` against the period of equal length that ends the day before the range starts. Expenses going up shows red (`invert`) |
| Top expense | The largest entry of `expense_categories`, not the "Other" bucket |
| Average monthly burn | `average_expense`: expense over the range divided by every month the range touches, empty months included |
| Tracked balance | Streamed: the page renders on the report and this card fills in when today's rates arrive, because a rate lookup can take a second. Not from the report. The wallets flagged "include in totals", converted to the workspace currency with today's rate, by `walletTotals` and `ledger.walletRates`, the same path the accounts page takes. A wallet with no rate is left out and the card says how many |

The old cards showed the last month of the range under a label for the whole range. These cover the whole range, which is what the label says.

Budget usage and debt balance are not here: both features are PRD non-goals.

## Charts

`molecules/chart`, built on `layerchart` (D89). Monochrome: the series that matters in the foreground colour, comparisons in greys, averages dashed. Heights come from `chartValue`; the tooltip and legend print the formatted strings. Category bars are keyed by position, because a workspace may have a category called "Other" beside the bucket of that name.

## Asking from the overview

A card, a chip or the composer starts a conversation (OVR-4):

1. The page posts the ordinary `/chat?/new` action with `fetch`, as `use:enhance` would, and reads the redirect it answers with.
2. It leaves `{message, files}` for that session in `$lib/chat-handoff` and navigates there.
3. The conversation page takes the handoff on mount, once, and sends it through its own `send()`. Files go into the composer first, so a receipt opens its panel as it would have on that page.

The handoff is browser memory. A reload of either page sends nothing, and a handoff for another session is dropped rather than sent somewhere it was not meant for.

Chips and card questions name the range on screen ("Show my spending analysis for 1 Sept to 30 Nov 2026"), so the answer is about what the reader is looking at. Spending, income and burn-rate questions reach the analysis tools, whose canvas opens beside the answer.

## Freshness

The load declares `app:overview`, `app:summary` and `app:wallet-balances`, which a chat write drops (D32). A transaction the assistant records moves these figures without a reload.

## Related docs

- [Chat](chat.md#canvas), for the analysis canvas the chips open
- [Accounts](accounts.md), for the tracked balance's conversion
- [Endpoints](../api/endpoints.md), for `GET /v1/overview`
