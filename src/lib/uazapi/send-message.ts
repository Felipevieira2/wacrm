// ─── Uazapi Outbound Message Sender ──────────────────────────────────────────
//
// Mirrors src/lib/whatsapp/send-message.ts but sends through Uazapi instead
// of the Meta Cloud API. Called automatically when the account has
// uazapi_config configured — the caller (sendMessageToConversation) detects
// which transport to use and delegates here.
//
// Supports: text, image, video, audio (PTT), document.
// Interactive / template messages fall back to plain-text for now —
// Uazapi has its own button format which can be added later.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { decrypt } from '@/lib/whatsapp/encryption';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { UazapiClient } from './client';
import type { UazapiMediaKind } from './types';
import type { SendMessageParams, SendMessageResult } from '@/lib/whatsapp/send-message';
import { SendMessageError, MEDIA_KINDS } from '@/lib/whatsapp/send-message';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extract the WhatsApp message id from the Uazapi send response.
 * Uazapi may return it at key.id, messageId, or id — we try all three.
 */
function extractMessageId(data: Record<string, unknown> | null | undefined): string {
  if (!data) return '';
  const key = data.key as Record<string, unknown> | undefined;
  return (
    (key?.id as string) ||
    (data.messageId as string) ||
    (data.id as string) ||
    ''
  );
}

/**
 * Normalise a phone number for Uazapi.
 * Uazapi expects the international format WITHOUT a leading '+' and WITHOUT
 * '@s.whatsapp.net'. Examples: 5511999999999, 5521987654321.
 */
function normalisePhone(phone: string): string {
  return phone.replace(/^\+/, '').replace(/@.*$/, '').replace(/\D/g, '');
}

// ── Core ──────────────────────────────────────────────────────────────────────

/**
 * Send a message in an existing conversation via the Uazapi transport and
 * persist it to the database.
 *
 * `db` may be the RLS-scoped user client (dashboard) or the service-role
 * client (public API / automations) — every query is filtered by `accountId`.
 */
export async function sendUazapiMessage(
  db: SupabaseClient,
  accountId: string,
  params: SendMessageParams,
): Promise<SendMessageResult> {
  const {
    conversationId,
    messageType,
    contentText,
    mediaUrl,
    filename,
    replyToMessageId,
    interactivePayload,
  } = params;

  if (!conversationId) {
    throw new SendMessageError('bad_request', 'conversation_id is required', 400);
  }

  // ── 1. Resolve conversation + contact ──────────────────────────────────────
  const { data: conversation, error: convError } = await db
    .from('conversations')
    .select('*, contact:contacts(*)')
    .eq('id', conversationId)
    .eq('account_id', accountId)
    .single();

  if (convError || !conversation) {
    throw new SendMessageError('not_found', 'Conversation not found', 404);
  }

  const contact = conversation.contact;
  if (!contact?.phone) {
    throw new SendMessageError('bad_request', 'Contact phone number not found', 400);
  }

  const destinationPhone = normalisePhone(contact.phone);
  if (!destinationPhone || destinationPhone.length < 8) {
    throw new SendMessageError('bad_request', 'Invalid phone number format', 400);
  }

  // ── 2. Load Uazapi config ──────────────────────────────────────────────────
  const { data: config, error: configError } = await db
    .from('uazapi_config')
    .select('instance_url, instance_token')
    .eq('account_id', accountId)
    .single();

  if (configError || !config) {
    throw new SendMessageError(
      'uazapi_not_configured',
      'Uazapi integration not configured for this account.',
      400,
    );
  }

  // ── 3. Decrypt token + build client ───────────────────────────────────────
  let plainToken: string;
  try {
    plainToken = decrypt(config.instance_token);
  } catch {
    throw new SendMessageError(
      'uazapi_token_error',
      'Failed to decrypt Uazapi instance token.',
      500,
    );
  }

  const client = new UazapiClient(config.instance_url, plainToken);

  // ── 3.5 Resolve reply target message_id (if replying) ──────────────────────
  let replyid: string | undefined;
  if (replyToMessageId) {
    const { data: parent, error: parentError } = await db
      .from('messages')
      .select('message_id, conversation_id')
      .eq('id', replyToMessageId)
      .eq('conversation_id', conversationId)
      .maybeSingle();

    if (parentError || !parent) {
      throw new SendMessageError(
        'bad_request',
        'reply_to_message_id not found in this conversation',
        400,
      );
    }
    if (parent.message_id) {
      replyid = parent.message_id;
    }
  }

  // ── 4. Dispatch to Uazapi ─────────────────────────────────────────────────
  const isMediaKind = (MEDIA_KINDS as readonly string[]).includes(messageType);
  let sendResult: Awaited<ReturnType<typeof client.sendText>>;

  try {
    if (messageType === 'text') {
      if (!contentText) {
        throw new SendMessageError('bad_request', 'content_text is required for text messages', 400);
      }
      sendResult = await client.sendText(destinationPhone, contentText, replyid);

    } else if (isMediaKind) {
      if (!mediaUrl) {
        throw new SendMessageError(
          'bad_request',
          `media_url is required for ${messageType} messages`,
          400,
        );
      }
      sendResult = await client.sendMedia(
        messageType as UazapiMediaKind,
        destinationPhone,
        mediaUrl,
        contentText ?? undefined,
        filename ?? undefined,
        replyid,
      );

    } else if (messageType === 'interactive') {
      // Uazapi button format differs from Meta — send body text as plain text for now.
      const fallbackText = interactivePayload?.body ?? contentText ?? '[interactive message]';
      sendResult = await client.sendText(destinationPhone, fallbackText, replyid);

    } else if (messageType === 'template') {
      // Templates via Uazapi require a separate flow.
      // Surface a clear error so the agent knows.
      throw new SendMessageError(
        'uazapi_templates_unsupported',
        'WhatsApp message templates are not yet supported via Uazapi. Use a text or media message.',
        400,
      );

    } else {
      throw new SendMessageError(
        'bad_request',
        `Unsupported message type "${messageType}" for Uazapi`,
        400,
      );
    }
  } catch (err) {
    if (err instanceof SendMessageError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new SendMessageError('uazapi_error', `Uazapi API error: ${msg}`, 502);
  }

  if (!sendResult.ok) {
    console.error('[uazapi/send] sendResult failed:', sendResult);
    throw new SendMessageError('uazapi_error', `Uazapi send failed: ${sendResult.error}`, 502);
  }

  const waMessageId = extractMessageId(sendResult.data as Record<string, unknown>);

  // ── 5. Persist message row ─────────────────────────────────────────────────
  const { data: messageRecord, error: msgError } = await db
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_type: 'agent',
      content_type: messageType,
      content_text: contentText ?? null,
      media_url: mediaUrl ?? null,
      message_id: waMessageId || null,
      status: 'sent',
      reply_to_message_id: replyToMessageId ?? null,
    })
    .select()
    .single();

  if (msgError || !messageRecord) {
    console.error('[uazapi/send] Failed to persist message:', msgError);
    throw new SendMessageError(
      'db_error',
      'Message sent but failed to save to database.',
      500,
    );
  }

  // ── 6. Update conversation ─────────────────────────────────────────────────
  const lastMessageText = contentText || `[${messageType}]`;

  await db
    .from('conversations')
    .update({
      last_message_text: lastMessageText,
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId);

  // ── 7. Pause active Flow runs (best-effort) ────────────────────────────────
  try {
    await supabaseAdmin()
      .from('flow_runs')
      .update({
        status: 'paused_by_agent',
        ended_at: new Date().toISOString(),
        end_reason: 'agent_replied',
      })
      .eq('account_id', accountId)
      .eq('contact_id', contact.id)
      .eq('status', 'active');
  } catch (err) {
    console.error(
      '[uazapi/send] pause-on-agent-send failed:',
      err instanceof Error ? err.message : err,
    );
  }

  return {
    messageId: messageRecord.id,
    whatsappMessageId: waMessageId,
  };
}

