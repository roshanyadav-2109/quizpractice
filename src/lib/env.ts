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

/** True when the app has enough configuration to talk to Supabase at all. */
export const isSupabaseConfigured =
  Boolean(publicEnv.supabaseUrl) && Boolean(publicEnv.supabaseAnonKey)
