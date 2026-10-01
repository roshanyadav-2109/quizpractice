# Copy protection (scraper defence)

Built 2026-10-01/02 after five linked accounts opened 466 papers (11,547 questions) in a day.
Switchboard: **/admin/protection** (admins only). Migrations 0042 to 0044; code in `src/lib/access.ts`,
`src/lib/protection.ts`, `src/app/admin/protection/`.

## Rules and their starting mode

| Rule | What it does | Mode |
|---|---|---|
| caps | 100 new papers a day, 30 an hour, per account | enforce |
| pace | wait 8 s / 20 s / 45 s between new papers after the first 10 of the day | **watch** |
| search_limit | 60 searches an hour, 300 a day | enforce |
| machine_pace, no_use, bot_agent, subject_spread | signals scored after every paper opened | enforce |
| no_receipts | papers opened but never read (page leaves a receipt) | **watch** |
| auto_ban | ban on a combination of the signals | enforce |
| linked | ban an account on the same browser and address as a banned one | **watch** |
| device_block | block the banned account's browser id (d:) for good | enforce |
| ip_block | block its addresses for 24 hours, restarting when seen again; sign-in and paper opens only | enforce |
| lockdown | manual: caps drop to 10 a day and 5 an hour for everyone | off |

`off` does nothing, `watch` logs "would have ..." and changes nothing, `enforce` acts.

## Undoing
- A ban: Admin > Protection > Blocked & banned > Undo ban (releases the account, its browser and its addresses).
- A rule: Rules > Undo its bans (every ban that rule made) and set it to Off or Watch.
- An address or browser: Release. Every decision is a row in `risk_events`.

## Notes
- Only the browser's own random id (`d:`) is blocked. The trait hash (`f:`) is shared by students with the same
  phone, so it only links accounts.
- Reading receipts only count once pages have started sending them.
- The Vercel plan allows 3 firewall rules (trap, two rate limits) plus IP entries; bot agents are caught in the app.
- The device beacon collects screen, time zone, graphics and language traits: state it in the Privacy Policy.
- The `no e-mail` rule: nothing in this system sends mail. Alerts are the Live events tab.
