-- ============================================================
-- 039_message_edits_and_types.sql
-- ============================================================
-- 1. Adds `edited_at` and `deleted_at` to `messages`
-- 2. Creates `message_edits` table for edit history
-- 3. Expands `content_type` constraint to include 'contact', 'call', 'reaction'
-- ============================================================

-- 1. Add columns to messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 2. Create message_edits table
CREATE TABLE IF NOT EXISTS message_edits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  old_content_text TEXT,
  new_content_text TEXT,
  edited_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_message_edits_message_id ON message_edits(message_id);

ALTER TABLE message_edits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view message edits" ON message_edits;
DROP POLICY IF EXISTS "Service role can insert message edits" ON message_edits;

CREATE POLICY "Users can view message edits" ON message_edits FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM messages 
    JOIN conversations ON conversations.id = messages.conversation_id
    WHERE messages.id = message_edits.message_id 
    AND conversations.user_id = auth.uid()
  ));

CREATE POLICY "Service role can insert message edits" ON message_edits FOR INSERT WITH CHECK (true);

-- 3. Update content_type constraint on messages
-- First, drop the existing constraint (Postgres requires knowing the name, Supabase generates it as messages_content_type_check)
DO $$ 
BEGIN
  BEGIN
    ALTER TABLE messages DROP CONSTRAINT messages_content_type_check;
  EXCEPTION
    WHEN undefined_object THEN null;
  END;
END $$;

-- Add the new constraint with expanded types
ALTER TABLE messages ADD CONSTRAINT messages_content_type_check 
CHECK (content_type IN ('text', 'image', 'document', 'audio', 'video', 'location', 'template', 'interactive', 'contact', 'call', 'reaction'));
