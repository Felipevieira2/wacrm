import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { decrypt } from '@/lib/whatsapp/encryption'
import { findExistingContact, isUniqueViolation } from '@/lib/contacts/dedupe'
import { runAutomationsForTrigger } from '@/lib/automations/engine'
import { dispatchInboundToFlows } from '@/lib/flows/engine'
import { dispatchInboundToAiReply } from '@/lib/ai/auto-reply'
import { dispatchWebhookEvent } from '@/lib/webhooks/deliver'
import { downloadAndUploadUazapiMedia } from '@/lib/uazapi/media'

export const maxDuration = 60

let _adminClient: any = null
function supabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _adminClient
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text()

    // Some versions of Uazapi/Evolution wrap the payload differently.
    // The n8n script shows it wrapped in { "body": { ... } } sometimes.
    // We parse and normalise.
    let payload = JSON.parse(rawBody)
    if (payload.body && !payload.message && !payload.event) {
      payload = payload.body
    }

    const token = payload.token || payload.instance_token || request.headers.get('token')
    if (!token) {
      return NextResponse.json({ error: 'No instance token provided' }, { status: 401 })
    }

    const supabase = supabaseAdmin()

    // 1. Resolve instance config
    let { data: config, error: configError } = await supabase
      .from('uazapi_config')
      .select('*')
      .eq('instance_token', token)
      .maybeSingle()

    if (configError || !config) {
      // It's possible the token in the DB is encrypted. 
      // We must fetch all configs and try to decrypt to match.
      const { data: allConfigs } = await supabase.from('uazapi_config').select('*')
      let matchedConfig = null
      for (const c of allConfigs || []) {
        try {
          if (c.instance_token === token || decrypt(c.instance_token) === token) {
            matchedConfig = c
            break
          }
        } catch {
          // ignore
        }
      }
      if (!matchedConfig) {
        return NextResponse.json({ error: 'Instance not found' }, { status: 404 })
      }
      config = matchedConfig
    }

    const accountId = config.account_id

    // 2. Extract Event / Message data
    const message = payload.message
    const event = payload.event
    const chat = payload.chat || payload.message?.chat

    // Check for DeletedMessage / Revoke
    const isDeletedMessage =
      payload.event === 'messages.delete' ||
      payload.message?.messageType === 'protocolMessage' ||
      payload.messageType === 'DeletedMessage'

    if (isDeletedMessage) {
      const messageId = message?.messageid || event?.MessageIDs?.[0] || payload.message?.content?.key?.id
      if (messageId) {
        // Find message and ensure it belongs to this account
        const { data: msg } = await supabase
          .from('messages')
          .select('id, conversations!inner(account_id)')
          .eq('message_id', messageId)
          .maybeSingle()

        if (msg) {
          await supabase.from('messages').update({ deleted_at: new Date().toISOString() }).eq('id', msg.id)
        }
      }
      return NextResponse.json({ success: true })
    }
    console.log(payload)
    // Check for Calls
    if (payload.event === 'call' || payload.EventType === 'call') {
      const callData = event?.Data?.Content?.[0] || event
      const rawPhone = event?.CallCreatorAlt || payload.chat?.phone || ''
      const phone = cleanPhone(rawPhone)

      const { conversationId } = await resolveContactAndConversation(supabase, accountId, phone, chat?.name)
      if (conversationId) {
        await supabase.from('messages').insert({
          conversation_id: conversationId,
          sender_type: 'customer',
          content_type: 'call',
          content_text: `Call received: ${callData?.Tag || 'Unknown'}`,
          message_id: event?.CallID || `call_${Date.now()}`,
          status: 'delivered'
        })
      }
      return NextResponse.json({ success: true })
    }

    // If there's no message body, we ignore (maybe an ack or status update we don't handle yet)
    if (!message) {
      return NextResponse.json({ success: true })
    }

    // 3. Resolve Contact and Conversation
    const rawPhone = chat?.phone || message?.chatid || ''
    const phone = cleanPhone(rawPhone)
    const clientName = message?.senderName || chat?.name || phone
    const avatarUrl =
      chat?.imagePreview ||
      chat?.profilePicUrl ||
      chat?.image ||
      chat?.avatarUrl ||
      chat?.picture ||
      message?.senderPhoto ||
      message?.senderPicture ||
      message?.senderImage ||
      message?.profilePicUrl ||
      payload?.senderPhoto ||
      payload?.profilePicUrl ||
      payload?.pictureUrl ||
      null

    const { conversationId, contactId } = await resolveContactAndConversation(
      supabase,
      accountId,
      phone,
      clientName,
      avatarUrl
    )
    if (!conversationId) {
      return NextResponse.json({ error: 'Could not resolve conversation' }, { status: 500 })
    }

    // 4. Handle Edits
    if (message.edited) {
      const originalMessageId = message.edited
      const newText = message.text || message.content?.text

      // Find original message
      const { data: originalMsg } = await supabase
        .from('messages')
        .select('id, content_text')
        .eq('message_id', originalMessageId)
        .maybeSingle()

      if (originalMsg && newText) {
        // Save to message_edits history
        await supabase.from('message_edits').insert({
          message_id: originalMsg.id,
          old_content_text: originalMsg.content_text,
          new_content_text: newText,
          edited_at: parseTimestamp(message.messageTimestamp || message.timestamp).toISOString()
        })

        // Update current message
        await supabase
          .from('messages')
          .update({ content_text: newText, edited_at: new Date().toISOString() })
          .eq('id', originalMsg.id)
      }
      return NextResponse.json({ success: true })
    }

    // 5. Build the message record
    const messageId = message.messageid || message.id || `msg_${Date.now()}`
    const timestamp = parseTimestamp(message.messageTimestamp || message.timestamp)
    const isFromMe = message.fromMe || false

    const msgRecord: any = {
      conversation_id: conversationId,
      sender_type: isFromMe ? 'agent' : 'customer',
      sender_id: null,
      message_id: messageId,
      status: isFromMe ? 'sent' : 'delivered',
      created_at: timestamp.toISOString()
    }

    // Process Message Type
    const messageType = message.type || message.messageType

    if (messageType === 'ReactionMessage' || (messageType === 'reaction' || payload.type === 'reaction')) {
      const reactionKey = message.content?.key?.id
      if (reactionKey) {
        // Here we could update a reactions table. For now we save as a 'reaction' message.
        msgRecord.content_type = 'reaction'
        msgRecord.content_text = message.content?.text || message.text
      } else {
        return NextResponse.json({ success: true })
      }
    }
    else if (messageType === 'ContactMessage' || messageType === 'ContactsArrayMessage') {
      msgRecord.content_type = 'contact'
      const content = message.content || {}
      let processedContacts = []

      if (messageType === 'ContactMessage' && content.vcard) {
        const waidMatch = content.vcard.match(/waid=(\d+)/)
        processedContacts.push({
          name: content.displayName,
          phone: waidMatch ? waidMatch[1] : "",
          vcard: content.vcard
        })
      } else if (messageType === 'ContactsArrayMessage' && content.contacts) {
        processedContacts = content.contacts.map((c: any) => {
          const waidMatch = c.vcard.match(/waid=(\d+)/)
          return {
            name: c.displayName,
            phone: waidMatch ? waidMatch[1] : "",
            vcard: c.vcard
          }
        })
      }
      msgRecord.content_text = JSON.stringify(processedContacts)
    }
    else if (messageType === 'media' || messageType === 'imageMessage' || messageType === 'videoMessage' || messageType === 'audioMessage' || messageType === 'documentMessage') {
      let type = message.mediaType || messageType.replace('Message', '')
      if (type === 'ptt') type = 'audio'
      if (!['image', 'video', 'audio', 'document'].includes(type)) type = 'document'

      msgRecord.content_type = type
      msgRecord.content_text = message.text || message.content?.caption || ''

      const mimeMap: Record<string, string> = {
        'vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
        'vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
        'vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
        'plain': 'txt',
        'msword': 'doc',
        'vnd.ms-excel': 'xls',
        'pdf': 'pdf',
        'jpeg': 'jpg'
      }

      const fullMime = message.content?.mimetype || message.mimetype || ""
      const mimeSuffix = fullMime.split('/')[1]?.split(';')[0]?.trim() || "bin"
      const extension = mimeMap[mimeSuffix] || mimeSuffix
      const fileName = `${messageId}.${extension}`

      let decryptedToken = config.instance_token
      try {
        decryptedToken = decrypt(config.instance_token)
      } catch {
        // Token may already be plain text
      }
      const mediaUrl = await downloadAndUploadUazapiMedia(
        config.instance_url,
        decryptedToken,
        messageId,
        accountId,
        fileName
      )

      if (mediaUrl) {
        msgRecord.media_url = mediaUrl
      }
    }
    else {
      // Default to text
      msgRecord.content_type = 'text'
      msgRecord.content_text = message.text || message.content?.text || message.conversation || ''
    }

    // 6. Insert Message
    const { data: savedMsg, error: msgError } = await supabase
      .from('messages')
      .insert(msgRecord)
      .select()
      .single()

    if (msgError) {
      // Could be duplicate message_id, which we just ignore
      if (isUniqueViolation(msgError)) {
        return NextResponse.json({ success: true })
      }
      console.error('[uazapi/webhook] Error saving message:', msgError)
      return NextResponse.json({ error: 'Failed to save message' }, { status: 500 })
    }

    // Update conversation last message
    await supabase
      .from('conversations')
      .update({
        last_message_text: getMessageSnippet(savedMsg),
        last_message_at: savedMsg.created_at,
        unread_count: isFromMe ? 0 : undefined, // Supabase RPC or DB trigger usually handles incrementing
      })
      .eq('id', conversationId)

    // 7. Dispatch Webhooks / Flows
    if (!isFromMe && savedMsg) {
      // We pass the shaped WhatsappMessage format to keep compatibility with existing Flows/Webhooks
      const fakeWhatsappFormat = {
        id: savedMsg.message_id,
        from: phone,
        timestamp: Math.floor(timestamp.getTime() / 1000).toString(),
        type: savedMsg.content_type,
        text: savedMsg.content_type === 'text' ? { body: savedMsg.content_text } : undefined,
      }

      const entry = {
        id: accountId,
        changes: [{
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: {
              display_phone_number: config.phone_number || '',
              phone_number_id: 'uazapi'
            },
            contacts: [{ profile: { name: clientName }, wa_id: phone }],
            messages: [fakeWhatsappFormat as any]
          }
        }]
      }

      await dispatchWebhookEvent(supabase, accountId, 'message.received', fakeWhatsappFormat)

      // Post-response background tasks
      /*
      // Currently `after()` is experimental and relies on next.config.js flags, 
      // but using simple background promises is fine for serverless if they complete 
      // before maxDuration.
      */
      Promise.all([
        runAutomationsForTrigger({
          accountId,
          triggerType: 'new_message_received',
          contactId: contactId || '',
          context: { message_text: savedMsg.content_text || '' },
        }),
        dispatchInboundToFlows({
          accountId,
          userId: accountId,
          contactId: contactId || '',
          conversationId: conversationId || '',
          message: {
            kind: 'text',
            text: savedMsg.content_text || '',
            meta_message_id: messageId,
          },
          isFirstInboundMessage: false,
        }),
        dispatchInboundToAiReply({
          accountId,
          contactId: contactId || '',
          conversationId: conversationId || '',
          configOwnerUserId: accountId, // Using accountId as owner for uazapi instances since they are tied to account
        })
      ]).catch(err => console.error('[uazapi/webhook] Engine dispatch error:', err))
    }

    return NextResponse.json({ success: true })

  } catch (err) {
    console.error('[uazapi/webhook] Unhandled error:', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function cleanPhone(raw: string): string {
  if (!raw) return ''
  return raw.split('@')[0].replace('+', '').replace(/[\s-]/g, '')
}

function parseTimestamp(rawTs: any): Date {
  if (!rawTs) return new Date()
  const num = Number(rawTs)
  if (isNaN(num) || num <= 0) return new Date()
  // If timestamp is in seconds (10 digits e.g. 1700000000), convert to ms. If already ms (13 digits), use as is.
  const ms = num < 10000000000 ? num * 1000 : num
  const date = new Date(ms)
  return isNaN(date.getTime()) ? new Date() : date
}

async function getConversationId(supabase: any, accountId: string, messageId: string) {
  const { data } = await supabase
    .from('messages')
    .select('conversation_id')
    .eq('message_id', messageId)
    .maybeSingle()
  return data?.conversation_id
}

async function resolveContactAndConversation(
  supabase: any,
  accountId: string,
  phone: string,
  name: string,
  avatarUrl?: string | null
) {
  // Fetch owner user_id for this account to satisfy contacts_user_id_fkey constraint
  const { data: profile } = await supabase
    .from('profiles')
    .select('user_id')
    .eq('account_id', accountId)
    .limit(1)
    .maybeSingle()

  const ownerUserId = profile?.user_id || accountId

  let contact = await findExistingContact(supabase, accountId, phone)

  if (!contact) {
    const { data: newContact, error } = await supabase
      .from('contacts')
      .insert({
        account_id: accountId,
        user_id: ownerUserId,
        phone,
        name: name || phone,
        avatar_url: avatarUrl || null,
      })
      .select()
      .single()

    if (error) {
      console.error('[uazapi/webhook] Error creating contact:', error)
      return { contactId: null, conversationId: null }
    }
    contact = newContact
  } else {
    // If contact exists, update name or avatar_url if provided and changed
    const updates: Record<string, any> = {}
    if (avatarUrl && contact.avatar_url !== avatarUrl) {
      updates.avatar_url = avatarUrl
    }
    if (name && name !== phone && contact.name !== name) {
      updates.name = name
    }
    if (Object.keys(updates).length > 0) {
      updates.updated_at = new Date().toISOString()
      await supabase.from('contacts').update(updates).eq('id', contact.id)
      Object.assign(contact, updates)
    }
  }

  if (!contact) {
    return { contactId: null, conversationId: null }
  }

  // Find or create open conversation
  let { data: conversation } = await supabase
    .from('conversations')
    .select('id')
    .eq('account_id', accountId)
    .eq('contact_id', contact.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!conversation) {
    const { data: newConv } = await supabase
      .from('conversations')
      .insert({
        account_id: accountId,
        user_id: ownerUserId,
        contact_id: contact.id,
        status: 'open',
      })
      .select('id')
      .single()
    conversation = newConv
  }

  return {
    contactId: contact.id,
    conversationId: conversation?.id
  }
}

function getMessageSnippet(msg: any): string {
  switch (msg.content_type) {
    case 'text':
      return msg.content_text
    case 'image':
      return '📷 Image'
    case 'video':
      return '🎥 Video'
    case 'audio':
      return '🎤 Audio'
    case 'document':
      return '📄 Document'
    case 'location':
      return '📍 Location'
    case 'contact':
      return '👤 Contact'
    case 'call':
      return '📞 Call'
    default:
      return 'Message'
  }
}
