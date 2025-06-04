// types.ts for postmark-webhook function

export interface PostmarkWebhookPayload {
  FromName: string
  MessageStream: string
  From: string
  FromFull: {
    Email: string
    Name: string
    MailboxHash: string
  }
  To: string
  ToFull: Array<{
    Email: string
    Name: string
    MailboxHash: string
  }>
  Cc: string
  CcFull: Array<{
    Email: string
    Name: string
    MailboxHash: string
  }>
  Bcc: string
  BccFull: Array<{
    Email: string
    Name: string
    MailboxHash: string
  }>
  OriginalRecipient: string
  Subject: string
  MessageID: string
  ReplyTo: string
  MailboxHash: string
  Date: string
  TextBody: string
  HtmlBody: string
  StrippedTextReply: string
  Tag: string
  Headers: Array<{
    Name: string
    Value: string
  }>
  Attachments: Array<{
    Name: string
    Content: string
    ContentType: string
    ContentLength: number
    ContentID: string
  }>
}

export interface KnowReplyRequestPayload {
  agent_id: string;
  email: {
    provider: string;
    sender: string;
    recipient: string;
    subject: string;
    body: string;
    headers: Record<string, string>;
    authentication: {
      spf_pass: boolean;
      spam_score?: number;
    };
    raw: PostmarkWebhookPayload;
  };
  mcp_results: any[]; // Consider defining a more specific type for MCP results if possible
  mcp_action_digest?: string;
}

export interface KnowReplyAgentConfig {
  agent_id: string
  mcp_endpoints: Array<{
    id: string
    name: string // This is the unique AI name for the action
    provider_name: string // e.g., "stripe", "hubspot"
    action_name: string // e.g., "getCustomerByEmail", "createTicket"
    // auth_token: string | null; // Removed, as auth is now handled by mcp_connection_params
    instructions?: string
    expected_format?: any
    // mcp_server_base_url is removed, post_url is also removed
    // active status is also needed if we filter by it before passing to executeMCPPlan
    active?: boolean
    output_schema?: any
  }>
}

export interface WorkspaceConfigWithUser {
  user_id: string;
  // Assuming these are the fields selected with '*' in index.ts from workspace_configs
  // Add or remove fields based on actual table structure and selection
  id?: string; // The primary key of the workspace_configs table itself
  created_at?: string;
  updated_at?: string;
  knowreply_api_token?: string | null;
  knowreply_webhook_url?: string | null;
  postmark_api_token?: string | null;
  postmark_webhook_url?: string | null; // This might be the old one, or just a stored value
  postmark_active?: boolean | null;
  postmark_inbound_hash?: string | null;
  postmark_server_id?: string | null;
  webhook_api_key?: string | null; // The new key used for authentication
  // Any other fields from workspace_configs that are relevant after a select '*'
}
