-- Create the agent_email_mappings table
CREATE TABLE public.agent_email_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    agent_id TEXT NOT NULL CHECK (char_length(agent_id) > 0),
    email_address TEXT NOT NULL CHECK (char_length(email_address) > 0 AND email_address = lower(email_address)), -- Store lowercase
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agent_email_mappings_user_email_unique UNIQUE (user_id, email_address)
);

-- Add comments to the table and columns
COMMENT ON TABLE public.agent_email_mappings IS 'Stores mappings between user agents and email addresses that trigger them.';
COMMENT ON COLUMN public.agent_email_mappings.id IS 'Unique identifier for the mapping entry.';
COMMENT ON COLUMN public.agent_email_mappings.user_id IS 'Identifier of the user who owns this mapping.';
COMMENT ON COLUMN public.agent_email_mappings.agent_id IS 'Identifier of the Know Reply agent (e.g., from Know Reply API).';
COMMENT ON COLUMN public.agent_email_mappings.email_address IS 'Normalized (lowercase) email address mapped to the agent.';
COMMENT ON COLUMN public.agent_email_mappings.created_at IS 'Timestamp of when the mapping was created.';

-- Create indexes
CREATE INDEX idx_agent_email_mappings_user_agent ON public.agent_email_mappings(user_id, agent_id);
CREATE INDEX idx_agent_email_mappings_email ON public.agent_email_mappings(email_address);

-- Enable Row Level Security (RLS)
ALTER TABLE public.agent_email_mappings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Policy: Users can manage (select, insert, update, delete) their own agent email mappings.
CREATE POLICY "Users can manage their own agent email mappings"
ON public.agent_email_mappings
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Optional: Policy for service roles (e.g., for backend functions that might need broader access)
-- CREATE POLICY "Service roles can access all agent email mappings"
-- ON public.agent_email_mappings
-- FOR SELECT
-- USING (true); -- Or more specific role checks like is_claims_admin()
