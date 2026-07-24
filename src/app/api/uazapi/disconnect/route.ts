/**
 * POST /api/uazapi/disconnect
 *
 * Calls uazapi POST /instance/logout (best-effort) then resets
 * the `uazapi_config` row to disconnected state.
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

export async function POST() {
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
    .select('instance_url, instance_token')
    .eq('account_id', accountId)
    .maybeSingle();

  if (config) {
    let token: string;
    try {
      token = decrypt(config.instance_token);
    } catch {
      return NextResponse.json({ error: 'Failed to decrypt token' }, { status: 500 });
    }
    try {
      const client = new UazapiClient(config.instance_url, token);
      await client.logout(); // This is POST /instance/disconnect on Uazapi
    } catch {
      // intentionally swallowed
    }
  }

  // Set status to disconnected instead of deleting the config
  const { error } = await supabase
    .from('uazapi_config')
    .update({ status: 'disconnected', phone_number: null, connected_at: null })
    .eq('account_id', accountId);

  return NextResponse.json({ success: true });
}
