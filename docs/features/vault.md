# Feature: Vault

Status: v0.1, 2026-11-05. Part of the [oewang docs](../README.md). Implements [PRD](../prd.md) VLT-6 to VLT-13. Decisions D90 and D91.

The workspace's files, browsable again. Every receipt, statement and attachment already lands in `vault_files`; this page shows them, and a file opens in a sheet where it can be renamed, tagged, followed to the transactions that carry it, and deleted. It was a PRD non-goal until the owner asked for it back on 2026-11-05 (D90).

## Update this doc when

- Changing the vault page, the file sheet, the picker, or a file molecule.
- Changing a vault route or what it returns. The catalog lives in [endpoints](../api/endpoints.md#files).
- Changing how a thumbnail is made, stored or served.
- Changing what deleting a file does to the transactions that carry it.

## Data

`vault_files`, with `tags` and `thumbnail` added by `0010_vault_usage.sql`, and `transaction_attachments` for the links. Columns are in [data model](../data-model.md#files).

## Copied from the old app

The page is the old app's vault page, copied (`references/oewang-old`), with three kinds of difference. Anything not listed here is meant to match.

| Difference | Old | Here |
|---|---|---|
| Opening a file | An inline 400px detail panel beside the grid | Its own right-side sheet, `?file=<id>`. The owner's one requested change |
| Right column | Storage bar and extras beside the content | Gone. The storage figure moved into the page header (`vault-storage`), as a rule and the file count, because there is no quota to measure against (D92) |
| Rename | A pen button that saved nothing | Works (VLT-8) |
| Delete | Immediate | Behind a confirmation that says how many transactions lose the file (VLT-11) |
| "Dimensions" row | Always "N/A" | Dropped |
| Picker filters | Narrowed only the page already loaded | Run on the server across every page |
| Picker "Videos" filter, "orientation" column | Present | Removed: uploads are images and PDFs only, and the orientation was never read from anything |
| Linked transactions | Not shown | Listed in the sheet (VLT-10) |

The page keeps the old `h1` title and description. That is a deliberate exception to the list-screen rule of no page title ([D81](../architecture.md#decision-log), recorded in D90). The list view is the old `VaultItemList`, not `molecules/data-table`, for the same reason: it is a copy.

## The page

| Part | What it is |
|---|---|
| Route | `/vault`. Sidebar: "Vault" in the Workspace group, before Apps, with the box icon |
| Header | Title and description, the storage figure, search, the grid and list toggle |
| URL | `?search`, `?view=grid\|list` (default `grid`), `?file=<id>` opens the sheet. A reload restores all three (UI-8) |
| Grid | `molecules/file-card`, 15 at a time; scrolling loads the next 15 from `GET /vault/files`. A scrolled page is not in the URL: it is more of the same list, not a different view |
| List | `organisms/vault/vault-item-list`: thumbnail and name, format, size, date |
| Loading | `vault-skeleton`: 15 tiles or 12 rows |
| Upload | Drop files anywhere on the page. Several at once, one toast "Uploading N files...", then success or "some failed" |

The load reads the first page, the storage figure and, when `?file=` is set, that file's detail, in one `Promise.all`. It declares `app:vault`.

## The file sheet

`organisms/vault/vault-file-sheet`. The header is the old `FilePreviewSheet`'s; the body is the old detail panel's.

- **Header.** Name, the subtype in capitals, open in a new tab, download, close.
- **Preview.** A 16:9 box (`molecules/file-preview`, variant `box`): the image itself, or the PDF in an iframe. Both come from a Blob URL built from the chunks and revoked when the sheet closes.
- **Name.** The pen button turns it into a field.
- **Metadata.** Date created, format, file size.
- **Tags.** Removable badges (Badge variant `tag`), suggested chips (Invoice, Transaction, Receipt, Report, Contract, Document) and a custom input. Limits in VLT-9.
- **Linked transactions.** The newest 20, each a link to `/transactions?detail=<id>`, with the exact count.
- **Footer.** A split button, "View full" with a menu (Open original, Download local), and Delete behind `ConfirmDialog`, which says "attached to N transactions" when N is above zero.

Writes post to `/vault?/update` and `/vault?/delete` through `$lib/vault.ts`, from either page, so the transactions page needs no copy of these actions. Rename and tag controls are shown to a writer only.

The same sheet opens from `/transactions`, stacked over the detail sheet, when an attachment tile is clicked (`?file=` on that page). A file looks and behaves the same wherever it is opened.

## Thumbnails

A tile never pulls the whole file. It asks for a preview the API makes once (D91, VLT-12):

1. The tile's `<img>` points at `/vault/files/{id}/thumbnail`, this app's own route.
2. That route calls `GET /v1/vault/files/{id}/thumbnail` inside OWE1 and answers the bytes as `image/jpeg`, `cache-control: private, max-age=86400`, `nosniff`. A file's bytes never change, so a day in the browser's cache is safe; `private` keeps it out of a shared one.
3. The first request makes the preview: decoded in `spawn_blocking` with the `image` crate (JPEG, PNG and WebP decoders only), at most 8000px a side and 128 MB of allocation, EXIF orientation applied, cropped to 320x320, JPEG at quality 80, stored at `{key}/thumb`. `vault_files.thumbnail` becomes true.
4. A PDF, or bytes that do not decode, set `thumbnail` to false and answer `THUMBNAIL_UNAVAILABLE`. They are never tried again; the tile shows the type icon (`molecules/file-icon`).

When `thumbnail` is already false, or the file is a PDF, the tile asks for nothing.

JPEG rather than WebP because the `image` crate's WebP encoder is lossless only, which makes a photo's preview several times larger.

## Deleting a file

One database transaction soft-deletes the file and every live `transaction_attachments` row pointing at it, and writes the audit row with `after: {"detached": n}`. The chunks and the stored preview are removed after commit. A transaction that carried the file simply stops showing the tile (VLT-11).

## File proxy routes

The browser talks only to SvelteKit (D5). Everything file-shaped is under `routes/(dashboard)/vault/files/`, moved there from `transactions/files/`:

| Route | Does |
|---|---|
| `POST /vault/files` | Begin an upload |
| `PUT`, `GET /vault/files/[id]/chunks/[index]` | Send or read one chunk |
| `POST /vault/files/[id]/complete` | Finish an upload |
| `GET /vault/files` | One page of the list as JSON, for the picker and the grid's next page. Unknown filter values are dropped, the limit is capped at 100 |
| `GET /vault/files/[id]/thumbnail` | The preview, as above |

Server wrappers are in `src/lib/server/vault.ts`. Routes, limits and strings for the molecules are in `$lib/files.ts` (D78).

## CSP

The PDF frame needs `frame-src blob:` ([hardening](../security/hardening.md#browser-headers)). Nothing else can be framed, and the only blob URL is one this page minted from bytes the API sniffed as a PDF.

## Testing

| Layer | Coverage |
|---|---|
| Domain (Rust) | Tag normalisation: trimming, case-insensitive dedupe, the 10 and 32 limits refused rather than cut |
| Integration (Rust) | Only this workspace's ready files listed with `used_by`; `%` and `_` in a search match themselves; rename and retag with the audit row; delete detaches from every transaction; one preview made and kept; a PDF marked; no preview across a workspace |
| Vitest | `$lib/files`: a preview URL is this app's own route, never the API's or storage's; no preview requested when the API said none or for a PDF |
| Browser | Not yet verified ([US-048](../backlog.md#us-048-vault-page-and-file-sheet)) |

## Related docs

- [Transactions](transactions.md#transaction-detail-sheet), for tiles, the picker and the stacked sheet
- [Usage](usage.md), for the storage figure
- [Data model](../data-model.md#files) and [endpoints](../api/endpoints.md#files)
- [Payload encryption](../api/encryption.md#file-bytes) and [hardening](../security/hardening.md#file-uploads)
- [Svelte app best practices](../best-practices/svelte-app.md#component-organization)
