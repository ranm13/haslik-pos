# Moving the app to the dedicated Google account

**Goal:** copy the data and the app to the dedicated account **without changing anything in the private account**.
**Time:** about 10–15 minutes.
**When:** while the bar is closed. Not during a shift, and not on the last day of the month around 08:00 (the month close runs then).

Marks: 🅿️ = in the private account · 🅳 = in the dedicated account

---

## Part A – Preparation (can be done in advance)

1. 🅿️ **Share the spreadsheet:** open the system spreadsheet → Share → add the dedicated account as **Viewer**. Untick "Notify people".
2. **Members list:** ask the owner of the external members-list file to share it with the dedicated account as **Viewer**. **Without this, `setup` fails at step 5/7** – it's a prerequisite.

## Part B – The move

3. 🅳 Log in to the dedicated account → Drive → "Shared with me" → open the system spreadsheet → **File → Make a copy**. Name: `הסליק – מערכת` (this is the permanent file from now on). The copy includes the Apps Script code.
4. 🅳 In the copy: **Extensions → Apps Script** → ⚙️ **Project Settings** → **Script Properties**. If any of `MASTER_ID`, `REPORTS_FOLDER_ID`, `BACKUP_FOLDER_ID` exist – **delete them**. Otherwise they may still point at files in the private account.
5. 🅳 In `Config.gs`: change `ADMIN_EMAIL` to the dedicated account's address. Save. (To also get the monthly report in your private inbox, set up mail forwarding in the dedicated account's Gmail.)
6. 🅳 Select the function **`setup`** → **Run**. Google asks for permissions – approve (if you see "Google hasn't verified this app": → Advanced → Go to …). The log must show all 7 steps, including:
   - `5/7 נקראו N חברים` – the members list was read.
   - `6/7 משימות מתוזמנות נוצרו` – the triggers were created.
7. 🅳 **Deploy the app:** in the editor → **Deploy → New deployment** → type: **Web app** → Execute as: **Me** → Who has access: **Anyone** → Deploy. Copy the new URL.
8. 🅳 Open the new URL on the bar phone/tablet, enter the PIN, and make **one test sale + undo it**. Check that the row appeared in the **copy** and not in the original.
9. Replace the link/bookmark on the bar devices with the new URL.

## Part C – Stop the old app (without touching its data)

10. 🅿️ In the original Apps Script project → **Triggers** (clock icon) → delete `dailyJob` and `backupJob`. This only prevents a double monthly report; data and code stay as they are.
11. 🅿️ Nothing else needs to be deleted or changed. The old URL keeps working as a fallback – **but don't record anything there anymore**, or the data will split.
12. 🅿️ (Optional, after a month of normal operation) remove the dedicated account's access to the original.

If something goes wrong at any step before step 9: delete the copy and start again from step 3. The original was never touched.

---

## What does not move, and why that's fine

| Item | State |
|---|---|
| Old monthly reports | Stay in the private account. The links in `תקופות` keep working for everyone they were shared with. New reports are created in the dedicated account. Optional: download the reports folder once as a zip for an archive |
| Old weekly backups | Stay in the private account. New backups are created in the dedicated account from next Sunday |
| Wrong-PIN attempts (cache) | Reset; not important |
| PINs | Same as the old ones for now. Replaced when moving to the new app (stage 1 in `docs/ROADMAP.md`) |

> Completed 2026-11-20. The optional `Migrate.gs` helper was removed; it is in git history (commit `99aeed2`) if the old reports ever need copying.
