# Releasing a change + tablet checklist

There is no staging copy (D26). Every change goes to the real app like this, while the bar is closed.

## How a release works
- The bar's link (`…/exec`) serves a **fixed deployed version**. Pushing code doesn't change it.
- The owner-only test link (Deploy → **Test deployments** → `…/dev`) always runs the **newest pushed code**, against the **real sheets**.
- The triggers (daily close at 08:00, Sunday backup) also run the newest pushed code. So never leave untested code pushed overnight.
- Rollback: Deploy → **Manage deployments** → ✏️ → pick the previous version → Deploy.

## A. Release steps (every time)
1. Spreadsheet menu `🍺 הסליק` → **גיבוי עכשיו**. A copy appears in the backups folder – that's the restore point.
2. Claude runs `npm run push` (only after you say so).
3. Open the `/dev` link and go through the checks below that touch what changed. Undo any test sale/expense right away (it stays in the sheet marked `בוטל`, which the report ignores).
4. If OK: Deploy → Manage deployments → ✏️ → Version: **New version** → Deploy. The `/exec` link stays the same.
5. If not OK: tell Claude; the bar link is still on the old version.

## First release of the new app only (stage 1, once)
Before step 2, in the Apps Script editor → ⚙️ **Project Settings → Script Properties**, add and **Save script properties**:
- `INITIAL_BAR_PIN` = the new bar PIN (4–10 digits)
- `INITIAL_ADMIN_PIN` = the new admin PIN (different)
- `MEMBERS_URL` = the members-list link (the value of `MEMBERS_SHEET_URL` in the current `Config.gs`)

After step 2, run **`setup`** in the editor. The log must show only ✔ lines, including `✔ קודים עודכנו: בר + מנהל` and `✔ רשימת חברים: נקראו N חברים`. The `INITIAL_…` properties are then gone (only hashes remain). Tell the bartenders the new bar PIN.

## B. Login
- [ ] As the owner account: straight in, with the **הוצאות** tab (admin without PIN).
- [ ] Signed in with another Google account: PIN screen. Wrong PIN → "קוד שגוי". Bar PIN → no הוצאות tab. Admin PIN → הוצאות tab.
- [ ] Reload keeps you logged in.

## C. Sales
- [ ] Search 2+ letters of a member's name finds them; ↻ refreshes the list.
- [ ] Sale: member → card type → qty → confirm. Toast ✓, stats and recent list update; row in `יומן מכירות`, row in `Audit`.
- [ ] Double-tap confirm quickly → only **one** row.
- [ ] Guest sale ("לא ברשימה?") → tag "לא ברשימה".
- [ ] Undo (ביטול → בטוח?) → struck through, stats go down, status `בוטל`.

## D. Shortages (חוסרים)
- [ ] Add, tick, untick, edit (✎), delete. Sheet `חוסרים` matches.

## E. Expenses (admin)
- [ ] Add (today) → list and total update. Dated in a closed month → warning, booked to the current month.
- [ ] Void (two taps).
- [ ] "↻ עדכון הדוח עכשיו" → toast; "📊 פתיחת הדוח" opens the month's report.

## F. Tablet layout
- [ ] Landscape: search on one side, recent sales on the other; sale sheet centered.
- [ ] Buttons easy to hit (≥48px). Dark mode readable. Returning to the app refreshes tonight's stats.

## G. Server jobs (menu `🍺 הסליק`)
- [ ] "רענון הדוח של החודש הנוכחי" → toast.
- [ ] The month close is checked at the end of the month by the trigger – compare that report with the previous month's format.

## Stage 6 (later)
- With the USB NFC reader connected, Android hides the on-screen keyboard. Turn on **"Use on-screen keyboard"** (Settings → System → Keyboard / Languages & input → Physical keyboard).
