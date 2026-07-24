/**
 * GET /api/uazapi/status
 *
 * Server-side proxy: calls uazapi GET /instance/status and syncs
 * the result back to the `uazapi_config` row so other teammates
 * see the live status without a separate polling mechanism.
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
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { data: config, error: configError } = await supabase
    .from('uazapi_config')
    .select('instance_url, instance_token, instance_name, status')
    .eq('account_id', accountId)
    .maybeSingle();

  if (configError || !config) {
    return NextResponse.json({ status: 'disconnected' });
  }

  let token: string;
  try {
    token = decrypt(config.instance_token);
  } catch {
    return NextResponse.json({ status: 'disconnected', error: 'token_corrupted' });
  }

  const client = new UazapiClient(config.instance_url, token);
  const result = await client.getStatus();

  if (!result.ok) {
    return NextResponse.json({ status: 'disconnected', error: result.error });
  }

  // Extract nested values from Uazapi v2 instance object
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = result.data as any;
  const uazapiStatus = raw?.instance?.status ?? result.data?.status;
  const isConnected = uazapiStatus === 'open' || uazapiStatus === 'connected' || raw?.status?.connected === true;
  let finalStatus: 'disconnected' | 'connecting' | 'connected' = isConnected ? 'connected' : uazapiStatus || 'disconnected';
  if (finalStatus !== 'connected' && finalStatus !== 'connecting') finalStatus = 'disconnected';

  let phone = raw?.instance?.owner || raw?.jid || result.data?.phone;
  if (phone && phone.includes('@')) {
    phone = phone.split('@')[0];
  }

  // Persist status change and phone number (if newly connected)
  const updates: Record<string, unknown> = { status: finalStatus };
  if (finalStatus === 'connected' && phone) {
    updates.phone_number = phone;
    updates.connected_at = new Date().toISOString();
  } else if (finalStatus === 'disconnected') {
    updates.phone_number = null;
    updates.connected_at = null;
  }

  await supabase
    .from('uazapi_config')
    .update(updates)
    .eq('account_id', accountId);

  return NextResponse.json(
    { status: finalStatus, phone: phone || null },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
