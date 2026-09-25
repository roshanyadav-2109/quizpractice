import { v2 as cloudinary } from 'cloudinary'
import { cloudinaryConfig } from '@/lib/env'
import type { CloudinaryRef } from '@/lib/blocks/schema'

let configured = false

function configure() {
  // Not `server-only`, because the CLI importer uses this in plain Node.
  // The API secret must never reach a browser bundle, hence the guard.
  if (typeof window !== 'undefined') {
    throw new Error('Cloudinary server helpers must never run in the browser.')
  }
  if (configured) return
  const { cloudName, apiKey, apiSecret } = cloudinaryConfig()
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  })
  configured = true
}

/**
 * Signature for a direct browser upload. The API secret stays on the server;
 * the browser gets a signature that is only valid for these exact parameters.
 */
export function signUpload(params: {
  publicId: string
  timestamp?: number
}): { signature: string; timestamp: number; apiKey: string; cloudName: string } {
  configure()
  const { apiKey, cloudName } = cloudinaryConfig()
  const timestamp = params.timestamp ?? Math.round(Date.now() / 1000)

  const signature = cloudinary.utils.api_sign_request(
    {
      public_id: params.publicId,
      timestamp,
      // Cap the stored dimensions on the way in. Scans of question papers are
      // routinely 3000px wide and nothing renders them above 1600.
      transformation: 'c_limit,w_1600',
    },
    cloudinaryConfig().apiSecret,
  )

  return { signature, timestamp, apiKey, cloudName }
}

/** Server-side upload, used by the importer for images shipped alongside JSON. */
export async function uploadFromUrl(
  source: string,
  publicId: string,
): Promise<CloudinaryRef> {
  configure()

  const result = await cloudinary.uploader.upload(source, {
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
  }
}

export async function destroyAsset(publicId: string): Promise<void> {
  configure()
  await cloudinary.uploader.destroy(publicId, { resource_type: 'image' })
}
