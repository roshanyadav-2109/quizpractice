// Clears the site's cached content after a script has changed the database.
//   npm run cache:refresh                      papers, sets, counts and explanations
//   npm run cache:refresh -- taxonomy spotlight
// Needs REVALIDATE_SECRET in .env.local, and CACHE_REFRESH_URL for the live site
// (otherwise NEXT_PUBLIC_SITE_URL is used).
import fs from 'node:fs'

const env = Object.fromEntries(
  fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')
    .filter((line) => line.includes('=') && !line.trim().startsWith('#'))
    .map((line) => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
)
const tags = process.argv.slice(2).length ? process.argv.slice(2) : ['catalogue', 'solutions']
const site = (process.env.SITE_URL ?? env.CACHE_REFRESH_URL ?? env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/$/, '')
if (!site || !env.REVALIDATE_SECRET) throw new Error('Set CACHE_REFRESH_URL and REVALIDATE_SECRET in .env.local.')

const response = await fetch(`${site}/api/revalidate`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${env.REVALIDATE_SECRET}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ tags }),
})
console.log(response.status, await response.text())
