-- ============================================================
-- 037_uazapi_config.sql
-- ============================================================
-- Adds the `uazapi_config` table for unofficial WhatsApp API
-- integration via uazapi.com.
--
-- Design mirrors `whatsapp_config` and `ai_configs`:
--   - One row per account (UNIQUE account_id)
--   - instance_token is encrypted at rest (same AES-256-GCM as
--     whatsapp_config.access_token)
--   - RLS: any account member may SELECT; only admins may
--     INSERT/UPDATE/DELETE — consistent with the rest of the
--     settings-class tables.
-- ============================================================

CREATE TABLE IF NOT EXISTS uazapi_config (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  instance_url TEXT       NOT NULL,
  instance_token TEXT     NOT NULL, -- encrypted AES-256-GCM
  status       TEXT       NOT NULL DEFAULT 'disconnected'
                          CHECK (status IN ('disconnected', 'connecting', 'connected')),
  phone_number TEXT,
  connected_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(account_id)
);

-- Updated-at trigger (mirrors other settings tables)
DROP TRIGGER IF EXISTS uazapi_config_updated_at ON uazapi_config;
CREATE TRIGGER uazapi_config_updated_at
  BEFORE UPDATE ON uazapi_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Index for fast account lookup
CREATE INDEX IF NOT EXISTS idx_uazapi_config_account
  ON uazapi_config(account_id);

-- ── Row-Level Security ─────────────────────────────────────
ALTER TABLE uazapi_config ENABLE ROW LEVEL SECURITY;

-- Any account member may read the config (so all agents see
-- connection status without needing admin rights)
CREATE POLICY uazapi_config_select
  ON uazapi_config FOR SELECT
  USING (is_account_member(account_id));

-- Only admins may create/change/delete the config
CREATE POLICY uazapi_config_insert
  ON uazapi_config FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));

CREATE POLICY uazapi_config_update
  ON uazapi_config FOR UPDATE
  USING (is_account_member(account_id, 'admin'));

CREATE POLICY uazapi_config_delete
  ON uazapi_config FOR DELETE
  USING (is_account_member(account_id, 'admin'));
