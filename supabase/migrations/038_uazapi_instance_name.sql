-- ============================================================
-- 038_uazapi_instance_name.sql
-- ============================================================
-- Adds the `instance_name` column to `uazapi_config`
-- The uazapi (Evolution API) requires the instance/session name
-- to be passed in the URL path (e.g. /instance/connect/my-session)
-- ============================================================

ALTER TABLE uazapi_config ADD COLUMN IF NOT EXISTS instance_name TEXT;

-- Set a default value for existing rows so we can make it NOT NULL
UPDATE uazapi_config SET instance_name = 'default' WHERE instance_name IS NULL;

ALTER TABLE uazapi_config ALTER COLUMN instance_name SET NOT NULL;
