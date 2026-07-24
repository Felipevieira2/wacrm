// ─── uazapi API types ──────────────────────────────────────────────────────────
// Covers the endpoints used for instance management and QR Code connection.
// Ref: https://docs.uazapi.com

export type UazapiConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'timeout'
  | 'banned';

/** Response from GET /instance/connect */
export interface UazapiConnectResponse {
  /** Base64-encoded QR Code image (without the data:image prefix) */
  qrcode?: string;
  /** Plain-text pairing code alternative */
  pairingCode?: string;
  /** Connection status at the time of the request */
  status?: UazapiConnectionStatus;
}

/** Response from GET /instance/qrcode */
export interface UazapiQrCodeResponse {
  /** Base64-encoded QR Code image */
  qrcode?: string;
}

/** Response from GET /instance/status */
export interface UazapiStatusResponse {
  /** Current connection state */
  status: UazapiConnectionStatus;
  /** Phone number that is connected (E.164 format) */
  phone?: string;
  /** Display name from the connected WhatsApp profile */
  displayName?: string;
}

/** Response from POST /instance/logout */
export interface UazapiLogoutResponse {
  success: boolean;
}

/** Error shape returned by uazapi on 4xx/5xx */
export interface UazapiErrorResponse {
  error?: string;
  message?: string;
}

/** Result wrapper used internally — avoids try/catch at the call site */
export type UazapiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };
