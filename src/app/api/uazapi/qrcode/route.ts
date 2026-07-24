/**
 * GET /api/uazapi/qrcode
 *
 * Server-side proxy: decrypts the stored instance token and calls
 * uazapi's GET /instance/connect to obtain a fresh QR Code (base64).
 *
 * The token never reaches the browser — only the QR Code image data
 * is forwarded. Cache is disabled so every poll gets a fresh code.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { decrypt } from '@/lib/whatsapp/encryption';
import { UazapiClient } from '@/lib/uazapi/client';

async function resolveAccountId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', userId)
    .maybeSingle();
  return data?.account_id ?? null;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const accountId = await resolveAccountId(supabase, user.id);
  if (!accountId) {
    return NextResponse.json({ error: 'Profile not linked to an account' }, { status: 403 });
  }

  const { data: config, error: configError } = await supabase
    .from('uazapi_config')
    .select('instance_url, instance_token, instance_name')
    .eq('account_id', accountId)
    .maybeSingle();

  if (configError || !config) {
    return NextResponse.json(
      { error: 'No uazapi config found. Save your credentials first.' },
      { status: 404 },
    );
  }

  let token: string;
  try {
    token = decrypt(config.instance_token);
  } catch {
    return NextResponse.json(
      { error: 'Could not decrypt the stored token. Please re-save your credentials.' },
      { status: 500 },
    );
  }

  const client = new UazapiClient(config.instance_url, token);
  const result = await client.connect();

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status ?? 502 },
    );
  }

  // Update status to 'connecting' in the DB
  await supabase
    .from('uazapi_config')
    .update({ status: 'connecting', phone_number: null, connected_at: null })
    .eq('account_id', accountId);

  // Map Uazapi status to our frontend expectations
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = result.data as any;
  const uazapiStatus = raw?.instance?.status ?? result.data?.status;
  const isConnected = uazapiStatus === 'open' || uazapiStatus === 'connected';
  const finalStatus = isConnected ? 'connected' : uazapiStatus || 'disconnected';

  return NextResponse.json(
    {
      qrcode: raw?.instance?.qrcode || result.data?.qrcode,
      pairingCode: raw?.instance?.paircode || result.data?.pairingCode,
      status: finalStatus,
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
