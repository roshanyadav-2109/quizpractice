import { v2 as cloudinary } from 'cloudinary'
import { cloudinaryConfig } from '@/lib/env'
import type { CloudinaryRef } from '@/lib/blocks/schema'

/**
 * Two Cloudinary accounts, each on the free plan's 25 credits. Every upload —
 * and every overwrite — costs a transformation, counted over a rolling 30
 * days, so a bulk import can push one account over its limit for a month,
 * and an account left over its limit can be disabled, taking every image it
 * serves with it.
 *
 * So uploads go to the site's own account while it has room, then to the
 * second account, and stop — with a plain message — once both are near their
 * limit. An asset placed on the second account records its cloud, which is
 * how the renderer knows where to fetch it.
 */

interface Account {
  cloudName: string
  apiKey: string
  apiSecret: string
  /** True for the site's own account, whose cloud name the renderer assumes. */
  primary: boolean
}

/** Stop using an account once this share of its credits is spent. */
const CAP = 0.8
const USAGE_TTL_MS = 10 * 60 * 1000

function guardServer() {
  // Not `server-only`, because the CLI importer uses this in plain Node.
  // API secrets must never reach a browser bundle, hence the guard.
  if (typeof window !== 'undefined') {
    throw new Error('Cloudinary server helpers must never run in the browser.')
  }
}

function accounts(): Account[] {
  const { cloudName, apiKey, apiSecret } = cloudinaryConfig()
  const list: Account[] = [{ cloudName, apiKey, apiSecret, primary: true }]
  const second = {
    cloudName: process.env.CLOUDINARY_SHEETS_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_SHEETS_API_KEY,
    apiSecret: process.env.CLOUDINARY_SHEETS_API_SECRET,
  }
  if (second.cloudName && second.apiKey && second.apiSecret && second.cloudName !== cloudName) {
    list.push({ cloudName: second.cloudName, apiKey: second.apiKey, apiSecret: second.apiSecret, primary: false })
  }
  return list
}

const usageCache = new Map<string, { ratio: number; at: number }>()

/** Share of the account's plan credits used over the last 30 days. */
async function usedRatio(account: Account): Promise<number> {
  const cached = usageCache.get(account.cloudName)
  if (cached && Date.now() - cached.at < USAGE_TTL_MS) return cached.ratio
  const auth = Buffer.from(`${account.apiKey}:${account.apiSecret}`).toString('base64')
  const response = await fetch(`https://api.cloudinary.com/v1_1/${account.cloudName}/usage`, {
    headers: { Authorization: `Basic ${auth}` },
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`Could not read Cloudinary usage for ${account.cloudName}.`)
  const usage = (await response.json()) as { credits?: { usage?: number; limit?: number } }
  const limit = Number(usage.credits?.limit ?? 0)
  const ratio = limit > 0 ? Number(usage.credits?.usage ?? 0) / limit : 1
  usageCache.set(account.cloudName, { ratio, at: Date.now() })
  return ratio
}

export class UploadBudgetError extends Error {}

/** The first account, in order, with room left under the cap. */
async function pickAccount(count = 1): Promise<Account> {
  guardServer()
  for (const account of accounts()) {
    const ratio = await usedRatio(account)
    // Each upload is 1 of the 25 000 transformations 25 credits buy.
    if (ratio + count / 25_000 < CAP) {
      return account
    }
  }
  throw new UploadBudgetError(
    'Image uploads are paused: both Cloudinary accounts are close to their monthly limit. They free up as older uploads pass 30 days.',
  )
}

/**
 * Signature for a direct browser upload. The API secret stays on the server;
 * the browser gets a signature that is only valid for these exact parameters,
 * on whichever account has room — so it must upload to the returned cloud.
 */
export async function signUpload(params: {
  publicId: string
  timestamp?: number
}): Promise<{ signature: string; timestamp: number; apiKey: string; cloudName: string }> {
  const account = await pickAccount()
  const timestamp = params.timestamp ?? Math.round(Date.now() / 1000)

  const signature = cloudinary.utils.api_sign_request(
    {
      public_id: params.publicId,
      timestamp,
      // Cap the stored dimensions on the way in. Scans of question papers are
      // routinely 3000px wide and nothing renders them above 1600.
      transformation: 'c_limit,w_1600',
    },
    account.apiSecret,
  )

  return { signature, timestamp, apiKey: account.apiKey, cloudName: account.cloudName }
}

/** Server-side upload, used by the importer for images shipped alongside JSON. */
export async function uploadFromUrl(source: string, publicId: string): Promise<CloudinaryRef> {
  const account = await pickAccount()

  const result = await cloudinary.uploader.upload(source, {
    cloud_name: account.cloudName,
    api_key: account.apiKey,
    api_secret: account.apiSecret,
    secure: true,
    public_id: publicId,
    overwrite: true,
    resource_type: 'image',
    transformation: [{ crop: 'limit', width: 1600 }],
  })

  return {
    provider: 'cloudinary',
    public_id: result.public_id,
    version: result.version,
    format: result.format,
    width: result.width,
    height: result.height,
    ...(account.primary ? {} : { cloud: account.cloudName }),
  }
}

/** Removes an asset from whichever account holds it (the site's own by default). */
export async function destroyAsset(publicId: string, cloud?: string): Promise<void> {
  guardServer()
  const account = accounts().find((a) => (cloud ? a.cloudName === cloud : a.primary))
  if (!account) throw new Error(`No credentials for Cloudinary cloud ${cloud}.`)
  // The SDK takes per-call credentials on every call; its destroy() typings
  // just don't list them.
  const options = {
    cloud_name: account.cloudName,
    api_key: account.apiKey,
    api_secret: account.apiSecret,
    resource_type: 'image',
  } as { resource_type: 'image' }
  await cloudinary.uploader.destroy(publicId, options)
}
