# Decisions log (for review)

Decisions log. Anything that needs the user (real data, hardware, approvals) is listed under **Pending for the user**.

| # | Date | Stage | Decision | Why | Reversible? |
|---|---|---|---|---|---|
| D1 | 2026-11-19 | 0 | *(superseded by D26)* Staging is a **new** spreadsheet + bound script in the dedicated account, seeded with fictitious data. Not a copy of production | No real names on staging; production untouched | yes |
| D2 | 2026-11-19 | 0 | Docs are in English (sheet/column names stay Hebrew); ROADMAP stays Hebrew | precision for code contracts | yes |
| D3 | 2026-11-19 | 0 | Backend written in TypeScript, bundled by esbuild into one `Code.js` for Apps Script. Pure logic in `src/core` (no Google APIs) so Vitest runs it in Node | ROADMAP §2.6 | yes |
| D4 | 2026-11-19 | 1 | *(superseded by D16)* Web app access is `ANYONE_ANONYMOUS` (legacy used `ANYONE`, which requires a Google sign-in and breaks `fetch` from GitHub Pages) | required for the static frontend | yes |
| D5 | 2026-11-19 | 1 | Legacy sheets keep shekel amounts; code converts to integer agorot at the sheet boundary. New sheets store agorot | stage 1 must stay 1:1 with existing sheets and reports | yes |
| D6 | 2026-11-19 | 1 | Auth = device token + PIN on every request (bar/admin PIN, salted SHA-256 in Script Properties). No staff names yet (`Staff` sheet is later) | ROADMAP stage 1 infra; minimal change from legacy | yes |
| D7 | 2026-11-19 | 1 | *(superseded by D22)* "Owner email = admin without PIN" dropped | anonymous API has no identity | yes |
| D8 | 2026-11-19 | 1 | *(superseded by D23)* PIN lockout per device (10 / 10 min) instead of global (15) | one bad device shouldn't lock the bar | yes |
| D9 | 2026-11-19 | 1 | *(superseded by D18)* One-time `admin.bootstrap` action protected by a random secret compiled into the pushed bundle (never committed). Used to configure staging without editor clicks | unattended setup | yes |
| D10 | 2026-11-19 | 1 | `Audit` sheet added already in stage 1; every write logs one row | ROADMAP §8 rule | yes |
| D11 | 2026-11-19 | 2 | Existing `יומן מכירות` rows are **not** edited; new column `מזהה חבר` is filled for new rows only; old rows resolve through `LegacyKeyMap` | history stays untouched | yes |
| D12 | 2026-11-19 | 2 | Guests become `Members` rows (`source=GUEST`) on first sale; merge = `status=merged` + `mergedInto` | ROADMAP rule 8 | yes |
| D13 | 2026-11-19 | 2 | External renames can't be detected automatically (key = name). Sync preview suggests pairs (same last or first name) and the admin confirms | no stable id in the external list | yes |
| D14 | 2026-11-19 | 3 | Expense type stored in new column 11 `סוג`; blank = `הוצאה`; backfill action writes `הוצאה` into blanks | ROADMAP stage 3 migration | yes |
| D15 | 2026-11-19 | 4 | Placeholder catalog seeded on staging; user replaces with the real one | user choice | yes |
| D16 | 2026-11-20 | all | **No separate frontend.** The UI stays in Apps Script (`doGet` + HtmlService, calls via `google.script.run`). No GitHub Pages, no CORS layer. Supersedes D4 | 1–2 devices, low usage; a USB keyboard-emulation reader works inside the Apps Script iframe, so Web NFC is not needed | yes |
| D17 | 2026-11-20 | 6 | Tags (NTAG213/215/216) are read by a **USB reader in keyboard-emulation mode**, detected by a global `keydown` listener that recognizes fast bursts ending in Enter – no input field holding focus. Web NFC dropped | user decision; better UX than a focused field | yes |
| D18 | 2026-11-20 | 1 | **Device tokens dropped**; auth = bar/admin PIN (hashed in Script Properties) with lockout, as in the legacy app. Supersedes the device-token part of D6 and replaces D9 (configuration runs from the editor) | the URL is no longer embedded in a public frontend | yes |
| D19 | 2026-11-20 | −1 | Simplified migration: "Make a copy" + legacy `setup()`. Old monthly reports stay in the private account; `Migrate.gs` removed (in git history) | fewer steps for the user; links keep working | yes |
| D20 | 2026-11-20 | 8 | No offline queue (an Apps Script page can't run offline). Failed actions are retried with the same clientTxId | platform limit | yes |
| D21 | 2026-11-20 | all | All docs in English; Hebrew only for sheet/column names and UI labels. ROADMAP and MIGRATION rewritten. Updates D2 | user request | yes |
| D22 | 2026-11-20 | 1 | Web app access back to `ANYONE` (signed-in Google account), as legacy, so the **owner account = admin without PIN** works again. Supersedes D7 | 1:1 parity; the bar device is already signed in | yes |
| D23 | 2026-11-20 | 1 | PIN lockout stays **global**, 15 wrong tries / 10 min, as legacy. Supersedes D8 (per-device needs device tokens) | user approved the default | yes |
| D24 | 2026-11-20 | 1 | Stage 1 adds **no columns to existing sheets**: the drafted `מזהה חבר` (sales) and `סוג` (expenses) columns wait for stages 2 and 3 (D11, D14). Only new sheet: `Audit` | promise "no schema changes" in the stage 1 plan | yes |
| D25 | 2026-11-20 | 1 | PINs are set by typing `INITIAL_BAR_PIN` / `INITIAL_ADMIN_PIN` in Script Properties and running `setup`, which hashes and deletes them. No PIN-change screen in the app (none in legacy) | no plain PINs in code; no editor code changes needed | yes |
| D26 | 2026-11-21 | all | **No staging.** Work directly on the production project: backup ("גיבוי עכשיו") before every push, push only when the bar is closed, test on the owner-only `/dev` link, then deploy a new version (old version stays one click away). `seedStaging`, `ENV` and the STAGING stamp removed. Supersedes D1 | 1 user, ~5 h/week; downtime is acceptable, only data safety matters (user) | yes |
| D27 | 2026-11-23 | 3 | **Refunds and expense edit** (user request): new column K `סוג` in `יומן הוצאות` (`הוצאה`/`זיכוי`, blank = הוצאה, header written on the first write – no backfill). Edit changes date/desc/amount/type in place, only for active rows of the open month, audited with before/after. In the report a refund is a negative "זיכוי:" line, so the expenses total is net. Partly supersedes D24 | admin asked for it; additive column, old rows unchanged | yes |
| D28 | 2026-11-23 | 1 | **Faster, never-stuck loading:** request handlers no longer run the full `ensureSheet` (only `setup` does), all Script Properties are read once per request, the members list is cached 6 h (↻ forces a fresh read), the page opens instantly from the last load saved on the device and refreshes in the background, every server call has a timeout, and loading retries automatically / offers "לנסות שוב". Logo embedded once (page 120 → 75 KB) | slow and stuck first loads reported by the user | yes |
| D29 | 2026-11-25 | 7 | **Simple inventory** (user request): new sheet `מלאי` (id, item, amount, status, dates). Add / soft-delete / change amount by any staff. **Every decrease of N adds N** to the item's open line in `חוסרים` (counts up) or creates one; increases don't touch shortages. The page sends absolute amounts (debounced), the server computes the decrease inside one lock → retries can't double-count. `חוסרים` gets columns H `כמות` (amount to buy, editable +/−) and I `מזהה פריט` (link to the item); old rows have no amount | user's rule; additive columns; idempotent by design | yes |

## Pending for the user
| # | Item | Needed before |
|---|---|---|
| U1 | ~~One-time "Allow" on the staging script~~ – staging dropped (D26) | – |
| U2 | Real product catalog and prices | production stage 4 |
| U3 | Budget-office report format (open decision #7) | stage 5 |
| U4 | Tablet manual checklist (`docs/TABLET_CHECKLIST.md`) | production cutover |
| U5 | Production cutover: deploy the new app to the production spreadsheet (after the account move), set new PINs | after review |
| U6 | ~~Stage −1: run `docs/MIGRATION.md`~~ – done 2026-11-20 | – |
| U7 | Buy a USB NFC reader in keyboard-emulation mode that supports NTAG 7-byte UIDs | stage 6 |
