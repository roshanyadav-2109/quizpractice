# Hosting on the VPS (from 3 Oct 2026)

Quiz Space moved off Vercel on 3 Oct 2026, when Vercel blocked the "UI Premium" team (Hobby plan, fair-use limit
on server CPU time: `FAIR_USE_LIMITS_EXCEEDED`, `fluidCpuDuration`), which answered every request with
`402 DEPLOYMENT_DISABLED`. The Vercel project (`quizdesk`) still exists but is not used.

**Address:** `https://quizspace.unknowniitians.com`. DNS: an `A` record `quizspace` -> `62.72.29.5` (TTL 300) at
Hostinger. It was a CNAME to Vercel. A backup of the whole zone from before the change is kept by the owner
(`dns-backup-unknowniitians.com-20261003-1743.json`). `www` and `ssp` are still on Vercel and were not touched.

## The server
Hostinger VPS `srv2029582` (Ubuntu 26.04, 2 vCPU, 7.7 GB, Mumbai area), shared with **another project** (a news site,
user `app`, PM2, port 3000). Everything here is separate from it:

| | Quiz Space | the other project |
|---|---|---|
| Linux user | `quiz` | `app` |
| Folder | `/srv/quizspace` | `/srv/tid` |
| Port (localhost only) | 3100 | 3000 |
| Service | systemd `quizspace` (capped at 1.5 CPU, 2.8 GB, lower priority) | PM2 |
| Caddy | `/etc/caddy/quizspace.caddy`, pulled in by one `import` line | its own blocks in `/etc/caddy/Caddyfile` |
| Node | the system `/usr/bin/node` (read only; nothing installed) | same |

Caddy (already on the server) terminates HTTPS (Let's Encrypt, automatic) and passes the visitor's address as `X-Real-IP`,
which the app's limits, blocks and activity record read. Never put another proxy in front without passing it on.

## Settings
`/srv/quizspace/shared/.env.local` (owner `quiz`, mode 600). Present: Supabase URL, anon key and service key, the public
settings, `CRON_SECRET` and `REVALIDATE_SECRET` (new values), `VERCEL_ENV=production` (the code reads it to decide
indexing and the redirect to the main domain).
**Not present** (Vercel kept them write-only, so they could not be copied): `CLOUDINARY_API_KEY/SECRET`,
`CLOUDINARY_SHEETS_API_KEY/SECRET`, `YOUTUBE_API_KEY`, `YOUTUBE_OAUTH_CLIENT_SECRET`, `YOUTUBE_TOKEN_KEY`,
`CASHFREE_SECRET_KEY`, `ANTHROPIC_API_KEY`. Without them: image uploads, YouTube recording upload, the payment test and
the extraction scripts are off; reading, practising, sign-in and the admin dashboard work. Add them to the file and
`systemctl restart quizspace`. `YOUTUBE_TOKEN_KEY` must be the original value or the channel has to be connected again.

## Deploy, roll back
```
deploy/vps/deploy.sh             # builds the pushed HEAD beside the live one (1 CPU, 3 GB cap), switches, checks, rolls back by itself
deploy/vps/deploy.sh rollback    # back to the previous release
```
Needs the SSH key `~/.ssh/quizspace_vps` (root login by key only). Logs: `journalctl -u quizspace`, Caddy: `journalctl -u caddy`.

## Daily jobs
`/etc/cron.d/quizspace` runs the four jobs that were Vercel crons, through `/srv/quizspace/cron.sh` (uses `CRON_SECRET`),
logging to `/srv/quizspace/logs/cron.log`.

## The firewall rules (rebuilt from the Vercel ones, 3 Oct 2026)
fail2ban reads Caddy's access log for this site (`/var/lib/caddy/logs/quizspace.access.log`, static files left out) and
blocks an address on ports 80 and 443 of the whole server (the other site included; only offenders; SSH untouched):

| Rule | Limit | Blocked for | Files |
|---|---|---|---|
| The hidden trap link `/all-questions` | 1 request | 1 hour | `deploy/vps/fail2ban/*/quizspace-trap*` |
| `/api/solutions`, `/api/attempts`, `/api/reviews` | 120 a minute per address | 5 minutes | `quizspace-api` |
| `/practice/...`, `/paper/...` | 240 a minute per address | 5 minutes | `quizspace-papers` |

Tested end to end on 3 Oct: touching the trap blocked the tester within seconds; 119 requests did not block, 144 did.
List blocked addresses: `fail2ban-client status quizspace-trap`; unblock: `fail2ban-client set quizspace-trap unbanip <ip>`.
Caddy also refuses `122.176.158.89` outright, and the app's own account, address and device blocks work as before.
Gotcha: never run `caddy validate` as root (it creates the log file root-owned and the real Caddy then cannot open it):
use `sudo -u caddy caddy validate ...`.

Headers: Caddy sends HSTS, `nosniff` and a referrer policy (Vercel used to add HSTS itself).

## Backups
`/usr/local/sbin/quizspace-backup` (cron, 02:30 UTC) keeps 14 nightly copies of the settings file and the Caddy, service,
cron and fail2ban files in `/srv/quizspace/backups` (root only). `deploy/vps/pull-backup.sh` copies the newest to
`~/.quizspace-vps-backups` on the owner's Mac. The code is on GitHub and the data in Supabase.

## Not replaced
- Vercel's automatic DDoS and bot filtering and its CDN. Cloudflare in front would give them; it needs the domain's
  nameservers moved (all 19 DNS records, including the mail ones, recreated exactly), so it was left out.
- Capacity: public pages that are cached answer in about 25 ms (150+ requests/s); pages that render on every request
  (`/subjects`, `/search`, ...) cost about 90 ms of CPU each (about 11 a second on one core). `/subjects` is
  `force-dynamic` although it is the same for everyone: caching it would remove most of the load.

## Cloudflare in front (from 2026-10-03)

- The nameservers of `unknowniitians.com` are Cloudflare's (`kay` and `ridge`). Only `quizspace` is **Proxied**; the main site, `www`, `ssp` and every mail record are **DNS only**. Every record was compared with the Hostinger backup (`~/Downloads/dns-backup-unknowniitians.com-*.json`) before the switch.
- SSL mode Full (strict); minimum TLS 1.2; Bot Fight Mode on; one rate-limit rule (more than 100 non-static requests in 10 s from one address: blocked for 10 s).
- Caddy (`quizspace.caddy`) believes `Cf-Connecting-Ip` only when the connection comes from a Cloudflare address (the list in the file; refresh it from https://www.cloudflare.com/ips now and then). Everything else (the app's `X-Real-IP`, the log field `client`, the `@scraper` block) uses the visitor's address.
- fail2ban matches the log field `client`. Each ban also blocks the address at Cloudflare through `/usr/local/sbin/quizspace-cf-ban` (`deploy/vps/cf-ban.sh`, action `quizspace-cf`), because the server firewall alone cannot stop proxied visitors. The token for it (Account Firewall Access Rules: Write, nothing else) is in `/etc/quizspace-cf.env`, root only. An account-level rule applies to every proxied site in that Cloudflare account.
- Test: `curl` the trap path through Cloudflare, expect 403 within seconds; lift with `fail2ban-client set quizspace-trap unbanip <ip>` (the unban also lifts the Cloudflare block).
- Origin lock (2026-10-03): the quizspace host answers 403 to any connection that is not from Cloudflare, `127.0.0.1` or the server itself (`@bypass` in `quizspace.caddy`); other sites on the server are not touched. To open it again, remove the `@bypass` and its `respond` line and reload Caddy (`sudo -u caddy caddy validate` first). Before the lock, the old Hostinger zone's `quizspace` record was pointed at Cloudflare's addresses so resolvers still asking the old nameservers went through Cloudflare; direct traffic fell to zero before the lock went on.
- Certificate renewal runs inside Caddy and is not affected by the lock; check `journalctl -u caddy` if a certificate warning ever appears.
- The Cashfree webhook (`/api/payments/webhook`) may be challenged by Bot Fight Mode once real payments exist.
