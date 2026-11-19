# Current state – legacy Apps Script app

Source: `backend/legacy/` (scrubbed copy; real PINs/emails replaced). ~1,800 lines across 5 `.gs` files + `Index.html`.

## Deployment
- Container-bound script on the "system" spreadsheet, deployed as a Web App: `executeAs: USER_DEPLOYING`, `access: ANYONE` (= any **signed-in** Google user). UI is `Index.html` served by `doGet`, calling server functions via `google.script.run`.
- Time zone `Asia/Jerusalem`, V8 runtime.

## Configuration (`Config.gs`, hard-coded)
| Key | Meaning |
|---|---|
| `PUB_NAME` | Display name (`פאב "הסליק"`) |
| `ADMIN_EMAIL` | Receives monthly report; logged-in owner gets admin without PIN |
| `FINANCE_EMAILS` | Viewers added to the reports folder |
| `MEMBERS_SHEET_URL`, `MEMBERS_TAB_NAME` (`עדכני`), `MEMBERS_LAST_NAME_HEADER`, `MEMBERS_FIRST_NAME_HEADER` | External read-only member list (Google Sheet or xlsx) |
| `BAR_PIN`, `ADMIN_PIN` | Plain-text PINs |
| `CLOSE_HOUR` (8) | Month closes on last day at 08:00 |
| `SHIFT_DAY_OFFSET_HOURS` (8) | Sale before 08:00 belongs to previous evening's shift |
| `BAR_UNDO_MINUTES` (30) | Bartender undo window |
| `MAX_QTY` (20) | Max cards per sale |
| `BACKUP_KEEP_DAYS` (120) | Weekly backup retention |

Script Properties: `MASTER_ID` (system spreadsheet), `REPORTS_FOLDER_ID`, `BACKUP_FOLDER_ID`. Cache: `members` (10 min), `pinFails`.

## Sheets
| Sheet | Columns |
|---|---|
| `יומן מכירות` (sales) | מזהה, זמן רישום, חודש, תאריך משמרת, שם משפחה, שם פרטי, מפתח חבר, ברשימה, סוג כרטיסייה, כמות, מחיר יחידה, סה"כ, הערות, נרשם ע"י, סטטוס (פעיל/בוטל), בוטל בזמן, בוטל ע"י |
| `יומן הוצאות` (expenses) | מזהה, זמן רישום, חודש, תאריך הוצאה, פירוט, סכום, נרשם ע"י, סטטוס, בוטל בזמן, בוטל ע"י |
| `סוגי כרטיסיות` (card types) | שם, מחיר, פעיל (checkbox) |
| `תקופות` (periods) | חודש (yyyy-MM), שם, התחלה, סיום, מזהה דוח, קישור לדוח, סטטוס (פתוח/סגור) |
| `חוסרים` (shortages) | מזהה, פריט, סטטוס (חסר/נקנה/נמחק), נוצר, נוצר ע"י, עודכן, עודכן ע"י |

All text cells are written with a leading `'` (forces text, blocks formula injection). Amounts are **whole/decimal shekels** (card prices are integers; expenses allow 2 decimals). Sheets are protected with warning-only.

Member key = `last|first` from the external list; guests = `guest|last|first`. Duplicate names in the external list collapse to one key.

## Server functions (`Api.gs`)
All take `pin` first. `auth_` → `{isAdmin, who}`; 15 wrong PINs → 10-minute lockout (global, not per device).

| Function | Role | Behavior |
|---|---|---|
| `api_init` | any | pub name, open period, active card types, members, shift state, todos; + expenses & report URL for admin |
| `api_members` | any | force-refresh member list |
| `api_sell(req)` | any | `{id, memberKey | first/last, type, qty, note}`; idempotent on `id`; appends sales row |
| `api_voidSale(id)` | any | bar: ≤30 min; admin: any time in open month; closed month → refused; sets status=בוטל |
| `api_shift` | any | today's shift: count, amount, last 40 rows (from last 400) with `canUndo` |
| `api_addExpense(req)` | admin | `{id, date, desc, amount}`; date in closed month → booked to open month + warning; no future dates |
| `api_voidExpense(id)` | admin | open month only |
| `api_expenses` | admin | open month list + total |
| `api_refreshReport` | admin | rebuild open month report, return URL |
| `api_todos / addTodo / updateTodo / deleteTodo` | any | shortage list; delete = status נמחק; returns open (newest first) + last 25 bought |

## Jobs (`Setup.gs`)
- `dailyJob` (daily at `CLOSE_HOUR`): opens first period if none; closes month if due (or overdue); else refreshes draft report.
- `closePeriod_`: marks period closed, opens next, builds final report, locks it (removes editors), emails `ADMIN_EMAIL` with HTML summary + PDF, builds new month's draft.
- `backupJob` (Sundays 04:00): copies the system spreadsheet into backups folder; trashes copies older than 120 days.
- `onOpen` menu: refresh report, backup now, close month now, setup.
- `setup()`: creates sheets/headers/formats/protections, folders, triggers, first period; checks member-list access.

## Monthly report (`Report.gs`)
One spreadsheet per month in the reports folder with tabs:
- **הכנסות**: one row per buyer (last, first, [qty per card type if >1 type], total qty, total ₪, notes incl. "לא ברשימה"), filter, banding, `SUM` total row.
- **הוצאות**: date, description, amount, `SUM` total.
- **סיכום**: income (cards, ₪), expenses, net profit (red if negative), breakdown per card type, period info (start–end, #shifts, #buyers, #expenses, status draft/final, last updated).

## UI (`Index.html`, mobile-first, RTL, paper/stamp visual style, dark mode)
- PIN screen (PIN kept in localStorage).
- **מכירה**: tonight's stats (cards, ₪); member search (≥2 chars, Hebrew-normalized token match, 40 results); refresh members; guest entry; sale sheet (card type chips with price and punch count, qty stepper 1–20, note, confirm with total); recent list with two-tap undo.
- **חוסרים**: add, tick bought/unbought (optimistic), edit, delete.
- **הוצאות** (admin): form (desc, amount, date), month list with two-tap void, total, open/refresh report.
- Refresh shift on returning to the app.
