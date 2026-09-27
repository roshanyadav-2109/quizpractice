# YouTube: owner runbook

How explanation videos get from a teacher's recording onto the Unknown IITians
channel and into the site, and everything the owner has to set up for it.
Nothing here costs money.

There are two ways a video gets there:

| | v1: upload by hand (only until the audit passes) | v2: one-click upload (after Google's audit) |
|---|---|---|
| Teacher | Records in the studio, downloads the file, uploads it in YouTube Studio as **Unlisted**, pastes the link | Records, fills in title / description / visibility, ticks the YouTube terms, presses Upload |
| Site checks | The link: right channel, not Private, embedding allowed | The same, on the uploaded video |
| Needs | Nothing. `YOUTUBE_CHANNEL_ID` + `YOUTUBE_API_KEY` make the check stricter | The Cloud project below, a connected channel, `YOUTUBE_API_UPLOADS=on` |
| Approval | None | Google's YouTube API audit. Until it passes, every upload through the API is locked **Private** for good |

---

## 1. Day one: the manual path (v1)

It works with no YouTube settings at all. The site then checks a pasted link
with YouTube's public embed endpoint (oEmbed): the video exists and can be
embedded, so Private or embedding-off videos are refused. It **cannot** tell
which channel the video is on, and the teacher sees *"The site could not
confirm this video is on the Unknown IITians channel."*

To refuse videos from other channels, set both of these (section 3):

- `YOUTUBE_CHANNEL_ID`: the channel's `UC…` id.
- `YOUTUBE_API_KEY`: an API key restricted to YouTube Data API v3. Each check costs 1 of the 10,000 free daily units.

A connected channel (section 4) also works in place of the key.

### Giving teachers access to the channel

In YouTube Studio → Settings → Permissions, invite each teacher as
**Editor (limited)**. That role can upload and set visibility but cannot delete
the channel or its published videos.

**Brand Account caveat.** YouTube Help ([answer 9481328](https://support.google.com/youtube/answer/9481328))
says channel permissions are not available for a channel that is still a
Brand Account until it is moved over. If Settings → Permissions offers
**Move permissions**, do that first (the Brand Account's managers become
channel users). Until then the choices are:

- add the teacher as a **Manager** of the Brand Account (myaccount.google.com/brandaccounts). This gives more power than Editor (limited), so only for teachers you fully trust; or
- have the teacher send you the downloaded file, and upload it yourself.

The teacher-facing steps (Unlisted, "No, it's not made for kids", Allow
embedding, copy the link) are on `/teach/help`.

---

## 2. The Google Cloud project

Use a **separate** Cloud project for YouTube, not the one that holds the Google
sign-in client. The audit, the quota and the consent screen all belong to the
project, and the sign-in client should not be caught up in any of them.

1. [console.cloud.google.com](https://console.cloud.google.com) → New project → name it **quizpractice-youtube**. Note its **project number** (Dashboard): the audit form asks for it.
2. APIs & Services → Library → **YouTube Data API v3** → Enable.
3. Google Auth Platform → **Branding**: app name `QuizPractice`, your support email, home page `https://<your site>`, privacy policy `https://<your site>/privacy`, terms `https://<your site>/terms`, and your domain under Authorised domains.
4. Google Auth Platform → **Audience**: user type External. Set the publishing status to **In production**. In Testing, Google's refresh tokens expire after 7 days and the connection silently dies once a week.
5. Google Auth Platform → **Data Access** → Add or remove scopes → add
   - `https://www.googleapis.com/auth/youtube.upload`
   - `https://www.googleapis.com/auth/youtube.readonly`
6. Google Auth Platform → **Clients** → Create client → **Web application**. Authorised redirect URIs:
   - `https://<your site>/api/youtube/callback` (exactly `NEXT_PUBLIC_SITE_URL` + `/api/youtube/callback`)
   - `http://localhost:3000/api/youtube/callback` for local testing
   Copy the client id and secret.
7. APIs & Services → Credentials → Create credentials → **API key** → Edit → API restrictions → Restrict key → *YouTube Data API v3* only.

Google app verification is not needed: only you sign in to this client, and
personal-use apps under 100 users are exempt. Google shows "Google hasn't
verified this app" on the consent screen; choose Advanced → Go to QuizPractice.

---

## 3. Environment variables

Set these on Vercel (Project → Settings → Environment Variables, Production)
and in `.env.local` for local work, then redeploy. **None of them may have a
`NEXT_PUBLIC_` prefix**; the repo is public and the client secret and token key
must never reach a browser.

| Variable | Value | Needed for |
|---|---|---|
| `YOUTUBE_OAUTH_CLIENT_ID` | Client id from step 6 | Connecting the channel (v2) |
| `YOUTUBE_OAUTH_CLIENT_SECRET` | Client secret from step 6 | Connecting the channel (v2) |
| `YOUTUBE_TOKEN_KEY` | 32 random bytes, base64 (below) | Connecting the channel (v2) |
| `YOUTUBE_API_KEY` | API key from step 7 | Optional: checking links without a connection |
| `YOUTUBE_CHANNEL_ID` | The `UC…` id: YouTube Studio → Settings → Channel → Advanced settings | Refusing other channels' videos; only this channel can be connected |
| `YOUTUBE_API_UPLOADS` | `on`, **only after the audit passes** | The one-click upload |
| `CRON_SECRET` | Any random string of 16+ characters (below) | Optional: only Vercel may run the daily permission check (section 4) |
| `NEXT_PUBLIC_CONTACT_EMAIL` | Your contact address (this one is public by design) | `/privacy` and `/terms`; the audit checks for it |

Generate the token key once:

```
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

It encrypts the stored refresh token (AES-256-GCM). Keep it only in Vercel and
`.env.local`. Changing it makes the stored token unreadable: connect the
channel again afterwards.

And, if you set it, the cron secret:

```
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

---

## 4. Connecting the channel

Do this on the site's main address (`NEXT_PUBLIC_SITE_URL`), signed in as an admin.

1. Admin → Educators → YouTube → **Connect channel**.
2. Pick the Google account that owns or manages Unknown IITians. YouTube then asks which channel: pick **Unknown IITians** (the Brand channel), not the personal one.
3. Leave both permissions ticked and allow.
4. Back on Admin → Educators, the panel shows the channel's title and id.

What the site keeps: the channel id, the refresh token encrypted with
`YOUTUBE_TOKEN_KEY`, and the granted scopes, in `youtube_connection`, a table
only the server's service key can read. The channel's title is read from
YouTube when the panel is shown and never stored.

If it goes wrong, the panel says why. The usual ones:

| Message | Fix |
|---|---|
| *did not hand over a lasting permission* | Remove QuizPractice at myaccount.google.com/permissions for that account, then connect again. Google only issues a refresh token on a first consent. |
| *not the Unknown IITians channel* | `YOUTUBE_CHANNEL_ID` is set and another channel was picked. Connect again and pick the right one. |
| *Both permissions are needed* | A box was unticked on Google's screen. Connect again. |
| *took too long or came back to a different address* | Start from the main site address and finish within 10 minutes. |
| *NEXT_PUBLIC_SITE_URL is not the address this site is served from* | The main address redirects elsewhere (www ↔ bare domain, say). Set `NEXT_PUBLIC_SITE_URL` to the address the site really ends up on, match the redirect URI on the OAuth client, and redeploy. |
| *Google refused the saved permission* | The permission was withdrawn, or the project is still in Testing. Check step 2.4, then connect again. |

**Disconnecting.** Admin → Educators → Disconnect withdraws the permission at
Google and deletes the stored row. If you ever withdraw it on Google's
[permissions page](https://security.google.com/settings/security/permissions)
instead, the site notices by itself and deletes the stored token and channel
id, as `/privacy` promises and YouTube's policies (III.E.4.b) require within
30 days.

**The daily check.** `vercel.json` schedules `GET /api/youtube/check` once a
day (Vercel Cron is free on Hobby; one run a day is its limit). It asks Google
for a fresh access token, which costs no YouTube quota. If Google refuses, the
token and channel id are cleared and Admin → Educators shows why. A permission
that already worked in the last 20 hours is not checked again, and with no
channel connected the check does nothing. Set `CRON_SECRET` so that only Vercel
can run it; the runs show under Project → Settings → Cron Jobs → View Logs.

---

## 5. Google's audit (for v2)

> **Checked 2026-09-27:** the Cloud project in use (1052266253506) is *not*
> locked. A test upload through the connected channel asked for Unlisted and
> stayed Unlisted after processing, embeddable. So `YOUTUBE_API_UPLOADS=on`
> went live without the audit. If Google ever starts locking uploads Private,
> the steps below still apply.

Google checks the Cloud project that sends the upload, not the channel. Until
**quizpractice-youtube** passes the YouTube API Services audit, every video it
uploads is locked Private: it cannot be made Unlisted, cannot be appealed, and
has to be uploaded again. Google publishes no timeline; 2–4 weeks is typical.

1. Make sure `/privacy` and `/terms` are live, linked in the footer, and `NEXT_PUBLIC_CONTACT_EMAIL` is set.
2. Create a **reviewer account**: a throwaway Google account. Sign in with it on the site, then make it a teacher in Admin → Educators and give it one branch + subject combo. Share its password **only** inside the audit form.
3. Record the upload screen for the form on a dev or preview deployment with the channel connected and `YOUTUBE_API_UPLOADS=on`: the title and description fields, the Public / Unlisted / Private choice, the YouTube Terms checkbox, the progress bar. Videos uploaded now are locked Private: delete them in Studio afterwards, then turn the flag off again.
4. Fill in [the audit form](https://support.google.com/youtube/contact/yt_api_form): the project number, the site URL, the privacy and terms URLs, the reviewer login, what the app does ("teachers of an exam-practice site upload whiteboard explanations of past-paper questions to the site's own channel, which the site embeds next to the question"), and the screenshots or screencast.
5. When approved, set `YOUTUBE_API_UPLOADS=on` for Production and redeploy. Teachers now see Upload to YouTube in the studio.
6. Demote or delete the reviewer account.

---

## 6. Limits

- **Quota.** 10,000 units a day for reads (a link check is 1 unit) and, since June 2026, a separate bucket of 100 uploads a day. The site stops at **90 uploads a day** and **20 per teacher per 24 hours**.
- **Unpublished cap.** YouTube has been reported to answer 429 to uploads beyond an unpublished per-channel daily limit. The site shows teachers *"YouTube is not taking more uploads from the site today"* and tells them to try again later: the take stays in their browser for 7 days.
- **Length.** Videos longer than 15 minutes need the channel to be phone-verified (YouTube Studio → Settings → Channel → Feature eligibility). The recorder stops at 20 minutes.
- **Hosting transfer.** A recording normally goes from the browser straight to YouTube and costs the site nothing. If the browser cannot do that, it goes through the site in 4 MiB parts, which counts about twice the file size against Vercel's free transfer. The studio says which route it used.

## 7. How the upload works

Nothing is uploaded when a recording stops. The teacher watches the take
back, checks the title, description and visibility (Unlisted by default),
ticks YouTube's terms and presses **Upload to YouTube**. With v2 on, the
studio and `/teach/help` no longer offer the by-hand steps at all.

1. The studio asks `POST /api/teach/uploads`. The server checks the teacher is assigned the question's subject and under the limits, then opens a resumable session at YouTube with the channel's token, sending the site's `Origin` so YouTube allows the browser to talk to that session. It returns only the session address, which is good for this one file.
2. The browser PUTs 8 MiB chunks straight to the session address.
3. If the first chunk is blocked (CORS, network, or a refusal), it switches for good to `PUT /api/teach/uploads/<id>`, which forwards 4 MiB chunks.
4. After a dropped connection or a reload, `GET /api/teach/uploads/<id>` asks YouTube how far it got and the upload carries on from there. Sessions last about a week.
5. `POST /api/teach/uploads/<id>/complete` confirms the video is on the connected channel and attaches `https://youtu.be/<id>` to the teacher's explanation. A Private video is not attached.

Every step is recorded in `video_uploads`. Its session address column is
readable only by the server and is cleared when the upload finishes.

---

## 8. Device and API checks still to run

These could not be run while the feature was built: there was no connected
channel and no real browsers or devices. Run them once, on a dev deployment
with the channel connected and the flag on, and fill in the results.

| Check | How | Result |
|---|---|---|
| The direct browser PUT to the session address passes CORS | Upload a ~3 MB test from Chrome, Firefox and Safari; the studio reports the route (direct or proxy) | not yet run |
| A 308's `Range` header is readable from the browser | Same upload, 20 MB or more (several chunks); if unreadable the client asks the server after each chunk, which still works | not yet run |
| Resume after a dropped connection | Turn the network off mid-upload, back on: it carries on | not yet run |
| Resume after a reload | Reload mid-upload, reopen the studio, choose resume | not yet run |
| The session answers with the video id once finished | `/complete` works without the browser having read the final answer | not yet run |
| A key-only `videos.list` sees an Unlisted video | Paste an Unlisted video's link with only `YOUTUBE_API_KEY` set | not yet run |
| Test videos deleted | Delete every test upload in YouTube Studio | not yet run |

If the direct route fails everywhere, uploads still work through the proxy;
only the hosting-transfer cost changes.
