# HaSlik POS – migration and development roadmap

> This file lives in the repo at `docs/ROADMAP.md`. Claude Code reads it at the start of every stage, does **one stage only**, and updates the "Status" section at the end.
>
> Hebrew is kept only for terms that appear as-is in the sheets or the UI (sheet names, column names, UI labels).

---

## 1. Background

The community pub "HaSlik" (הסליק) runs a Google Apps Script Web App today (a scrubbed copy of its code is in `legacy/`). It manages:
- **Punch-card sales** (`יומן מכירות`): a named record of each punch-card purchase, by card type (`סוגי כרטיסיות`: name, price, active). Actual billing happens against an external community budget; the system only records. **The current system has no balances**, only purchase records.
- **Guests:** a purchase can be recorded for someone who is not on the members list, by free-text name (key `guest|last|first`).
- **Undo:** the bar can cancel a sale within 30 minutes; an admin can cancel as long as the month is open. Cancel = change the row's status (not a counter-entry).
- **Expenses** (`יומן הוצאות`) entered by the admin, including cancel.
- **Shortages** (`חוסרים`): a free-text list with status missing / bought / deleted.
- **Monthly periods** (`תקופות`): a daily trigger closes the month on its last day at 08:00, generates a report file (income / expenses / summary), locks it, shares it read-only with the finance people and emails the admin.
- **Weekly backup** (trigger on Sunday 04:00, kept 120 days).
- **Members list:** read from an external, read-only file (Google Sheet or xlsx in Drive), first and last name only. **The member id is derived from the name**; there is no stable id.
- **Permissions:** bar PIN and admin PIN **hard-coded** in `Config.gs`, plus the script owner by email. Wrong-PIN rate limiting via CacheService.

All data is stored in Google Sheets in Drive.

**Target:** the same Apps Script Web App, upgraded into a point-of-sale running on an Android tablet behind the bar. Every member has a named wallet (a shekel balance, not real money), an NFC tag (NTAG213/215/216) that identifies them, top-ups, and charges from a product catalog. **Top-ups** are what gets billed to the community budget (replacing punch-card sales). Tags are read by a **USB NFC reader in keyboard-emulation mode**.

---

## 2. Architecture decisions (closed)

| Topic | Decision | Reason |
|---|---|---|
| Data storage | Stays in Google Sheets | Transparent to the team, free, continues what exists |
| App hosting | **Everything stays in Apps Script**: the UI is served by `doGet` (HtmlService) and calls the server with `google.script.run`. No GitHub Pages, no separate frontend | 1–2 devices, rarely used. A USB keyboard-emulation reader works inside the Apps Script iframe, so Web NFC (and a separate frontend) is not needed |
| Code | TypeScript, bundled by esbuild, managed with `clasp` from the repo root | Versions, diffs, and Claude Code can edit it |
| Source of truth for balances | **Append-only ledger** (transactions sheet). Balance = sum of transactions. A `balanceCache` column in the members sheet is updated inside the lock and used for fast reads; it can always be recomputed and compared | Always auditable and recoverable; no "edit balance" |
| Member identity | **`Members` sheet owned by the app** with a stable `memberId` (not derived from the name). The external list stays the **source of membership** and is synced into `Members` with admin approval | Wallets, tags and reports need an id that does not change when someone changes their name or when two members share a name |
| Tag identity | The tag holds only its UID. UID → memberId mapping in a separate sheet | Lost tag = unlink and link a new one; the balance does not move |
| Opening balance | **Everyone starts at 0.** Old punch-card records are kept as a read-only archive and are not converted into balances | The old system has no balances, so there is nothing to convert |
| Amounts | Integers in agorot everywhere in the code | No floating-point errors |
| Secrets | PINs, admin email and spreadsheet ids live in **Script Properties**, PINs as hashes. Not in the code and not in the repo | The repo is public |

### Repo layout
```
/src/core        pure logic (money, undo, normalization) – also runs in Node for tests
/src/gas         Apps Script layer (sheets, lock, handlers, triggers)
/src/shared      types and helpers used by both server and UI
/src/ui          HTML/JS served by doGet
/src/main.ts     entry point bundled into dist/Code.js
/test            Vitest unit tests (Node)
/legacy          the old code, scrubbed (read-only, for reference)
/docs            ROADMAP.md, CURRENT_STATE.md, PARITY.md, DATA_MODEL.md, API.md, INVARIANTS.md, DECISIONS.md, MIGRATION.md
build.mjs        esbuild bundle → dist/ (clasp pushes dist/)
appsscript.json  Apps Script manifest
.clasp.json      clasp project link (git-ignored)
/.github/workflows/test.yml   unit tests in CI
CLAUDE.md        working rules for Claude (see section 8)
```

### Technical pitfalls that must be handled
1. **Keyboard focus in the iframe:** Apps Script serves the page inside an iframe. Key events from the USB reader reach the app only while the iframe has focus. The page calls `window.focus()` on load, and any tap on the screen restores focus. See stage 6.
2. **Concurrency:** every write is wrapped in `LockService.getScriptLock()`. Inside the lock: idempotency check → balance check → write the transaction → update the cache.
3. **Idempotency:** every client action carries a `clientTxId` (UUID). The server ignores duplicates and returns the original result. This is critical: without it, a retry on a weak network = a double charge.
   - **Performance:** the old code looks ids up with a linear scan of the whole sheet (`findRowById_`). With 1–2 devices and low volume, a scan of the last N rows is enough (a client never retries after more than a few hours).
4. **Security:** the web app URL is not published anywhere, but anyone who gets it can open the page. Therefore:
   - **Bar PIN** to open the app, **admin PIN** for admin actions. Hashes in Script Properties, rate limiting of wrong PINs.
   - **The current PINs are considered exposed** (they are in the code). They are replaced when stage 1 goes live.
   - The sheets themselves: edit access only for the owner and the script. Bank-grade security is not required, but protection against "someone found the URL" is.
5. **Speed:** `google.script.run` takes about 1–3 seconds. The UI must be optimistic with a clear indicator (pending / confirmed / failed) and must not block the bartender. The balance is shown from `balanceCache`, not computed from the whole ledger.
6. **Tests:** money logic is written as pure functions in `src/core` (no `SpreadsheetApp`) so it runs in Node in CI. The Sheets and lock layer is checked by hand on the live app through the `/dev` test link (see section 8).

---

## 3. Data model (sheets)

| Sheet | Main columns |
|---|---|
| `Members` | memberId, firstName, lastName, displayName, phone?, status (active/inactive), source (EXTERNAL/GUEST/MANUAL), externalKey?, balanceCache, createdAt, updatedAt |
| `LegacyKeyMap` | legacyKey (`last\|first` or `guest\|...`), memberId, mappedBy, mappedAt |
| `Tags` | tagUid, memberId, status (active/lost/revoked), linkedAt, unlinkedAt, linkedBy |
| `Transactions` (ledger) | txId, clientTxId, timestamp, memberId, type (TOPUP/CHARGE/REVERSAL/ADJUSTMENT), amountAgorot (+/−), items (JSON), shiftId, deviceId, staff, reversesTxId?, noChip (bool), note |
| `Products` | productId, name, category, priceAgorot, active, sortOrder, trackStock (bool), isOpenPrice (bool) |
| `StockMovements` | movementId, timestamp, productId, delta, reason (SALE/PURCHASE/COUNT/WASTE/ADJUST/REVERSAL), refTxId?, by |
| `Stock` (view) | productId, onHand (formula/computed), minLevel, reorderQty |
| `Expenses` | expenseId, timestamp, period, type (EXPENSE/CREDIT), amountAgorot, category, description, receiptLink?, by, status |
| `Periods` | periodKey (yyyy-MM), title, start, end, reportId, reportUrl, status (open/closed) |
| `Shifts` | shiftId, openedAt, closedAt, staffNames, deviceId |
| `Staff` | staffId, name, pinHash, role (bartender/manager) |
| `Audit` | timestamp, action, actor, deviceId, payload |
| `LegacySales` (archive) | the old `יומן מכירות` as-is, read-only |

> The final names and structure are set in stage 0 in `docs/DATA_MODEL.md` after mapping the existing sheets. Existing data is never deleted: old sheets are kept as an archive or mapped to new ones, and every schema change is shown as a diff for approval.
> There is no MIGRATION transaction type: everyone starts at 0 (see section 2). ADJUSTMENT is reserved for admin corrections with a mandatory reason.

---

## 4. POS business rules (binding)

1. **Top-up:** allowed for any staff member during an open shift. No special admin permission. Every top-up is recorded with shiftId and the staff name(s).
2. **No negative balance.** A charge that would take the balance below 0 is **blocked on the server** (not only in the UI).
   - When a charge is blocked, or the balance reaches 0, a dialog opens: "Not enough balance, top up?" (Hebrew in the UI). Confirming it performs **top-up + charge as one atomic server action** (two transactions inside the same lock, with the same base clientTxId), so neither can be left without the other.
   - A balance of exactly 0 after a charge is allowed. The dialog is shown as a warning on the next scan.
3. **Undo of the last transaction (by staff):** allowed only if
   - less than 30 minutes have passed since the transaction, **and**
   - no other action has been made **on that member's account** since.
   - Undo = a new REVERSAL transaction that points to the original txId. No rows are deleted. Stock is restored too (from stage 7).
   - Undoing an atomic top-up + charge reverses both together.
   - A transaction cannot be reversed twice, and a REVERSAL cannot be reversed.
4. **Late / exceptional undo:** admin only (admin PIN), with a mandatory reason. Logged in Audit. An undo that would take the balance below 0 (e.g. undoing a top-up that was already spent) is blocked; the admin uses ADJUSTMENT with a reason instead.
5. **Lost tag:** an admin or staff member marks the tag as `lost` and links a new tag to the same memberId. Balance and history do not change. Scanning a `lost` tag shows a warning and does not allow a charge.
6. **Charge without a tag:** possible from a name search, provided "forgot my tag" is ticked (`noChip` on the transaction). Until stage 6 (NFC) all charges come from name search.
7. **Stock (from stage 7):** every charge of a product with `trackStock` automatically creates a SALE StockMovement, and an undo creates a REVERSAL.
8. **Guests:** a guest (someone not on the external list) is created in `Members` with `source=GUEST` and gets a wallet like any member. The monthly report shows guests separately.
9. **Periods:** every transaction and expense row belongs to a month by its record time. A "shift" that runs past midnight belongs to the evening's date (until 08:00 in the morning, as today). Closing a month does not block charges, but a staff undo of a transaction from a closed month is not allowed (admin only, via ADJUSTMENT).

---

## 5. Stages

Every stage ends in a state that works in production. A stage does not start before the previous one meets its acceptance criteria.

**Order and reasoning:** identity (members) and infrastructure first, then the catalog the POS needs, then the wallet, and only after that NFC and full stock. Movement-based stock management is the largest and least critical stage for the core goal, so it comes after the POS works. The existing shortages list keeps working as-is until then.

### Stage −1 – Move to a dedicated Google account
- The existing app (code + all sheets) is copied from the private account to a dedicated Gmail account for the pub. **Nothing in the private account changes**: the dedicated account gets view-only access to the source, and the copy is made with "Make a copy".
- The legacy `setup()` is run in the copy: it points the app at the copy, creates new report and backup folders, checks the members list and creates the triggers.
- Old monthly reports stay in the private account; the links in `תקופות` keep working.
- The owner of the external members list shares it with the dedicated account (view). A prerequisite for the move.
- In the old app only the two triggers are deleted (to prevent a double monthly report). Data and code stay.
- From here on: clasp and the app live in the dedicated account. GitHub stays on the personal account.
- Full instructions: `docs/MIGRATION.md`.
- **Acceptance:** `setup()` finishes with all 7 steps, a test sale at the new URL is written to the copy only, and the bar works at the new URL.

### Stage 0 – Mapping and contracts
- Import the existing Apps Script code into `legacy/`.
- Write `docs/CURRENT_STATE.md`: all functions, all sheets and columns, all screens and flows, all triggers (daily close, weekly backup) and emails.
- Write `docs/PARITY.md`: a table of **every existing capability** → in which stage it is kept, changed or replaced, and why. No capability disappears silently.
- Write `docs/DATA_MODEL.md` (final schema for all sheets, transaction types, idempotency and undo rules) and `docs/API.md` (all actions, input, output, errors, required permission).
- Write `docs/INVARIANTS.md`: a list of money invariants, each mapped to an automated test (see stage 5).
- **Acceptance:** the five documents are approved by the user.

### Stage 1 – 1:1 rewrite (no new features)
- Server: one entry point `api(request)` called from the UI with `google.script.run` (`{action, payload, auth, clientTxId}`) → handlers. Uniform response `{ok, data | error: {code, message}}`.
- UI: rebuild all existing screens (punch-card sales including guests, undo, expenses, shortages, shift status) in the new HtmlService page. Full RTL, Hebrew, large buttons for a tablet (minimum 48px), landscape.
- **Periods and reports:** automatic month close, generating the report file, locking it, sharing it with the finance people and the monthly email keep working exactly as today (the triggers stay on the server).
- **Weekly backup** keeps working.
- **Security:** move PINs, admin email and the external list URL from `Config.gs` to Script Properties (PINs as hashes). **Replace the current PINs** on go-live day.
- GitHub Actions: unit tests for `src/core` run in CI. Deploy is `clasp push` + a new deployment version.
- **Acceptance:** every row in `PARITY.md` marked "stage 1" works in the new app, against the same sheets, in Chrome on Android. One monthly report is generated by the new system and matches one from the old. The old deployment stays available as a fallback.

### Stage 2 – Members and identity
- A `Members` sheet owned by the app, with a stable `memberId`.
- **Sync from the external list** (an admin action, not automatic): the system shows a diff – new members, members who left the list (→ inactive, never deleted), possible renames (matched by externalKey), and duplicate names. The admin approves row by row or all at once.
- **Duplicate names:** two members with the same name get a distinct `displayName` (e.g. an added letter/phone) set by the admin.
- **Guests:** a guest is created in `Members` with `source=GUEST`. An admin can merge a guest into a member from the list (mapping, not deletion).
- **LegacyKeyMap:** map every old name key (including guests from `יומן מכירות`) to a memberId, so the archive and history can be linked.
- Punch-card sales (from stage 1) switch to using memberId instead of the name key.
- Admin screen: members list, search, edit displayName / phone / status.
- **Acceptance:** one full sync done and approved, every key in `יומן מכירות` is mapped, and no two active members share a displayName.

### Stage 3 – Credits in expenses
- A `type` field (expense / credit – `הוצאה` / `זיכוי`) in the expense form. A credit is stored as a positive amount with type=CREDIT, and totals are computed net.
- Show the net in the existing reports. Migration: all old rows get type=EXPENSE.
- **Acceptance:** the monthly report shows expenses, credits and net separately.

### Stage 4 – Product catalog
- `Products`: manage products, categories and prices (CRUD) in an admin screen. **This is the catalog the POS uses in stage 5.**
- An "open item" product (`isOpenPrice`) where the bartender enters the amount.
- `trackStock` and `minLevel` already exist in the schema but are not used yet (stage 7).
- Delete = `active=false`. A product that appeared in a transaction is never deleted.
- **Acceptance:** the bar's full catalog is entered and approved by the user.

### Stage 5 – Wallet and POS (no NFC yet)
- `Transactions`, POS screen: search member by name → member card (name, balance, last 5 transactions) → product grid by category → cart → charge.
- Top-up with preset amounts (50/100/200) + a free amount.
- All the rules of section 4 (negative block, atomic top-up + charge, 30-minute undo, admin undo, guests, periods).
- `balanceCache` is updated inside the lock. An admin "consistency check" action recomputes from the ledger and flags differences.
- **Cutover:**
  - All members start at balance 0. No opening transactions.
  - A cutover date is set in advance = the start of a month. From that date the POS replaces punch-card sales; `יומן מכירות` becomes a read-only archive.
  - **Parallel run:** on the first pilot evening the staff also records on paper / in the old app, and at the end of the evening the two are compared.
- **Monthly billing report** (replaces the punch-card income report): **total top-ups** per member (this is what is billed to the community budget), alongside consumption and end-of-month balance. Guests separately. Still generated, locked and emailed as today.
- **Tests:**
  - **Unit (Node, in CI):** for all logic in `src/core`, for every invariant in `INVARIANTS.md`, including at least:
    - balance = sum of transactions, after any sequence of actions.
    - no charge goes below 0; top-up + charge is all-or-nothing.
    - resending the same clientTxId = no change, and the original result is returned.
    - undo is blocked after 30 minutes, after another action on the same member, and the second time.
    - an admin undo that would go below 0 is blocked.
    - total top-ups in the report = sum of TOPUP transactions minus TOPUP reversals in the month.
    - month/shift assignment around midnight, 08:00 and month end.
  - **Integration (live app, `/dev` link, bar closed):** a script that sends 20 concurrent charges to the same member whose balance covers 10 of them and verifies exactly 10 succeed; and a duplicate send of the same clientTxId.
- **Acceptance:** all tests green, and one pilot evening with name search only, with no differences between the report and the manual count.

### Stage 6 – NFC (USB reader)
- A `TagReader` abstraction with one implementation for now:
  - `KeyboardWedgeReader` – a USB reader that types UID + Enter. **No input field and no focus juggling:** a global `keydown` listener on the page collects characters that arrive less than ~30 ms apart. A fast burst that ends with Enter and matches the UID format is a scan; slower keys are normal typing and are ignored. If a text field was focused during a scan, the scanned characters are removed from it.
  - UID normalization: hex, upper case, no separators, plus handling of reversed byte order and decimal output (some readers type the UID in decimal). Unit tests for normalization with real samples from the reader.
  - Web NFC is not used (it does not work inside the Apps Script iframe).
- Tablet setup: with the reader connected, Android treats it as a physical keyboard and hides the on-screen keyboard. Turn on **"Use on-screen keyboard"** (Settings → System → Keyboard / Languages & input → Physical keyboard). Goes into `docs/TABLET_CHECKLIST.md`.
- Scan → the member card opens immediately.
- Issue screen: scan a new tag → pick a member from the list → link. A tag already linked to another member is blocked.
- "Lost tag" flow: pick a member → mark the old tag as lost → scan a new tag.
- Scanning an unlinked tag offers "link to a member?".
- **Acceptance:** 20 consecutive scans with no misses, and re-linking a lost tag works end to end.

### Stage 7 – Full stock management
- Movement-based stock: receiving goods, stock count (enter the actual quantity, the system records the difference), waste.
- A POS charge of a product with `trackStock` creates SALE, and an undo creates REVERSAL (rule 7).
- `חוסרים` becomes a computed view: products below minLevel, and a shopping list ready to share on WhatsApp. Free-text items are still possible for things not in the catalog.
- Migration of the existing shortages list: open items that match a product → mapped; the rest stay as free text.
- **Acceptance:** one full stock count done in the system, and the view matches reality.

### Stage 8 – Hardening
- **No offline mode:** a page served by Apps Script cannot load or run without a network. Instead: a clear "no connection" state, and every failed action is retried with the **same** clientTxId, so a retry can never double-charge.
- Shift close: summary of top-ups / charges / undos in the shift.
- **Daily** automatic backup of the spreadsheet (upgrade from the existing weekly one; a time-driven trigger that copies to the backups folder), including cleanup of old backups.
- Kiosk mode for the tablet (full screen, prevent accidental exit), dark mode for a dark bar.

---

## 6. Open decisions

| # | Question | Default if not decided |
|---|---|---|
| 1 | ~~Hardware: tablet with built-in NFC or a USB reader?~~ | **Decided:** USB reader in keyboard-emulation mode. Not bought yet – must support NTAG213/215/216 (7-byte UID). Test: plug it in, open a notes app, tap a tag – the UID must appear as typed text |
| 2 | Can a member see their balance from their own phone? | Not at this stage (a view page with a personal link can be added later) |
| 3 | ~~Undo: "no other action" – per member or for the whole POS?~~ | **Decided:** per member |
| 4 | Product structure: fixed price or variable prices for events? | Fixed price + an "open item" with an amount |
| 5 | ~~Opening balance at cutover~~ | **Decided:** 0 for everyone, old punch cards as an archive |
| 6 | ~~Source of the members list~~ | **Decided:** `Members` owned by the app + sync from the external list |
| 7 | What exactly does the community budget manager need in the monthly report (format, columns, timing)? | The current report and its columns, with "total top-ups" instead of "total punch cards". Find out before stage 5 |
| 8 | Can a member who became inactive and still has a balance be charged? | Yes for charges up to the balance, no for top-ups. An admin can zero it with ADJUSTMENT |
| 9 | What about punch cards bought in the month of the cutover? | Cutover at the start of a month, so there is no mixed month |
| 10 | ~~Hosting: GitHub Pages frontend or Apps Script UI?~~ | **Decided:** Apps Script UI (see section 2) |

---

## 7. Prompt for each stage (template)

```
Read docs/ROADMAP.md, CLAUDE.md, docs/PARITY.md and docs/DATA_MODEL.md. We are in stage <N>.
1. Summarize in 5 lines what the stage includes and its acceptance criteria.
2. Show a work plan: files touched, sheet schema changes (as a diff), new API actions, new invariants and tests.
3. Ask me about every ambiguity before writing code.
4. After approval – implement, with a commit per sub-task.
5. At the end: run the tests, give me a manual checklist for the tablet, update PARITY.md and the "Status" section.
```

---

## 8. Rules for CLAUDE.md

- One stage at a time. Never implement features from future stages.
- No staging copy (D26). Before every push: a backup ("גיבוי עכשיו"), push on a day the bar is closed, test on the `/dev` link, then deploy a new version. Never leave untested code pushed – the triggers run the newest pushed code.
- Never delete or edit rows in `Transactions`. Append only.
- Every business rule is enforced **on the server**. The UI only reflects it.
- Amounts in agorot (integer). No floats in money calculations.
- Every write: LockService + clientTxId + an Audit row.
- Money logic only in `src/core`, as pure functions. Every new rule or invariant comes with a test.
- Never store PINs, tokens, emails or spreadsheet ids in the code or the repo. Only in Script Properties.
- A member's id is always `memberId`. Never derive identity from a name.
- UI: Hebrew, RTL, masculine or neutral phrasing, large buttons, clear success/failure feedback.
- Before a schema change: show a diff of the sheets and get approval.
- No existing capability is removed without a matching row in `PARITY.md`.
- Examples and test data use fictitious names only (ישראל ישראלי etc.), never real members' names.

---

## 9. Status

| Stage | Name | State | Notes |
|---|---|---|---|
| −1 | Move to dedicated account | ✅ | Done 2026-11-20 (`docs/MIGRATION.md`) |
| 0 | Mapping and contracts | 🟡 | Docs written (commit `53c12bd`), awaiting user approval |
| 1 | 1:1 rewrite | 🟡 | Code done (2026-11-21). Next: first release to production with `docs/TABLET_CHECKLIST.md` |
| 2 | Members and identity | ⬜ | |
| 3 | Credits in expenses | ⬜ | |
| 4 | Product catalog | ⬜ | |
| 5 | Wallet and POS | ⬜ | |
| 6 | NFC | ⬜ | |
| 7 | Full stock management | ⬜ | |
| 8 | Hardening | ⬜ | |
