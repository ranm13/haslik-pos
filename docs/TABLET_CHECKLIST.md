# Tablet checklist – stage 1 (on staging)

Run on the bar tablet (Chrome on Android), against the **staging** URL. The header shows a red **STAGING** stamp; if it doesn't, stop – you're on production.
Use only the fictitious members (ישראל ישראלי, דנה כהן, …).

## A. One-time staging setup (in the dedicated account, ~5 min)
1. Open the staging spreadsheet → **Extensions → Apps Script**.
2. ⚙️ **Project Settings → Script Properties → Add**:
   - `ENV` = `staging`
   - `INITIAL_BAR_PIN` = a 4–10 digit test PIN
   - `INITIAL_ADMIN_PIN` = a different 4–10 digit test PIN
3. Back in the editor, pick the function **`seedStaging`** → **Run** → approve the permissions (Advanced → Go to …).
   The log must end with ✔ lines only, including `✔ קודים עודכנו: בר + מנהל` and `✔ רשימת חברים: נקראו 20 חברים`.
   Check Script Properties again: `INITIAL_BAR_PIN` / `INITIAL_ADMIN_PIN` are gone, `BAR_PIN_HASH` / `ADMIN_PIN_HASH` exist.
4. **Deploy → New deployment** → Web app → Execute as **Me** → Who has access **Anyone with a Google account** → Deploy. Copy the URL.

## B. Login
- [ ] Opening the URL as the owner account goes straight in, with the **הוצאות** tab (admin without PIN).
- [ ] On a device signed in with another Google account: PIN screen appears.
- [ ] Wrong PIN → "קוד שגוי". Bar PIN → no הוצאות tab. Admin PIN → הוצאות tab.
- [ ] Reloading the page keeps you logged in (PIN remembered on the device).

## C. Sales
- [ ] Search "ישר" finds ישראל ישראלי; one-letter search shows the hint.
- [ ] ↻ refreshes the members list ("הרשימה עודכנה (20)").
- [ ] Sale: pick member → choose card type → qty 3 → note → confirm. Toast ✓, stats go up, row appears in recent.
- [ ] Row appears in `יומן מכירות` with the right price/total, and one row in `Audit`.
- [ ] Double-tap confirm quickly → only **one** row in the sheet.
- [ ] Guest sale ("לא ברשימה?") → recent row shows the tag "לא ברשימה".
- [ ] Undo (tap ביטול, then בטוח?) → row struck through, stats go down, status `בוטל` in the sheet.
- [ ] With the bar PIN, a sale older than 30 min has no ביטול button.

## D. Shortages (חוסרים)
- [ ] Add, tick as bought, untick, edit (✎), delete (two taps). Sheet `חוסרים` matches.

## E. Expenses (admin)
- [ ] Add an expense with today's date → appears in the list, total updates.
- [ ] Add an expense dated in a previous month → warning that it was booked to the current month.
- [ ] Void an expense (two taps).
- [ ] "↻ עדכון הדוח עכשיו" → toast; "📊 פתיחת הדוח" opens the month's report with the sale and expense.

## F. Tablet layout
- [ ] Landscape: search on one side, recent sales on the other; the sale sheet opens centered.
- [ ] Every button is easy to hit with a finger (≥48px).
- [ ] Dark mode (Android dark theme) is readable.
- [ ] Switching to another app and back refreshes tonight's stats.

## G. Server jobs (spreadsheet menu `🍺 הסליק`)
- [ ] "רענון הדוח של החודש הנוכחי" → toast.
- [ ] "גיבוי עכשיו" → a copy appears in the `(STAGING)` backups folder.
- [ ] "סגירת החודש עכשיו (ידני)…" → report locked, mail arrives with subject prefix `[STAGING]`, a new month opens.

## Stage 6 additions (later)
- With the USB NFC reader connected, Android hides the on-screen keyboard. Turn on **"Use on-screen keyboard"** (Settings → System → Keyboard / Languages & input → Physical keyboard).
