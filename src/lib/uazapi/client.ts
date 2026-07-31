// ─── UazapiClient ──────────────────────────────────────────────────────────────
// Thin, typed HTTP client for the uazapi.com unofficial WhatsApp API.
//
// Design decisions:
//   - All methods return UazapiResult<T> (discriminated union) instead of
//     throwing — the caller decides how to surface errors.
//   - Token is injected at construction time so routes can decrypt once
//     and pass it in, rather than re-reading the DB on every sub-call.
//   - A 10-second timeout is applied to every request; uazapi occasionally
//     hangs on /instance/connect if the phone is unreachable.
//   - The base URL is normalised to strip a trailing slash, so callers
//     can pass either "https://x.uazapi.com" or "https://x.uazapi.com/".

import type {
  UazapiConnectResponse,
  UazapiQrCodeResponse,
  UazapiStatusResponse,
  UazapiLogoutResponse,
  UazapiResult,
  UazapiSendMessageResponse,
  UazapiMediaKind,
} from './types';

const REQUEST_TIMEOUT_MS = 10_000;

export class UazapiClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(instanceUrl: string, token: string) {
    this.baseUrl = instanceUrl.replace(/\/$/, '');

    this.token = token;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private url(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  private headers(): HeadersInit {
    return {
      Accept: 'application/json',
      token: this.token,
      'Content-Type': 'application/json',
    };
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<UazapiResult<T>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(this.url(path), {
        method,
        headers: this.headers(),
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!res.ok) {
        let errorMsg = `uazapi error ${res.status} (url: ${this.url(path)})`;
        try {
          const json = await res.json();
          errorMsg = json?.error ?? json?.message ?? errorMsg;
        } catch {
          // ignore parse error — keep the status code message
        }
        return { ok: false, error: errorMsg, status: res.status };
      }

      // Some endpoints return 200 with an empty body on success
      const text = await res.text();
      let data: any = text ? JSON.parse(text) : {};

      // Unwrap Uazapi v2 response envelope if present (e.g. { code: 200, message: "Success", data: { qrcode: "..." } })
      if (data && typeof data === 'object' && 'data' in data && 'code' in data) {
        data = data.data;
      }

      // console.log(`[UAZAPI DEBUG] ${method} ${path} ->`, data);

      return { ok: true, data: data as T };
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === 'AbortError') {
        return { ok: false, error: `Request timed out after 10 s (url: ${this.url(path)})`, status: 408 };
      }
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `${msg} (url: ${this.url(path)})` };
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Initiate connection and obtain the QR Code.
   * Maps to `POST /instance/connect`.
   */
  connect(): Promise<UazapiResult<UazapiConnectResponse>> {

    return this.request<UazapiConnectResponse>('POST', '/instance/connect');
  }

  /**
   * Fetch a fresh QR Code without re-initiating the connection.
   * Since Uazapi v2 returns the QR code on the connect endpoint, we call it again.
   */
  getQrCode(): Promise<UazapiResult<UazapiQrCodeResponse>> {
    return this.request<UazapiQrCodeResponse>('POST', '/instance/connect');
  }

  /**
   * Check the current connection status and connected phone number.
   * Maps to `GET /instance/status`.
   */
  getStatus(): Promise<UazapiResult<UazapiStatusResponse>> {
    return this.request<UazapiStatusResponse>('GET', '/instance/status');
  }
  /**
   * Disconnect the WhatsApp session from the instance without deleting the instance.
   * Maps to `POST /instance/disconnect`.
   */
  logout(): Promise<UazapiResult<UazapiLogoutResponse>> {
    return this.request<UazapiLogoutResponse>('POST', '/instance/disconnect');
  }

  // ── Outbound message send ──────────────────────────────────────────────────

  /**
   * Send a plain-text message.
   * Tries standard Uazapi paths (/send/text, /sendText, /message/sendText).
   * @param number Destination phone in international format without + (e.g. 5511999999999)
   * @param replyid Optional WhatsApp message_id being replied to
   */
  async sendText(
    number: string,
    text: string,
    replyid?: string,
  ): Promise<UazapiResult<UazapiSendMessageResponse>> {
    const endpoints = ['/send/text', '/sendText', '/message/sendText'];
    let lastResult: UazapiResult<UazapiSendMessageResponse> | null = null;

    const body: Record<string, unknown> = {
      number,
      text,
      message: text,
    };
    if (replyid) {
      body.replyid = replyid;
      body.reply_id = replyid;
      body.replyId = replyid;
    }

    for (const path of endpoints) {
      const res = await this.request<UazapiSendMessageResponse>('POST', path, body);
      if (res.ok) return res;
      lastResult = res;
      if (res.status !== 404 && res.status !== 405) break;
    }

    return lastResult!;
  }

  /**
   * Send a media message (image, video, document, or audio PTT).
   * Prioritises Uazapi v2's unified `/send/media` endpoint, with fallbacks to legacy routes.
   * @param replyid Optional WhatsApp message_id being replied to
   */
  async sendMedia(
    kind: UazapiMediaKind,
    number: string,
    mediaUrl: string,
    caption?: string,
    fileName?: string,
    replyid?: string,
  ): Promise<UazapiResult<UazapiSendMessageResponse>> {
    const capitalized = kind.charAt(0).toUpperCase() + kind.slice(1);
    const endpoints = [
      `/send/media`,
      `/send/${kind}`,
      `/send${capitalized}`,
      `/message/send${capitalized}`,
    ];

    const mediaType = kind === 'audio' ? 'ptt' : kind;

    const body: Record<string, unknown> = {
      number,
      media: mediaUrl,
      mediaUrl,
      file: mediaUrl,
      type: mediaType,
    };
    if (kind !== 'audio') {
      if (caption) body.caption = caption;
      if (kind === 'document' && fileName) body.fileName = fileName;
    }
    if (replyid) {
      body.replyid = replyid;
      body.reply_id = replyid;
      body.replyId = replyid;
    }

    let lastResult: UazapiResult<UazapiSendMessageResponse> | null = null;
    for (const path of endpoints) {
      const res = await this.request<UazapiSendMessageResponse>('POST', path, body);
      if (res.ok) return res;
      lastResult = res;
      if (res.status !== 404 && res.status !== 405) break;
    }

    return lastResult!;
  }

  /**
   * Send a reaction (or remove reaction with empty string "") to a message.
   * Tries Uazapi reaction paths (/message/react, /send/reaction, /react).
   */
  async sendReaction(
    number: string,
    messageId: string,
    emoji: string,
  ): Promise<UazapiResult<UazapiSendMessageResponse>> {
    const endpoints = ['/message/react', '/send/reaction', '/react'];
    const body: Record<string, unknown> = {
      id: messageId,
      number,
      phone: number,
      remoteJid: `${number}@s.whatsapp.net`,
      messageId,
      message_id: messageId,
      reaction: emoji,
      text: emoji,
      emoji,
      key: { id: messageId },
    };

    let lastResult: UazapiResult<UazapiSendMessageResponse> | null = null;
    for (const path of endpoints) {
      const res = await this.request<UazapiSendMessageResponse>('POST', path, body);
      if (res.ok) return res;
      lastResult = res;
      if (res.status !== 404 && res.status !== 405) break;
    }

    return lastResult!;
  }
}
