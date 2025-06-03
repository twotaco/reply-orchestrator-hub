-- Create mcp_connection_params table
CREATE TABLE mcp_connection_params (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id),
    provider_name TEXT NOT NULL,
    connection_values JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add unique constraint
ALTER TABLE mcp_connection_params
ADD CONSTRAINT mcp_connection_params_user_provider_unique UNIQUE (user_id, provider_name);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_mcp_connection_params_updated_at
BEFORE UPDATE ON mcp_connection_params
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

-- Enable Row Level Security
ALTER TABLE mcp_connection_params ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Allow users to SELECT their own records"
ON mcp_connection_params
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Allow users to INSERT records for their own user_id"
ON mcp_connection_params
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow users to UPDATE their own records"
ON mcp_connection_params
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow users to DELETE their own records"
ON mcp_connection_params
FOR DELETE
USING (auth.uid() = user_id);
