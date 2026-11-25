# Server API (Apps Script, `google.script.run`)

The page (`src/ui/app.js`, served by `doGet`) calls one server function:

```js
google.script.run.withSuccessHandler(cb).api({ action, payload, auth: { pin }, clientTxId })
```

The web app is deployed with `executeAs: USER_DEPLOYING` and `access: ANYONE` (any signed-in Google account, as in the legacy app). There is no HTTP JSON endpoint (`doPost` was removed, D16).

## Envelope
```jsonc
// request
{ "action": "sale.create", "payload": { … }, "auth": { "pin": "…" }, "clientTxId": "uuid" }
// response – api() never throws; failures come back as data
{ "ok": true, "data": { … } }
{ "ok": false, "error": { "code": "VALIDATION", "message": "כמות לא תקינה" } }
```
`message` is Hebrew and safe to show to the bartender. Types: `src/shared/api.ts`. Money is always integer agorot (`…Agorot` fields).

## Error codes
| Code | Meaning | Page reaction |
|---|---|---|
| `PIN_REQUIRED` | missing or wrong PIN | PIN screen |
| `RATE_LIMITED` | 15 wrong PINs in 10 min (global, as legacy) | show message, wait |
| `FORBIDDEN` | needs admin | message |
| `VALIDATION` | bad input | message, keep form |
| `NOT_FOUND`, `CONFLICT` | | message |
| `BUSY` | lock not acquired in 25 s | retry with the **same** clientTxId |
| `NOT_CONFIGURED` | `setup` not run / PINs or members file missing | message |
| `INTERNAL` | unexpected | retry with the same clientTxId |

## Auth
- The script owner's Google account (`ADMIN_EMAIL`, default: the account that runs `setup`) is admin without a PIN – Google reveals the visitor's email to the script only for the owner.
- Everyone else sends `auth.pin`: bar PIN → role `bar`, admin PIN → role `admin` (admin can do everything bar can).
- PINs are stored only as salted SHA-256 hashes in Script Properties. They are set by typing `INITIAL_BAR_PIN` / `INITIAL_ADMIN_PIN` in Project Settings → Script Properties and running `setup`, which hashes them and deletes the plain values.
- Wrong PINs are counted globally in `CacheService` (15 per 10 minutes), as in the legacy app.

## Idempotency
Every write action takes `clientTxId`. Inside the script lock the server checks (1) `CacheService` key `tx:<clientTxId>` (6 h), then (2) the id column of the target sheet (`TextFinder`, exact match). A duplicate returns the current state without writing. The page keeps the same clientTxId across retries of the same user intent and generates a new one when the input changes.

## Actions (stage 1)

| Action | Role | Payload | Returns |
|---|---|---|---|
| `session.init` | bar | – | `InitData` (role, pubName, env, version, period, cardTypes, members, shift, todos; admin: expenses, reportUrl) |
| `members.list` | bar | – | `Member[]` (re-read from the external list) |
| `shift.get` | bar | – | `ShiftState` |
| `sale.create` | bar | `{memberId}` or `{guest:{first,last}}`, plus `{cardType, qty, note?}` | `ShiftState` |
| `sale.void` | bar | `{saleId}` | `ShiftState` |
| `expense.list` | admin | – | `ExpensesState` |
| `expense.create` | admin | `{date:'yyyy-MM-dd', desc, amountAgorot, type?:'EXPENSE'|'CREDIT'}` (CREDIT = refund) | `ExpensesState` (+ `warning`) |
| `expense.update` | admin | `{expenseId, date, desc, amountAgorot, type}` – active rows of the open month only; booking month never changes | `ExpensesState` (+ `warning`) |
| `expense.void` | admin | `{expenseId}` | `ExpensesState` |
| `report.refresh` | admin | – | `{url}` |
| `todo.list` | bar | – | `Todo[]` |
| `todo.create` | bar | `{text, qty?}` (qty = amount to buy, optional) | `Todo[]` |
| `todo.update` | bar | `{todoId, text?, done?, qty?}` (qty null = clear) | `Todo[]` |
| `todo.delete` | bar | `{todoId}` | `Todo[]` |
| `inventory.list` | bar | – | `InventoryItem[]` |
| `inventory.create` | bar | `{name, amount}` | `{inventory, todos}` |
| `inventory.setAmount` | bar | `{itemId, amount}` – the new **absolute** amount; a decrease of N adds N to the item's open shortage line (or a new line) in the same lock, so a retry adds nothing | `{inventory, todos}` |
| `inventory.delete` | bar | `{itemId}` – soft delete | `{inventory, todos}` |

Before stage 2, `Member.id` is the legacy name key (`last|first`). Admin-only actions are refused with `FORBIDDEN` for the bar PIN.

Later stages add: members sync and admin (stage 2), expense type EXPENSE/CREDIT (stage 3), products (stage 4).

## Editor-only functions (not callable from the page)
| Function | What it does |
|---|---|
| `setup` | Idempotent install/repair: points at the bound spreadsheet, hashes INITIAL_* PINs, converts `MEMBERS_URL` to `MEMBERS_FILE_ID`, creates sheets, folders, triggers and the open month, checks the members list. Logs ✔/✘ per step |
| `dailyJob`, `backupJob` | Triggers (daily 08:00 close/refresh, weekly backup) |
| `menuRefresh`, `menuCloseNow` | Spreadsheet menu `🍺 הסליק` |
