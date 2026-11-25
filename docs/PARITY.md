# Feature parity – legacy → new

Every legacy capability, and the stage where it is kept / changed / replaced. Nothing disappears silently (ROADMAP §8).

Status: ✅ done · ⏳ planned · 🔁 changed · ❌ dropped (with reason)

| # | Legacy capability | Stage | New behavior | Status |
|---|---|---|---|---|
| 1 | PIN login, bar/admin roles | 1 | 🔁 Same PINs-and-roles model; PINs now salted hashes in Script Properties (set via `INITIAL_*` + `setup`), replaced on go-live day | ⏳ |
| 2 | Owner email = admin without PIN | 1 | Kept (web app access `ANYONE`, as legacy) | ⏳ |
| 3 | Member search (Hebrew-normalized, tokens, 40 hits) | 1 | Kept, same normalization | ⏳ |
| 4 | Refresh member list | 1 | Kept | ⏳ |
| 5 | Guest sale (free-text name, marked "לא ברשימה") | 1 → 2 | Kept; from stage 2 a guest becomes a `Members` row with `source=GUEST` | ⏳ |
| 6 | Sale: card type, qty 1–20, note, idempotent id | 1 | Kept; optimistic UI with pending/confirmed/failed | ⏳ |
| 7 | Tonight's stats (cards, ₪) and recent list (40) | 1 | Kept | ⏳ |
| 8 | Undo: bar ≤30 min, admin any time in open month, never closed month | 1 | Kept unchanged (status change on the legacy sheet). The ledger rules (REVERSAL, "no later action on member") come with the wallet in stage 5 | ⏳ |
| 9 | Expenses: add (desc, amount, date), void, list, total | 1 → 3 | Kept; plus **edit** and **refunds** (type הוצאה/זיכוי, total = net), added 2026-11-23 (D27) | ⏳ |
| 10 | Expense dated in closed month → booked to open month + warning | 1 | Kept | ⏳ |
| 11 | Shortages list: add / tick / edit / delete (soft) | 1 → 7 | Kept; plus an **amount to buy** per line (+/−, optional on manual lines), and automatic lines from inventory decreases (D29) | ⏳ |
| 12 | Monthly periods, auto close on last day 08:00, overdue close | 1 | Kept (server trigger) | ⏳ |
| 13 | Monthly report file (income/expenses/summary), draft refreshed daily | 1 → 3 → 5 | Kept; refunds appear in the expenses tab as negative "זיכוי:" lines, so its total and the summary are net (D27); stage 5 replaces card income with top-ups | ⏳ |
| 14 | Lock closed report, email with HTML + PDF to admin | 1 | Kept | ⏳ |
| 15 | Finance viewers on reports folder | 1 | Kept (`FINANCE_EMAILS` Script Property) | ⏳ |
| 16 | Weekly backup (Sun 04:00, 120 days) | 1 → 8 | Kept; daily in stage 8 | ⏳ |
| 17 | Spreadsheet menu (refresh report, backup, close month, setup) | 1 | Kept | ⏳ |
| 18 | `setup()` | 1 | 🔁 Kept and extended: also hashes one-time PINs, converts `MEMBERS_URL`, logs ✔/✘ per step | ⏳ |
| 19 | Card types sheet (name, price, active) | 1 → 5 | Kept until the wallet replaces cards (stage 5). Products catalog (stage 4) is separate | ⏳ |
| 20 | Members from external list, read-only, name-derived key | 2 | 🔁 App-owned `Members` with stable `memberId`; external list stays the membership source via admin-approved sync | ⏳ |
| 21 | Reading xlsx member files | 1 | Kept | ⏳ |
| 22 | Mobile-first UI, dark mode, RTL, paper style | 1 | Kept; plus tablet landscape layout and 48px targets | ⏳ |
| 23 | Refresh shift when app regains focus | 1 | Kept | ⏳ |
| 24 | Formula-injection protection (`'` prefix) | 1 | Kept | ⏳ |
| 25 | Global PIN lockout after 15 failures | 1 | Kept unchanged (D23) | ⏳ |
| 26 | – (new) Inventory: items with amounts, add / delete / change amount | 7 | New (D29): every decrease adds the same amount to the shortages list | ⏳ |
