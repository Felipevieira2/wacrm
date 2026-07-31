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
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'token': token,
      },
      body: JSON.stringify({
        id: messageId,
        return_base64: false,
      })
    })

    if (!res.ok) {
      console.error(`[uazapi/media] Failed to download media: ${res.statusText}`)
      return null
    }

    // The response could be binary data, base64 wrapped in JSON, or a JSON object with fileURL/url
    let contentTypeHeader = res.headers.get('content-type') || 'application/octet-stream'
    let buffer: ArrayBuffer | Buffer

    if (contentTypeHeader.includes('application/json')) {
      const json = await res.json()
      if (json.base64) {
        buffer = Buffer.from(json.base64, 'base64')
      } else {
        const fileUrl = json.fileURL || json.fileUrl || json.url || json.mediaUrl || json.link
        if (fileUrl && typeof fileUrl === 'string') {
          if (json.mimetype) {
            contentTypeHeader = json.mimetype
          }
          try {
            const fetchRes = await fetch(fileUrl)
            if (fetchRes.ok) {
              buffer = await fetchRes.arrayBuffer()
            } else {
              console.warn(`[uazapi/media] Fetch fileURL returned status ${fetchRes.status}, using fileURL directly: ${fileUrl}`)
              return fileUrl
            }
          } catch (err) {
            console.warn(`[uazapi/media] Failed to fetch fileURL, using fileURL directly:`, err)
            return fileUrl
          }
        } else {
          console.error(`[uazapi/media] Unexpected JSON response for media download:`, json)
          return null
        }
      }
    } else {
      buffer = await res.arrayBuffer()
    }

    const path = `${accountId}/${filename}`

    const { error: uploadError } = await supabaseAdmin.storage
      .from('chat-media')
      .upload(path, buffer, {
        contentType: contentTypeHeader,
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
