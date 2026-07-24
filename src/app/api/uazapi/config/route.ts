/**
 * /api/uazapi/config
 *
 * GET  — returns the current account's uazapi config (token masked).
 * POST — saves or updates the instance URL + token (token encrypted at rest).
 * DELETE — removes the config and marks the connection as disconnected.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { encrypt, decrypt } from '@/lib/whatsapp/encryption';
import { UazapiClient } from '@/lib/uazapi/client';

const MASKED_TOKEN = '••••••••••••••••';

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

// ── GET ───────────────────────────────────────────────────────────────────────

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
    return NextResponse.json({ config: null });
  }

  const { data, error } = await supabase
    .from('uazapi_config')
    .select('id, instance_url, instance_token, instance_name, status, phone_number, connected_at, created_at')
    .eq('account_id', accountId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching uazapi_config:', error);
    return NextResponse.json({ error: 'Failed to load config' }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ config: null });
  }

  // Never return the raw token to the client
  return NextResponse.json({
    config: {
      ...data,
      instance_token: MASKED_TOKEN,
      has_token: true,
    },
  });
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
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

  let body: { instance_url?: string; instance_token?: string; instance_name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { instance_url, instance_token } = body;

  if (!instance_url || typeof instance_url !== 'string') {
    return NextResponse.json({ error: 'instance_url is required' }, { status: 400 });
  }

  // Normalise URL — remove trailing slash
  const normalisedUrl = instance_url.trim().replace(/\/$/, '');
  if (!normalisedUrl.startsWith('http')) {
    return NextResponse.json({ error: 'instance_url must start with http(s)://' }, { status: 400 });
  }

  // Fetch existing row to determine whether we're inserting or updating
  const { data: existing } = await supabase
    .from('uazapi_config')
    .select('id, instance_token')
    .eq('account_id', accountId)
    .maybeSingle();

  // If a new token is provided (not masked), encrypt it; otherwise keep the existing one
  let tokenToSave: string;
  if (instance_token && instance_token !== MASKED_TOKEN) {
    tokenToSave = encrypt(instance_token.trim());
  } else if (existing?.instance_token) {
    tokenToSave = existing.instance_token;
  } else {
    return NextResponse.json({ error: 'instance_token is required' }, { status: 400 });
  }

  // Optional: test connectivity before saving
  if (instance_token && instance_token !== MASKED_TOKEN) {
    const plainToken = instance_token.trim();
    const client = new UazapiClient(normalisedUrl, plainToken);
    const statusResult = await client.getStatus();
    if (!statusResult.ok && statusResult.status !== 401) {
      // 401 might just mean "not connected yet" on some uazapi builds — allow saving
      return NextResponse.json(
        { error: `Could not reach the instance: ${statusResult.error}` },
        { status: 422 },
      );
    }
  }

  if (existing) {
    const { error: updateError } = await supabase
      .from('uazapi_config')
      .update({
        instance_url: normalisedUrl,
        instance_name: 'default', // dummy value to satisfy NOT NULL constraint
        instance_token: tokenToSave,
        status: 'disconnected',
        phone_number: null,
        connected_at: null,
      })
      .eq('account_id', accountId);

    if (updateError) {
      console.error('Error updating uazapi_config:', updateError);
      return NextResponse.json({ error: 'Failed to save config' }, { status: 500 });
    }
  } else {
    const { error: insertError } = await supabase.from('uazapi_config').insert({
      account_id: accountId,
      instance_url: normalisedUrl,
      instance_name: 'default', // dummy value to satisfy NOT NULL constraint
      instance_token: tokenToSave,
      status: 'disconnected',
    });

    if (insertError) {
      console.error('Error inserting uazapi_config:', insertError);
      return NextResponse.json({ error: 'Failed to save config' }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE() {
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

  // Attempt to logout from uazapi before deleting local config
  const { data: existing } = await supabase
    .from('uazapi_config')
    .select('instance_url, instance_token, instance_name')
    .eq('account_id', accountId)
    .maybeSingle();

  if (existing) {
    const { error: deleteError } = await supabase
      .from('uazapi_config')
      .delete()
      .eq('account_id', accountId);

    if (deleteError) {
      console.error('Error deleting uazapi_config:', deleteError);
      return NextResponse.json({ error: 'Failed to remove config' }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}
