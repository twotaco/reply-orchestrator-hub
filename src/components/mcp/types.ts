// This file will contain the MCP related types.

export interface MCPEndpoint {
  id: string;
  name: string; // User-defined name for the AI to identify this tool, e.g., "stripe_getCustomerByEmail"
  category: string;
  mcp_server_base_url?: string; // Base URL of the MCP server, e.g., "http://localhost:8000"
  provider_name?: string; // e.g., "stripe", "hubspot"
  action_name?: string; // e.g., "getCustomerByEmail", "createTicket"
  action_display_name?: string; // User-friendly display name for the action
  expected_format?: any;
  output_schema?: any; // Added output_schema here as well, as it's part of the DB table
  instructions?: string;
  active: boolean;
  created_at: string;
  updated_at: string;
  // post_url is deprecated, will be constructed from base_url, provider_name, action_name by the MCP server
}

export interface DiscoveredProviderAction {
  action_name: string;
  display_name: string;
  description?: string;
  sample_payload?: any;
  output_schema?: any;
  args_schema?: any;   // This is the field to be added/ensured
}

export interface DiscoveredProvider {
  provider_name: string;
  display_name: string;
  description?: string;
  // mcp_server_type field removed
  actions: DiscoveredProviderAction[];
  connection_schema?: any;
}

export interface MCPConnectionParamRecord {
  id: string;
  user_id: string;
  provider_name: string;
  connection_values: Record<string, any>; // Represents the JSONB content
  created_at: string;
  updated_at: string;
}

export interface MCPForm {
  name: string; // User-defined name, will be used as the identifier for the LLM
  selected_provider_name: string; // Renamed from category
  mcp_server_base_url: string;
  provider_name: string; // This will be set from selected_provider_name, or manually if custom
  action_name: string;
  // auth_token: string; // API key for the target provider - Now part of connectionParams
  connectionParams: Record<string, string>;
  expected_format: string;
  instructions: string;
  // active: boolean; // Removed: Top-level active is deprecated
  // stripe_tools and server_type are deprecated in this new model
}

export interface ConfiguredActionData {
  id?: string; // ID of the saved MCPEndpoint, if this action is already configured/saved
  ai_name: string;
  // auth_token: string; // Removed: API key is now provider-level
  is_selected: boolean;
  active: boolean; // Reflects the 'active' status from the database, used by the switch if already saved
  action_name: string;
  provider_name: string;
  instructions?: string;
  sample_payload?: string;
  display_name?: string;
  output_schema?: any;
  args_schema?: any; // Ensure this is present for ConfiguredActionData
}
