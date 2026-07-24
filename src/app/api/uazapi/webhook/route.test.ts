import { describe, expect, it, vi, beforeEach } from 'vitest';
import { POST } from './route';

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockSupabaseAdmin = {
  from: vi.fn(),
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabaseAdmin),
}));

vi.mock('@/lib/whatsapp/encryption', () => ({
  decrypt: vi.fn((token: string) => token),
}));

vi.mock('@/lib/contacts/dedupe', () => ({
  findExistingContact: vi.fn(),
  isUniqueViolation: vi.fn(() => false),
}));

vi.mock('@/lib/automations/engine', () => ({
  runAutomationsForTrigger: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/flows/engine', () => ({
  dispatchInboundToFlows: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/ai/auto-reply', () => ({
  dispatchInboundToAiReply: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/webhooks/deliver', () => ({
  dispatchWebhookEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/uazapi/media', () => ({
  downloadAndUploadUazapiMedia: vi.fn().mockResolvedValue('https://storage.example.com/media.jpg'),
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/uazapi/webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-key';
  });

  it('returns 401 when no token is provided', async () => {
    const request = new Request('http://localhost:3000/api/uazapi/webhook', {
      method: 'POST',
      body: JSON.stringify({ message: { text: 'Hello' } }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toEqual({ error: 'No instance token provided' });
  });

  it('returns 404 when instance config is not found in database', async () => {
    // Mock uazapi_config select returning null
    mockSupabaseAdmin.from.mockImplementation((table: string) => {
      if (table === 'uazapi_config') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        };
      }
      return {};
    });

    const request = new Request('http://localhost:3000/api/uazapi/webhook', {
      method: 'POST',
      headers: { token: 'invalid_token' },
      body: JSON.stringify({ message: { text: 'Hello' } }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data).toEqual({ error: 'Instance not found' });
  });

  it('successfully processes an incoming text message', async () => {
    const mockConfig = {
      account_id: 'acct-123',
      instance_token: 'valid_token',
      instance_url: 'https://uazapi.example.com',
      phone_number: '5511999999999',
    };

    const mockProfile = { user_id: 'user-123' };
    const mockContact = { id: 'contact-123', phone: '5511888888888', name: 'Test User' };
    const mockConv = { id: 'conv-123' };
    const mockSavedMsg = {
      id: 'msg-db-id',
      message_id: 'msg-123',
      content_type: 'text',
      content_text: 'Test message',
      created_at: new Date().toISOString(),
    };

    const { findExistingContact } = await import('@/lib/contacts/dedupe');
    vi.mocked(findExistingContact).mockResolvedValue(mockContact as any);

    mockSupabaseAdmin.from.mockImplementation((table: string) => {
      if (table === 'uazapi_config') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: mockConfig, error: null }),
            }),
          }),
        };
      }
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              limit: () => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'conversations') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: vi.fn().mockResolvedValue({ data: mockConv, error: null }),
                  }),
                }),
              }),
            }),
          }),
          update: () => ({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
      if (table === 'messages') {
        return {
          insert: () => ({
            select: () => ({
              single: vi.fn().mockResolvedValue({ data: mockSavedMsg, error: null }),
            }),
          }),
        };
      }
      return {};
    });

    const payload = {
      token: 'valid_token',
      event: 'messages.upsert',
      chat: { phone: '5511888888888', name: 'Test User' },
      message: {
        messageid: 'msg-123',
        messageTimestamp: 1700000000, // 10-digit timestamp in seconds
        fromMe: false,
        type: 'text',
        text: 'Test message',
      },
    };

    const request = new Request('http://localhost:3000/api/uazapi/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ success: true });
  });

  it('handles 13-digit millisecond timestamps without timezone overflow', async () => {
    const mockConfig = {
      account_id: 'acct-123',
      instance_token: 'valid_token',
      instance_url: 'https://uazapi.example.com',
    };

    const mockProfile = { user_id: 'user-123' };
    const mockContact = { id: 'contact-123' };
    const mockConv = { id: 'conv-123' };
    let savedMsgRecord: any = null;

    const { findExistingContact } = await import('@/lib/contacts/dedupe');
    vi.mocked(findExistingContact).mockResolvedValue(mockContact as any);

    mockSupabaseAdmin.from.mockImplementation((table: string) => {
      if (table === 'uazapi_config') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: mockConfig, error: null }),
            }),
          }),
        };
      }
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              limit: () => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'conversations') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: vi.fn().mockResolvedValue({ data: mockConv, error: null }),
                  }),
                }),
              }),
            }),
          }),
          update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        };
      }
      if (table === 'messages') {
        return {
          insert: (record: any) => {
            savedMsgRecord = record;
            return {
              select: () => ({
                single: vi.fn().mockResolvedValue({
                  data: { ...record, id: 'db-id-1' },
                  error: null,
                }),
              }),
            };
          },
        };
      }
      return {};
    });

    const msTimestamp = 1700000000000; // 13-digit timestamp in ms
    const payload = {
      token: 'valid_token',
      message: {
        messageid: 'msg-ms-123',
        messageTimestamp: msTimestamp,
        fromMe: false,
        text: 'Timestamp test',
      },
    };

    const request = new Request('http://localhost:3000/api/uazapi/webhook', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(savedMsgRecord).not.toBeNull();
    // Verify created_at year is 2023, not 58529
    expect(savedMsgRecord.created_at).toContain('2023-');
  });

  it('handles message deletion events correctly', async () => {
    const mockConfig = { account_id: 'acct-123', instance_token: 'valid_token' };
    const mockMsg = { id: 'msg-db-1' };

    mockSupabaseAdmin.from.mockImplementation((table: string) => {
      if (table === 'uazapi_config') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: mockConfig, error: null }),
            }),
          }),
        };
      }
      if (table === 'messages') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: mockMsg, error: null }),
            }),
          }),
          update: () => ({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
      return {};
    });

    const payload = {
      token: 'valid_token',
      event: 'messages.delete',
      message: { messageid: 'msg-to-delete' },
    };

    const request = new Request('http://localhost:3000/api/uazapi/webhook', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ success: true });
  });
});
