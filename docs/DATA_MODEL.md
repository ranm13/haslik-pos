# Data model

The system spreadsheet holds all sheets. Legacy sheets keep their Hebrew names and column order (stage 1 is 1:1). New sheets use English names. Every text cell is written with a leading `'`.

**Money:** code uses integer **agorot** everywhere. Legacy sheets store **shekels** (as they always have), converted at the sheet boundary (`toAgorot` / `toShekels`). New sheets store agorot in columns named `…Agorot`.

## Legacy sheets (kept, extended)

### `יומן מכירות` – card sales (until stage 5)
Columns 1–17 unchanged (see CURRENT_STATE.md). **Stage 2 adds column 18 `מזהה חבר` (memberId).** Existing rows are not edited; their memberId resolves through `LegacyKeyMap`.

### `יומן הוצאות` – expenses
Columns 1–10 unchanged. **Stage 3 adds column 11 `סוג` (`הוצאה` / `זיכוי`).** Blank = `הוצאה`. A one-time backfill writes `הוצאה` into blank rows (ROADMAP stage 3).
Credits are stored as positive amounts; net = expenses − credits.

### `סוגי כרטיסיות`, `תקופות`, `חוסרים` – unchanged.

## New sheets

### `Devices` (stage 1)
| Column | Type | Notes |
|---|---|---|
| deviceId | text | `D` + 8 random chars |
| tokenHash | text | SHA-256(salt + token), base64 |
| name | text | e.g. "טאבלט בר" |
| active | bool | revoke = false |
| createdAt | date | |
| createdBy | text | who registered it |
| lastSeenAt | date | updated at most every 10 minutes |

### `Audit` (stage 1)
| timestamp | action | actor | deviceId | clientTxId | payload (JSON, ≤ 2,000 chars) |
Append-only. Every write action logs one row.

### `Members` (stage 2)
| Column | Type | Notes |
|---|---|---|
| memberId | text | `M00001`, sequential, never reused |
| firstName, lastName | text | |
| displayName | text | unique among active members; defaults to "first last" |
| phone | text | optional |
| status | `active` / `inactive` / `merged` | removed from external list → `inactive`, never deleted |
| source | `EXTERNAL` / `GUEST` / `MANUAL` | |
| externalKey | text | `last|first` for EXTERNAL, `guest|last|first` for GUEST |
| mergedInto | text | memberId, when status = merged |
| balanceCache | integer agorot | 0 until stage 5 |
| createdAt, updatedAt | date | |

### `LegacyKeyMap` (stage 2)
| legacyKey | memberId | mappedBy | mappedAt |
Maps every key ever written to `יומן מכירות` (`last|first`, `guest|last|first`) to a memberId.

### `Products` (stage 4)
| Column | Type | Notes |
|---|---|---|
| productId | text | `P0001`, sequential |
| name | text | unique among active products |
| category | text | free text; the POS groups by it |
| priceAgorot | integer | ≥ 0; 0 allowed only when `isOpenPrice` |
| active | bool | "delete" = false; rows are never removed |
| sortOrder | integer | within category |
| trackStock | bool | unused until stage 7 |
| minLevel | integer | unused until stage 7 |
| isOpenPrice | bool | bartender types the amount |
| createdAt, updatedAt | date | |

## Script Properties
| Key | Set by | Meaning |
|---|---|---|
| `MASTER_ID` | bootstrap | system spreadsheet id |
| `REPORTS_FOLDER_ID`, `BACKUP_FOLDER_ID` | setup | |
| `PIN_SALT`, `BAR_PIN_HASH`, `ADMIN_PIN_HASH` | bootstrap / `admin.setPins` | |
| `ADMIN_EMAIL` | bootstrap | monthly report recipient |
| `FINANCE_EMAILS` | bootstrap | comma separated |
| `MEMBERS_FILE_ID`, `MEMBERS_TAB_NAME`, `MEMBERS_LAST_HEADER`, `MEMBERS_FIRST_HEADER` | bootstrap | external list |

Non-secret constants (pub name, close hour 08:00, shift offset 8h, undo 30 min, max qty 20, backup retention 120 days) stay in code (`src/gas/config.ts`).

## Later stages (reference only, not built yet)
`Transactions`, `Tags`, `StockMovements`, `Shifts`, `Staff`, `Periods` rename – see ROADMAP §3.
