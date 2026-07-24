import { createClient } from '@supabase/supabase-js'

/**
 * Downloads a media message from the Uazapi/Evolution API instance
 * and uploads it to the Supabase 'chat-media' bucket.
 * 
 * @param instanceUrl The base URL of the Uazapi instance
 * @param token The instance token
 * @param messageId The ID of the message containing media
 * @param accountId The local account ID for folder structure
 * @param filename The final filename with extension
 * @returns The public URL of the uploaded file, or null on failure
 */
export async function downloadAndUploadUazapiMedia(
  instanceUrl: string,
  token: string,
  messageId: string,
  accountId: string,
  filename: string,
): Promise<string | null> {
  try {
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const url = `${instanceUrl.replace(/\/$/, '')}/message/download`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'token': token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ id: messageId })
    })

    if (!res.ok) {
      console.error(`[uazapi/media] Failed to download media: ${res.statusText}`)
      return null
    }

    // The response could be binary data or base64 wrapped in JSON depending on the uazapi version
    // We treat it as an arrayBuffer to handle direct binary output
    const contentType = res.headers.get('content-type') || 'application/octet-stream'
    
    let buffer: ArrayBuffer | Buffer
    if (contentType.includes('application/json')) {
      const json = await res.json()
      // If it's a base64 payload
      if (json.base64) {
        buffer = Buffer.from(json.base64, 'base64')
      } else {
        console.error(`[uazapi/media] Unexpected JSON response for media download:`, json)
        return null
      }
    } else {
      buffer = await res.arrayBuffer()
    }

    const path = `${accountId}/${filename}`

    const { error: uploadError } = await supabaseAdmin.storage
      .from('chat-media')
      .upload(path, buffer, {
        contentType,
        upsert: true,
      })

    if (uploadError) {
      console.error(`[uazapi/media] Failed to upload media to Supabase:`, uploadError)
      return null
    }

    const {
      data: { publicUrl },
    } = supabaseAdmin.storage.from('chat-media').getPublicUrl(path)

    return publicUrl
  } catch (err) {
    console.error(`[uazapi/media] Exception during media download/upload:`, err)
    return null
  }
}
