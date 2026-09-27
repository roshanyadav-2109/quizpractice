# Hosting

The site runs on Vercel, in the **ui-premium** team, project **quizdesk**,
served at **`https://quizspace.unknowniitians.com`** (custom domain, 27 Sept 2026;
DNS is a CNAME to Vercel). `quizpractice-chi.vercel.app` is the project's
Vercel address; in production every other host is redirected permanently to
the custom domain (`next.config.ts`), and preview deployments answer with
`X-Robots-Tag: noindex`, so only the custom domain is ever indexed.
The project is linked to this repository: every push to `main` deploys to
production.

An earlier Vercel project (`quizpractice`, on the previous account) is paused
and unlinked from the repository. Nothing deploys there; do not unpause it.

## Environment variables

Set in Vercel → quizdesk → Settings → Environment Variables, for Production
and Preview. Values live only there and in `.env.local`; see `.env.example`
for what each one is.

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase project |
| `NEXT_PUBLIC_SITE_URL` | `https://quizspace.unknowniitians.com` |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Google sign-in client (its secret lives in Supabase Auth → Google, not here) |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_UPLOAD_FOLDER` | Main image account |
| `CLOUDINARY_SHEETS_CLOUD_NAME`, `CLOUDINARY_SHEETS_API_KEY`, `CLOUDINARY_SHEETS_API_SECRET` | Second image account |
| `NEXT_PUBLIC_CLOUDINARY_TRANSFORMS` | `off`: images are served as uploaded |
| `REVALIDATE_SECRET` | Guards `/api/revalidate` (`npm run cache:refresh`) |
| `YOUTUBE_OAUTH_CLIENT_ID`, `YOUTUBE_OAUTH_CLIENT_SECRET`, `YOUTUBE_TOKEN_KEY`, `YOUTUBE_API_KEY`, `YOUTUBE_CHANNEL_ID`, `YOUTUBE_API_UPLOADS`, `CRON_SECRET` | See `docs/youtube.md`. Changing `YOUTUBE_TOKEN_KEY` means connecting the channel again. |
| `NEXT_PUBLIC_CONTACT_EMAIL` | `desk@unknowniitians.com`: general contact, in the footer and on `/privacy`, `/terms`, `/about` |
| `NEXT_PUBLIC_LEGAL_EMAIL` | `legal@hq.unknowniitians.com`: privacy, data and deletion requests, takedowns, legal notices |
| `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`, `NEXT_PUBLIC_BING_SITE_VERIFICATION` | Optional; Search Console and Bing ownership by meta tag. See `docs/seo.md` |
| `ANTHROPIC_API_KEY` | Only for the admin's question-extraction scripts |

A `NEXT_PUBLIC_` variable is baked in at build time: after changing one,
redeploy.

## Changing the domain

Done once for `quizspace.unknowniitians.com`; repeat for any new one.

1. Add the domain to the quizdesk project (Settings → Domains).
2. Set `NEXT_PUBLIC_SITE_URL` to it and redeploy. Canonical links, the sitemaps
   and the redirect of every other host all follow it.
3. Supabase → Authentication → URL Configuration: the site URL and the redirect allow-list.
4. Google Cloud: add the domain to the sign-in client's Authorised JavaScript origins, and to the YouTube client's origins and redirect URI (`/api/youtube/callback`).
