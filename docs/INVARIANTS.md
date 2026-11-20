# Invariants

Each invariant maps to automated tests (`test/*.test.ts`, run in CI with `npm test`) and, where it depends on Sheets/locking, to a staging integration script (not written yet).

| ID | Invariant | Unit test | Integration |
|---|---|---|---|
| **Money** ||||
| M1 | All money in code is integer agorot; sheet conversion round-trips exactly (₪12.30 ↔ 1230) | `money.test.ts` | – |
| M2 | Parsing user input never produces float drift (e.g. "0.1"+"0.2" → 30 agorot) and rejects >2 decimals, negatives, NaN | `money.test.ts` | – |
| **Sales (stage 1–4, legacy card sales)** ||||
| S1 | Sale total = qty × unit price of the active card type at sale time; qty ∈ [1, 20] | `sales.test.ts` | `sale-basic` |
| S2 | Same clientTxId twice → exactly one row | `idempotency.test.ts` | `sale-replay` |
| S3 | Bartender can void only within 30 min; admin any time in the open month; nobody in a closed month | `sales.test.ts` | `sale-void` |
| S4 | Voiding twice is a no-op | `sales.test.ts` | `sale-void` |
| S5 | Shift date: sale before 08:00 belongs to the previous date (DST-safe, Asia/Jerusalem) | `time.test.ts` | – |
| **Periods / reports** ||||
| P1 | Month closes on the last day at ≥ 08:00, or immediately if overdue; next key is computed correctly across year end | `time.test.ts` | – |
| P2 | Report income total = sum of active sales in the period; voided rows excluded | `report.test.ts` | `report-refresh` |
| P3 | Report expenses net = Σ EXPENSE − Σ CREDIT; blank type counts as EXPENSE | `report.test.ts` | – |
| P4 | Income rows group by resolved memberId (renamed member stays one row) | `report.test.ts` | – |
| **Expenses** ||||
| E1 | Amount 0 < x < ₪1,000,000, ≤ 2 decimals; date not more than 1 day in the future | `expenses.test.ts` | `expense-basic` |
| E2 | Expense dated before the open period is booked to the open period with a warning | `expenses.test.ts` | – |
| **Auth** ||||
| A1 | PINs are never stored or logged in plain text; comparison uses the salted hash | `auth.test.ts` | – |
| A2 | Unknown/revoked device → `DEVICE_REQUIRED`/`DEVICE_REVOKED`; bar PIN on admin action → `FORBIDDEN` | `auth.test.ts` | `auth` |
| A3 | 10 wrong PINs on one device lock that device for 10 minutes and nothing else | `auth.test.ts` | – |
| **Members (stage 2)** ||||
| ID1 | memberId is never reused or derived from a name | `members.test.ts` | – |
| ID2 | Sync never deletes: removed external members become inactive | `members.test.ts` | – |
| ID3 | No two active members share a displayName | `members.test.ts` | – |
| ID4 | Every key in `יומן מכירות` resolves to exactly one memberId after `members.mapLegacy` | `members.test.ts` | `members-map` |
| ID5 | Merge follows chains (A→B→C resolves to C) without cycles | `members.test.ts` | – |
| **Products (stage 4)** ||||
| PR1 | Price is integer agorot ≥ 0; 0 only for open-price items; names unique among active products | `products.test.ts` | – |
| PR2 | Products are never deleted, only deactivated | `products.test.ts` | – |
| **Text** ||||
| T1 | Text written to sheets is prefixed with `'` (no formula injection) and stripped of control chars | `text.test.ts` | – |

Stage 5+ invariants (ledger balance, atomic top-up+charge, REVERSAL rules, offline queue) are listed in ROADMAP §5 and get added when those stages start.
