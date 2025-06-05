ALTER TABLE public.email_interactions
ADD COLUMN postmark_reply_status JSONB NULL;

COMMENT ON COLUMN public.email_interactions.postmark_reply_status IS 'Stores the outcome of attempting to send a reply via Postmark (e.g., success, error, messageId, timestamp, or reason for skipping).';
