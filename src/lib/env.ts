/**
 * Environment access with errors that say what to do.
 *
 * Public values are inlined at build time by Next, so they must be referenced
 * as literal `process.env.NEXT_PUBLIC_*` expressions rather than looked up
 * dynamically — that is why this file is repetitive rather than a loop.
 */

function required(value: string | undefined, name: string, where: string): string {
  if (!value) {
    throw new Error(
      `Missing ${name}. Add it to .env.local — see .env.example. (${where})`,
    )
  }
  return value
}

export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  cloudinaryCloudName: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? '',
  /** "on" lets Cloudinary resize and re-encode images; off, they are served as uploaded. */
  cloudinaryTransforms: process.env.NEXT_PUBLIC_CLOUDINARY_TRANSFORMS === 'on',
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  /** Where visitors write about privacy and the terms. Empty until the owner sets it. */
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? '',
}

export function supabaseUrl(): string {
  return required(
    publicEnv.supabaseUrl,
    'NEXT_PUBLIC_SUPABASE_URL',
    'Supabase dashboard → Project Settings → Data API',
  )
}

export function supabaseAnonKey(): string {
  return required(
    publicEnv.supabaseAnonKey,
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'Supabase dashboard → Project Settings → API Keys → anon/publishable',
  )
}

/** Server only. Bypasses RLS — never import this from a client component. */
export function supabaseServiceRoleKey(): string {
  return required(
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    'SUPABASE_SERVICE_ROLE_KEY',
    'Supabase dashboard → Project Settings → API Keys → service_role',
  )
}

export function cloudinaryConfig() {
  return {
    cloudName: required(
      publicEnv.cloudinaryCloudName,
      'NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME',
      'Cloudinary dashboard → Product Environment Credentials',
    ),
    apiKey: required(
      process.env.CLOUDINARY_API_KEY,
      'CLOUDINARY_API_KEY',
      'Cloudinary dashboard → Product Environment Credentials',
    ),
    apiSecret: required(
      process.env.CLOUDINARY_API_SECRET,
      'CLOUDINARY_API_SECRET',
      'Cloudinary dashboard → Product Environment Credentials',
    ),
    folder: process.env.CLOUDINARY_UPLOAD_FOLDER || 'qp',
  }
}

export function anthropicApiKey(): string {
  return required(
    process.env.ANTHROPIC_API_KEY,
    'ANTHROPIC_API_KEY',
    'console.anthropic.com → API Keys — only needed for question extraction',
  )
}

// ---------------------------------------------------------------------------
// YouTube — server only. None of these may ever gain a NEXT_PUBLIC_ prefix:
// the client secret and the token key would then ship in the page bundle.
// docs/youtube.md walks through getting each one.
// ---------------------------------------------------------------------------

/**
 * The OAuth client the owner connects the channel with, from its own Google
 * Cloud project (quizpractice-youtube), not the sign-in project. Its redirect
 * URI is NEXT_PUBLIC_SITE_URL + /api/youtube/callback.
 */
export function youtubeOAuthClient(): { clientId: string; clientSecret: string } {
  const where = 'Google Cloud Console → quizpractice-youtube → Credentials → OAuth 2.0 Client ID (Web)'
  return {
    clientId: required(process.env.YOUTUBE_OAUTH_CLIENT_ID, 'YOUTUBE_OAUTH_CLIENT_ID', where),
    clientSecret: required(process.env.YOUTUBE_OAUTH_CLIENT_SECRET, 'YOUTUBE_OAUTH_CLIENT_SECRET', where),
  }
}

/**
 * The AES-256-GCM key the channel's refresh token is sealed with: 32 random
 * bytes, base64. Changing it orphans the stored token, and the channel has to
 * be connected again.
 */
export function youtubeTokenKey(): Buffer {
  const raw = required(
    process.env.YOUTUBE_TOKEN_KEY,
    'YOUTUBE_TOKEN_KEY',
    `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`,
  )
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) {
    throw new Error('YOUTUBE_TOKEN_KEY must be 32 bytes, base64-encoded (44 characters ending in "=").')
  }
  return key
}

/** True when the channel can be connected at all: the OAuth client and the token key are set. */
export function youtubeOAuthConfigured(): boolean {
  return Boolean(
    process.env.YOUTUBE_OAUTH_CLIENT_ID && process.env.YOUTUBE_OAUTH_CLIENT_SECRET && process.env.YOUTUBE_TOKEN_KEY,
  )
}

/**
 * Optional. Lets the server check a pasted link (channel, visibility,
 * embedding) without a connected channel. Google Cloud Console → Credentials
 * → API key, restricted to YouTube Data API v3.
 */
export function youtubeApiKey(): string | null {
  return process.env.YOUTUBE_API_KEY || null
}

/**
 * Optional. The Unknown IITians channel id (UC…), from YouTube Studio →
 * Settings → Channel → Advanced settings. When set, only that channel can be
 * connected, and pasted links from any other channel are refused.
 */
export function youtubeChannelId(): string | null {
  return process.env.YOUTUBE_CHANNEL_ID || null
}

/**
 * "on" shows teachers the one-click upload. Leave it off until Google's
 * YouTube API audit has passed: before that, every video the site uploads is
 * locked Private for good.
 */
export function youtubeApiUploadsFlag(): boolean {
  return process.env.YOUTUBE_API_UPLOADS === 'on'
}

/**
 * Optional. Vercel sends it as "Authorization: Bearer <value>" with every
 * scheduled call (vercel.json → crons), so only Vercel can run the daily
 * YouTube check. Any random string of 16 characters or more.
 */
export function cronSecret(): string | null {
  return process.env.CRON_SECRET || null
}

/** True when the app has enough configuration to talk to Supabase at all. */
export const isSupabaseConfigured =
  Boolean(publicEnv.supabaseUrl) && Boolean(publicEnv.supabaseAnonKey)
