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

      console.log(`[UAZAPI DEBUG] ${method} ${path} ->`, data);

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
}
