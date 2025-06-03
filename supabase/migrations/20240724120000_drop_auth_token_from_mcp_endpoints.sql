-- Migration script to drop the auth_token column from mcp_endpoints table

ALTER TABLE public.mcp_endpoints
DROP COLUMN IF EXISTS auth_token;

-- Add any additional statements here if necessary, for example,
-- to update policies or functions that might have referenced this column.
-- For this specific request, only dropping the column is required.

COMMENT ON COLUMN public.mcp_endpoints.category IS 'Stores the PascalCase category name of the provider, primarily for UI grouping. E.g., "Stripe", "HubSpot", "Custom". This is derived from provider_name but stored denormalized for convenience.';
COMMENT ON COLUMN public.mcp_endpoints.provider_name IS 'Stores the machine-friendly lowercase provider name. E.g., "stripe", "hubspot", "my_custom_api". This is used for MCP server routing and linking to connection parameters.';
COMMENT ON COLUMN public.mcp_endpoints.action_name IS 'The specific action/function name for the provider. E.g., "createCustomer", "get_user_details".';
COMMENT ON COLUMN public.mcp_endpoints.action_display_name IS 'A user-friendly name for the action, e.g., "Create Customer", "Get User Details". Displayed in UI lists.';
COMMENT ON COLUMN public.mcp_endpoints.expected_format IS 'JSONB field storing an example or schema of the expected payload format for the action (args part).';
COMMENT ON COLUMN public.mcp_endpoints.instructions IS 'Text field for any specific instructions or descriptions for using this action/tool.';
COMMENT ON COLUMN public.mcp_endpoints.active IS 'Boolean indicating if this configured action is currently active and available for use by the AI.';
COMMENT ON COLUMN public.mcp_endpoints.name IS 'The unique name for this tool/action, typically auto-generated (e.g., provider_action) but can be user-defined. Used by LLM to identify the tool.';
COMMENT ON COLUMN public.mcp_endpoints.mcp_server_base_url IS 'The base URL of the MCP server that handles this action. E.g., "https://mcp.knowreply.email" or a self-hosted URL.';

-- Re-grant permissions if necessary, though dropping a column typically doesn't revoke table-level permissions.
-- Supabase handles RLS policies separately. If any RLS policy specifically used the auth_token column in its expression (unlikely for this column), it would need adjustment.
-- However, standard RLS policies are based on user_id or auth.uid() and should not be affected.
