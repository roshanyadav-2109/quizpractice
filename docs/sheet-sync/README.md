# Users sheet

One Google Sheet (a file of its own — never the purchases sheet) holding every account of
Quiz Space, the main site, the ERP portal and the OPPE practice site: a tab per site
(`erp data`, `main data`, `quizspace data`, `oppe data`) and `all unique`, one row per email
with Yes/No for each site, whether it is in the announcement Google Groups, and which.

## How it stays current
- **Live.** Each database has triggers (`*-realtime.sql`) that post a person to the sheet's Apps Script
  web app (`doPost` in `Code.gs.template`) on sign-up, login and profile change — about a second.
  The web app's address and secret are in each database's private `sheet_hook` table, not in git.
  The main site also posts group changes (`promotional_group_members`).
- **Nightly.** `syncAll` (Apps Script trigger, ~3 am IST) rebuilds every tab from the databases through
  `sheet_export` (`*-export.sql`), a read-only function locked by a secret token (its SHA-256 is in
  `sheet_export_key`). This repairs anything a webhook missed.
- **ERP is pushed, not pulled**: its project can be over Supabase's egress quota, which blocks the REST
  API. `sheet_push_snapshot()` (pg_cron, 21:20 UTC) posts its accounts in batches of 250.
- If the sheet is busy, an event is held in the hidden `_queue` tab and applied by the next call.

## Secrets (never in git)
Script Properties in the sheet's Apps Script: `SECRET` (the webhook's), and for each pulled site
`<site>_URL`, `<site>_KEY` (its public anon key) and `<site>_TOKEN` (the export token). Rotate a token by
inserting a new hash into `sheet_export_key` and deleting the old row; rotate the webhook secret by
updating `sheet_hook` in all four databases and the `SECRET` property.

## Set-up, in order
1. Apply each `<site>-export.sql`, then insert `sha256(token)` into `sheet_export_key`.
2. Apply each `<site>-realtime.sql` (harmless until `sheet_hook` has a row).
3. New spreadsheet → Extensions → Apps Script → paste `Code.gs.template` with `__SECRETS__` replaced by the
   property map → run `setupSecrets` once, delete it → Deploy as a web app (execute as me, access: anyone).
4. Insert the web app URL and `SECRET` into `sheet_hook` in each database; on ERP also
   `cron.schedule('sheet-push-snapshot', '20 21 * * *', 'select public.sheet_push_snapshot()')`.
5. Menu **Users sync → Sync everything now**, then **Install nightly sync**.

The sheet holds names, emails and phone numbers: share it narrowly, view-only.
