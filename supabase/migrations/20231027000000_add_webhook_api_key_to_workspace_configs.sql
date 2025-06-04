-- Add webhook_api_key column to workspace_configs table
ALTER TABLE public.workspace_configs
ADD COLUMN webhook_api_key TEXT;

-- Add a unique constraint to the webhook_api_key column
-- This is important to ensure that each key is unique and can reliably identify a user.
-- Initially, allow NULLs as existing users won't have a key.
-- We might want to backfill or enforce NOT NULL later if all users must have one.
ALTER TABLE public.workspace_configs
ADD CONSTRAINT workspace_configs_webhook_api_key_unique UNIQUE (webhook_api_key);

-- Optional: Consider indexing this column if lookups by webhook_api_key will be frequent in the webhook.
-- A unique constraint often creates an index automatically, but explicitly:
CREATE INDEX IF NOT EXISTS idx_workspace_configs_webhook_api_key ON public.workspace_configs(webhook_api_key);
