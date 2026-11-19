# JSON API (Apps Script Web App)

One endpoint: `POST <webapp URL>`, body is a JSON **string** sent as `Content-Type: text/plain;charset=utf-8` (no CORS preflight). `fetch` follows the 302 to `script.googleusercontent.com` automatically. Deployed with `executeAs: USER_DEPLOYING`, `access: ANYONE_ANONYMOUS`.

## Envelope
```jsonc
// request
{ "action": "sale.create", "payload": { … }, "auth": { "deviceToken": "…", "pin": "…" }, "clientTxId": "uuid" }
// response
{ "ok": true, "data": { … } }
{ "ok": false, "error": { "code": "VALIDATION", "message": "כמות לא תקינה" } }
```
`message` is Hebrew and safe to show to the bartender. Types: `shared/api.ts`.

## Error codes
| Code | Meaning | Client reaction |
|---|---|---|
| `DEVICE_REQUIRED` | no / unknown device token | go to device setup |
| `DEVICE_REVOKED` | device disabled by admin | device setup |
| `PIN_REQUIRED` | missing or wrong PIN | PIN screen |
| `RATE_LIMITED` | 10 wrong PINs from this device in 10 min | show message, wait |
| `FORBIDDEN` | needs admin | message |
| `VALIDATION` | bad input | message, keep form |
| `NOT_FOUND`, `CONFLICT` | | message |
| `BUSY` | lock not acquired in 25 s | retry with the **same** clientTxId |
| `NOT_CONFIGURED` | bootstrap not done | message |
| `INTERNAL` | unexpected | retry with the same clientTxId |

## Auth
- `device.register` needs `auth.pin` = admin PIN (no device token). Returns a 32-char random token shown once and kept in `localStorage`. Server stores only its hash.
- Every other action (except `ping`, `admin.bootstrap`) needs a valid active device token **and** a PIN. Bar PIN → role `bar`; admin PIN → role `admin` (admin can do everything bar can).
- Wrong PINs are counted per device token (or per "unregistered" bucket).

## Idempotency
Every write action takes `clientTxId`. Inside the script lock the server checks (1) `CacheService` key `tx:<clientTxId>` (6 h), then (2) the id column of the target sheet (`TextFinder`, exact match). A duplicate returns the current state without writing. The client keeps the same clientTxId across retries of the same user intent and generates a new one when the user changes the input.

## Actions

| Action | Role | Payload | Returns | Stage |
|---|---|---|---|---|
| `ping` | – | – | `{env, version, now}` | 1 |
| `admin.bootstrap` | secret | `{secret, env, masterId, barPin, adminPin, adminEmail, financeEmails?, members?: {fileId, tab, lastHeader, firstHeader}, seedStaging?}` | `{configured: true, log}` | 1 |
| `device.register` | admin PIN | `{name}` | `{deviceId, deviceToken, name}` | 1 |
| `device.list` | admin | – | `Device[]` | 1 |
| `device.revoke` | admin | `{deviceId}` | `Device[]` | 1 |
| `admin.setPins` | admin | `{barPin?, adminPin?}` | `{}` | 1 |
| `session.init` | bar | – | `InitData` (role, pub, env, period, cardTypes, members, shift, todos; admin: expenses, reportUrl) | 1 |
| `members.list` | bar | – | `Member[]` (fresh) | 1 |
| `shift.get` | bar | – | `ShiftState` | 1 |
| `sale.create` | bar | `{memberId}` or `{guest:{first,last}}`, `{cardType, qty, note?}` | `ShiftState` | 1 (memberId from 2) |
| `sale.void` | bar | `{saleId}` | `ShiftState` | 1 |
| `expense.list` | admin | – | `ExpensesState` | 1 |
| `expense.create` | admin | `{date:'yyyy-MM-dd', desc, amountAgorot, type?:'EXPENSE'|'CREDIT'}` | `ExpensesState` (+ `warning`) | 1 (type from 3) |
| `expense.void` | admin | `{expenseId}` | `ExpensesState` | 1 |
| `report.refresh` | admin | – | `{url}` | 1 |
| `todo.list` | bar | – | `Todo[]` | 1 |
| `todo.create` | bar | `{text}` | `Todo[]` | 1 |
| `todo.update` | bar | `{todoId, text?, done?}` | `Todo[]` | 1 |
| `todo.delete` | bar | `{todoId}` | `Todo[]` | 1 |
| `members.adminList` | admin | – | `MemberAdmin[]` (all statuses) | 2 |
| `members.syncPreview` | admin | – | `SyncPreview` | 2 |
| `members.syncApply` | admin | `{add: externalKey[], deactivate: memberId[], renames: {memberId, externalKey}[]}` | `SyncResult` | 2 |
| `members.update` | admin | `{memberId, displayName?, phone?, status?}` | `MemberAdmin[]` | 2 |
| `members.merge` | admin | `{fromId, intoId}` | `MemberAdmin[]` | 2 |
| `members.mapLegacy` | admin | – | `{mapped, created, total}` | 2 |
| `expense.backfillType` | admin | – | `{updated}` | 3 |
| `product.list` | bar | – | `Product[]` (active only for bar, all for admin) | 4 |
| `product.upsert` | admin | `ProductInput` (no productId = create) | `Product[]` | 4 |
| `product.seedPlaceholder` | admin | – (staging only) | `Product[]` | 4 |

Admin-only actions are refused with `FORBIDDEN` for the bar PIN. `product.seedPlaceholder` and `admin.bootstrap` with `seedStaging` are refused when `ENV=production`.
