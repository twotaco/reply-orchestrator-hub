import {
  assert,
  assertEquals,
  assertExists,
  assertMatch,
  assertNotEquals,
  assertThrows,
} from "https://deno.land/std@0.214.0/assert/mod.ts";
import { stub, spy, type Stub, type Spy, returnsNext } from "https://deno.land/std@0.214.0/testing/mock.ts";
import { generateMCPToolPlan, executeMCPPlan } from './index.ts'; // Assuming these are from mcpUtils or similar, not main index
import { processEmailWithKnowReply } from './agentManager.ts';
import { isSenderVerified } from './handlerUtils.ts'; // Import for direct testing
import type { PostmarkWebhookPayload, KnowReplyAgentConfig, KnowReplyRequestPayload } from './types.ts';

// Define McpEndpoint type based on KnowReplyAgentConfig
// Define PostmarkHeader type for isSenderVerified tests
type PostmarkHeader = { Name: string; Value: string };
type McpEndpoint = KnowReplyAgentConfig['mcp_endpoints'][number];


// --- Global Test Utilities ---
// Mock data definitions
const mockPostmarkPayload: PostmarkWebhookPayload = {
  FromName: 'Test User', MessageStream: 'inbound', From: 'user@example.com',
  FromFull: { Email: 'user@example.com', Name: 'Test User', MailboxHash: '' },
  To: 'support@example.com', ToFull: [{ Email: 'support@example.com', Name: 'Support', MailboxHash: '' }],
  Cc: '', CcFull: [], Bcc: '', BccFull: [], OriginalRecipient: 'support@example.com',
  Subject: 'Test Subject for MCP Digest', MessageID: 'test-msg-id-mcp', ReplyTo: '', MailboxHash: '',
  Date: new Date().toISOString(), TextBody: 'This is a test email for MCP action digest.',
  HtmlBody: '<p>This is a test email for MCP action digest.</p>', StrippedTextReply: '', Tag: '',
  Headers: [], Attachments: []
};

const mockWorkspaceConfig = {
  knowreply_webhook_url: 'https://test.knowreply.dev/webhook',
  knowreply_api_token: 'kr_test_token'
};

const mockAgentMappings = [
  { agent_id: 'agent_digest_test', mcp_endpoint_id: 'mcp_id_digest_1' }
];

const mockMcpEndpointConfigsList: McpEndpoint[] = [
  { id: 'mcp_id_digest_1', name: 'tool_fetch_order_details', instructions: 'Fetches order details by ID.', provider_name: 'test_shop', action_name: 'getOrder', active: true, output_schema: { orderId: "string", total: "number"} }
];

const mockMcpEndpointForSecondAction: McpEndpoint = {
    id: 'mcp_id_digest_2', name: 'tool_update_inventory', instructions: 'Updates inventory count.', provider_name: 'test_inv', action_name: 'updateInventory', active: true, output_schema: { success: "boolean" }
};


const TEST_MCP_SERVER_BASE_URL = "https://mcp.knowreply.email";

// Helper to mock fetch responses for Gemini
const mockGeminiFetch = (
  geminiResponseHandler: (url: URL | Request | string, options?: RequestInit) => Promise<Response>
): Stub<typeof globalThis, [input: string | Request | URL, init?: RequestInit | undefined], Promise<Response>> => {
  return stub(globalThis, "fetch", geminiResponseHandler);
};

// Enhanced Supabase client mock
interface MockSupabaseChain {
  select: (selectStr?: string) => Promise<{ data: any; error: any }> | MockSupabaseChain; // Can return a Promise or chain
  insert: (data: any) => Promise<{ error: any; data: any }>;
  update: (data: any) => MockSupabaseChain;
  eq: (column: string, value: any) => MockSupabaseChain;
  in: (column: string, values: any[]) => MockSupabaseChain;
  single: () => Promise<{ data: any; error: any }>;
}

const createMockSupabaseClient = (mocks: {
  workspaceConfigData?: any;
  workspaceConfigError?: any;
  agentMappingsData?: any[];
  agentMappingsError?: any;
  mcpEndpointsData?: McpEndpoint[];
  mcpEndpointsError?: any;
  mcpConnectionParamsData?: Record<string, { connection_values: any, error?: any }>;
  activityLogsInsertSpy?: Spy<any, any[], Promise<{ error: any; data: any; }>>;
  emailInteractionsUpdateResult?: any; // Should be an array
  emailInteractionsUpdateError?: any;
  llmLogsInsertSpy?: Spy<any, any[], Promise<{ error: any; data: any; }>>;
} = {}): any => {
  const defaultInsertSpy = spy(async (data: any) => ({ error: null, data: Array.isArray(data) ? data : [data] }));

  const createChain = (tableName: string): MockSupabaseChain => {
    let currentError: any = null;
    let currentData: any = null;

    const chainMethods: MockSupabaseChain = {
      select: function(this: MockSupabaseChain, _selectStr?: string) {
        // This is the key change: .select() now returns a Promise
        // for the tables that are typically awaited after filters.
        if (tableName === 'knowreply_agent_mcp_mappings') {
          return Promise.resolve({ data: mocks.agentMappingsData, error: mocks.agentMappingsError });
        }
        if (tableName === 'mcp_endpoints') {
          return Promise.resolve({ data: mocks.mcpEndpointsData, error: mocks.mcpEndpointsError });
        }
        if (tableName === 'email_interactions') { // This is for the .update().eq().select() case
            return Promise.resolve({data: mocks.emailInteractionsUpdateResult, error: mocks.emailInteractionsUpdateError});
        }
        return this; // Return chain for other cases or if more filters are expected
      },
      insert: mocks.llmLogsInsertSpy && tableName === 'llm_logs' ? mocks.llmLogsInsertSpy :
              mocks.activityLogsInsertSpy && tableName === 'activity_logs' ? mocks.activityLogsInsertSpy :
              defaultInsertSpy,
      update: function(this: MockSupabaseChain, _data: any) {
        currentError = mocks.emailInteractionsUpdateError; // Store error for the eventual select
        currentData = mocks.emailInteractionsUpdateResult; // Store data for the eventual select
        return this;
      },
      eq: function(this: MockSupabaseChain, _column: string, _value: any) {
        // Specific handling for mcp_connection_params still needs to drill down to single
        if (tableName === 'mcp_connection_params' && mocks.mcpConnectionParamsData && _column === 'user_id') {
            // This is a simplified version, assuming next .eq is for provider_name
            return {
                ...this,
                eq: (_providerField: string, providerName: string) => ({
                    ...this,
                    single: async () => {
                        const providerData = mocks.mcpConnectionParamsData![providerName];
                        return providerData
                            ? { data: providerData.connection_values, error: providerData.error }
                            : { data: null, error: { message: "Mock: Not found for provider " + providerName } };
                    }
                })
            } as MockSupabaseChain;
        }
        return this;
      },
      in: function(this: MockSupabaseChain, _column: string, _values: any[]) { return this; },
      single: async () => { // Default single, overridden for specific tables
        if (tableName === 'workspace_configs') {
          return { data: mocks.workspaceConfigData, error: mocks.workspaceConfigError };
        }
        return { data: currentData, error: currentError };
      },
    };
    return chainMethods;
  };

  return { from: createChain };
};

// Stub for Deno.env.get
let envGetStub: Stub<Deno.Env> | undefined;
// Stub for global fetch
let fetchStub: Stub<typeof globalThis> | undefined;
// Spy for KnowReply webhook payload
let capturedKnowReplyPayload: KnowReplyRequestPayload | null = null;
const MOCK_EMAIL_INTERACTION_ID = 'test_email_interaction_id_mcp_digest';
const MOCK_USER_ID = 'test_user_id_mcp_digest';


// --- Tests for processEmailWithKnowReply and mcpActionDigest ---

Deno.test("[processEmailWithKnowReply] should generate correct mcpActionDigest for successful single-step plan", async () => {
  const mockSupabase = createMockSupabaseClient({
    workspaceConfigData: mockWorkspaceConfig,
    agentMappingsData: mockAgentMappings,
    mcpEndpointsData: mockMcpEndpointConfigsList,
    mcpConnectionParamsData: { "test_shop": { connection_values: { api_key: "dummy_key" } } },
    activityLogsInsertSpy: spy(async (data: any) => ({ error: null, data })),
    emailInteractionsUpdateResult: [{ id: MOCK_EMAIL_INTERACTION_ID }],
    llmLogsInsertSpy: spy(async (data: any) => ({error: null, data})),
  });

  envGetStub = stub(Deno.env, "get", (key: string) => {
    if (key === 'GEMINI_API_KEY') return "test_gemini_api_key";
    if (key === 'MCP_SERVER_INTERNAL_API_KEY') return "test_mcp_internal_key";
    return undefined;
  });

  const mcpPlan = [{ tool: "tool_fetch_order_details", args: { orderId: "XYZ789" } }];
    const mcpResult = { tool_name: "tool_fetch_order_details", status: "success", response: { orderId: "XYZ789", total: 99.99 }, error_message: null }; // This is a mcpResults entry

  capturedKnowReplyPayload = null; // Reset before test
  fetchStub = stub(globalThis, "fetch", async (url: URL | Request | string, options?: RequestInit): Promise<Response> => {
    const urlString = url.toString();
    if (urlString.includes("generativelanguage.googleapis.com")) {
      return Promise.resolve(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(mcpPlan) }] } }] }), { status: 200 }));
    } else if (urlString.includes("/mcp/test_shop/getOrder")) { // Matches mockMcpEndpointConfigsList
      return Promise.resolve(new Response(JSON.stringify(mcpResult.response), { status: 200 })); // MCP executor expects direct data or error obj
    } else if (urlString === mockWorkspaceConfig.knowreply_webhook_url) {
      capturedKnowReplyPayload = JSON.parse(options!.body!.toString());
      return Promise.resolve(new Response(JSON.stringify({ message: "KnowReply OK" }), { status: 200 }));
    }
    // Fallback for any other Supabase internal fetches (e.g. auth) or unexpected calls
    console.warn(`Unhandled fetch mock for URL: ${urlString}`);
    return Promise.resolve(new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  });

  try {
    await processEmailWithKnowReply(mockSupabase, MOCK_USER_ID, mockPostmarkPayload, MOCK_EMAIL_INTERACTION_ID);

    assertExists(capturedKnowReplyPayload);
    assertExists(capturedKnowReplyPayload.mcp_action_digest);
    const expectedDigest = `Action 1: tool_fetch_order_details\nDescription: Fetches order details by ID.\nArguments: {"orderId":"XYZ789"}\nStatus: success\nOutput: ${JSON.stringify(mcpResult.response)}\n---`;
    assertEquals(capturedKnowReplyPayload.mcp_action_digest, expectedDigest);

  } finally {
    envGetStub?.restore();
    fetchStub?.restore();
    capturedKnowReplyPayload = null;
  }
});


Deno.test("[processEmailWithKnowReply] should generate correct mcpActionDigest for a failed MCP step", async () => {
  const mockSupabase = createMockSupabaseClient({
    workspaceConfigData: mockWorkspaceConfig,
    agentMappingsData: mockAgentMappings, // agent_digest_test -> mcp_id_digest_1 (tool_fetch_order_details)
    mcpEndpointsData: mockMcpEndpointConfigsList, // contains mcp_id_digest_1
    mcpConnectionParamsData: { "test_shop": { connection_values: { api_key: "dummy_key" } } },
    activityLogsInsertSpy: spy(async (data: any) => ({ error: null, data })),
    emailInteractionsUpdateResult: [{ id: MOCK_EMAIL_INTERACTION_ID }],
     llmLogsInsertSpy: spy(async (data: any) => ({error: null, data})),
  });

  envGetStub = stub(Deno.env, "get", (key: string) => {
    if (key === 'GEMINI_API_KEY') return "test_gemini_api_key";
    if (key === 'MCP_SERVER_INTERNAL_API_KEY') return "test_mcp_internal_key";
    return undefined;
  });

  const mcpPlanForFailure = [{ tool: "tool_fetch_order_details", args: { orderId: "FAIL123" } }];
  // This is what executeMCPPlan would return if the fetch to the MCP tool failed or the tool itself returned an error
  const mcpErrorResultPayload = { message: "MCP tool execution failed: Server error" }; // The actual response from the failed MCP endpoint

  capturedKnowReplyPayload = null;
  fetchStub = stub(globalThis, "fetch", async (url: URL | Request | string, options?: RequestInit): Promise<Response> => {
    const urlString = url.toString();
    if (urlString.includes("generativelanguage.googleapis.com")) {
      return Promise.resolve(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(mcpPlanForFailure) }] } }] }), { status: 200 }));
    } else if (urlString.includes("/mcp/test_shop/getOrder")) {
      // Simulate the MCP endpoint returning an error.
      // executeMCPPlan will catch this and format its mcpResults entry.
      return Promise.resolve(new Response(JSON.stringify(mcpErrorResultPayload), { status: 500, headers: { 'Content-Type': 'application/json' } }));
    } else if (urlString === mockWorkspaceConfig.knowreply_webhook_url) {
      capturedKnowReplyPayload = JSON.parse(options!.body!.toString());
      return Promise.resolve(new Response(JSON.stringify({ message: "KnowReply OK" }), { status: 200 }));
    }
    console.warn(`Unhandled fetch mock for URL: ${urlString}`);
    return Promise.resolve(new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  });

  try {
    await processEmailWithKnowReply(mockSupabase, MOCK_USER_ID, mockPostmarkPayload, MOCK_EMAIL_INTERACTION_ID);

    assertExists(capturedKnowReplyPayload);
    assertExists(capturedKnowReplyPayload.mcp_action_digest);
    // The error_message in mcpResults[i] is what executeMCPPlan crafts.
    // The actual error message from executeMCPPlan for a 500 response from the MCP tool (without specific error structure in response body)
    // might be simpler, like "Failed to execute tool X: MCP endpoint returned error status 500."
    // For this test, we are assuming executeMCPPlan stringifies the *response body* of the error if available.
    const expectedErrorMessageContent = `Failed to execute tool tool_fetch_order_details: MCP endpoint returned error status 500. Response: ${JSON.stringify(mcpErrorResultPayload)}`;
    const expectedDigest = `Action 1: tool_fetch_order_details\nDescription: Fetches order details by ID.\nArguments: {"orderId":"FAIL123"}\nStatus: error\nOutput: ${expectedErrorMessageContent}\n---`;
    assertEquals(capturedKnowReplyPayload.mcp_action_digest, expectedDigest);
  } finally {
    envGetStub?.restore();
    fetchStub?.restore();
    capturedKnowReplyPayload = null;
  }
});

Deno.test("[processEmailWithKnowReply] should result in empty mcpActionDigest if no MCP plan is generated", async () => {
    const mockSupabase = createMockSupabaseClient({
        workspaceConfigData: mockWorkspaceConfig,
        agentMappingsData: mockAgentMappings,
        mcpEndpointsData: mockMcpEndpointConfigsList,
        activityLogsInsertSpy: spy(async (data: any) => ({ error: null, data })),
        emailInteractionsUpdateResult: [{ id: MOCK_EMAIL_INTERACTION_ID }],
        llmLogsInsertSpy: spy(async (data: any) => ({error: null, data})),
    });

    envGetStub = stub(Deno.env, "get", (key: string) => {
        if (key === 'GEMINI_API_KEY') return "test_gemini_api_key";
        // No MCP_SERVER_INTERNAL_API_KEY needed if no plan execution
        return undefined;
    });

    capturedKnowReplyPayload = null;
    fetchStub = stub(globalThis, "fetch", async (url: URL | Request | string, options?: RequestInit): Promise<Response> => {
        const urlString = url.toString();
        if (urlString.includes("generativelanguage.googleapis.com")) {
            // Simulate Gemini returning no plan (empty array)
            return Promise.resolve(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify([]) }] } }] }), { status: 200 }));
        } else if (urlString === mockWorkspaceConfig.knowreply_webhook_url) {
            capturedKnowReplyPayload = JSON.parse(options!.body!.toString());
            return Promise.resolve(new Response(JSON.stringify({ message: "KnowReply OK" }), { status: 200 }));
        }
        console.warn(`Unhandled fetch mock for URL: ${urlString}`);
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    });

    try {
        await processEmailWithKnowReply(mockSupabase, MOCK_USER_ID, mockPostmarkPayload, MOCK_EMAIL_INTERACTION_ID);

        assertExists(capturedKnowReplyPayload);
        assertEquals(capturedKnowReplyPayload.mcp_action_digest, "");
    } finally {
        envGetStub?.restore();
        fetchStub?.restore();
        capturedKnowReplyPayload = null;
    }
});
// TODO: Add a test for plan/results length mismatch if time permits.
// TODO: Add a test for a multi-step plan and digest.


// --- Unit tests for isSenderVerified ---
Deno.test("[isSenderVerified] various scenarios (SPF check via X-Spam-Tests)", async (t) => {
  const baseFromEmail = 'user@example.com';

  await t.step("fully verified: All checks pass via X-Spam-Tests", () => {
    const headers: PostmarkHeader[] = [
      { Name: 'X-Spam-Tests', Value: 'DKIM_SIGNED,DKIM_VALID,DKIM_VALID_AU,SPF_PASS,OTHER_TEST' },
      { Name: 'X-Spam-Status', Value: 'No' },
      // Received-SPF is now irrelevant to the function's logic
      { Name: 'Received-SPF', Value: 'pass (sender IP is 1.2.3.4) envelope-from=user@example.com' },
    ];
    assert(isSenderVerified(headers, baseFromEmail), "Should be verified");
  });

  await t.step("User's scenario: All checks pass via X-Spam-Tests", () => {
    const userFromEmail = 'demo@knowreply.email';
    const headers: PostmarkHeader[] = [
      { Name: 'X-Spam-Tests', Value: 'DKIM_SIGNED,DKIM_VALID,DKIM_VALID_AU,SPF_PASS' },
      { Name: 'Received-SPF', Value: 'Pass (sender SPF authorized) identity=mailfrom; envelope-from=john@example.com;' }, // Irrelevant to new logic
      { Name: 'X-Spam-Status', Value: 'No' }
    ];
    assert(isSenderVerified(headers, userFromEmail), "Should be verified based on flags in X-Spam-Tests");
  });

  await t.step("SPF Fail (SPF_PASS missing in X-Spam-Tests)", () => {
    const headers: PostmarkHeader[] = [
      { Name: 'X-Spam-Tests', Value: 'DKIM_SIGNED,DKIM_VALID,DKIM_VALID_AU' }, // No SPF_PASS
      { Name: 'Received-SPF', Value: 'pass irrelevant string' }, // This header is now ignored
      { Name: 'X-Spam-Status', Value: 'No' }
    ];
    assert(!isSenderVerified(headers, baseFromEmail), "Should NOT be verified due to SPF_PASS missing");
  });

  await t.step("DKIM not signed (but SPF_PASS present)", () => {
    const headers: PostmarkHeader[] = [
      { Name: 'X-Spam-Tests', Value: 'DKIM_VALID,DKIM_VALID_AU,SPF_PASS' }, // Missing DKIM_SIGNED
      { Name: 'X-Spam-Status', Value: 'No' }
    ];
    assert(!isSenderVerified(headers, baseFromEmail), "Should NOT be verified due to DKIM not signed");
  });

  await t.step("DKIM not valid (but SPF_PASS present)", () => {
    const headers: PostmarkHeader[] = [
      { Name: 'X-Spam-Tests', Value: 'DKIM_SIGNED,DKIM_VALID_AU,SPF_PASS' }, // Missing DKIM_VALID
      { Name: 'X-Spam-Status', Value: 'No' }
    ];
    assert(!isSenderVerified(headers, baseFromEmail), "Should NOT be verified due to DKIM not valid");
  });

  await t.step("DKIM not aligned (DKIM_VALID_AU missing, but SPF_PASS present)", () => {
    const headers: PostmarkHeader[] = [
      { Name: 'X-Spam-Tests', Value: 'DKIM_SIGNED,DKIM_VALID,SPF_PASS' }, // DKIM_VALID_AU is missing
      { Name: 'X-Spam-Status', Value: 'No' }
    ];
    assert(!isSenderVerified(headers, baseFromEmail), "Should NOT be verified due to DKIM not aligned");
  });

  await t.step("X-Spam-Status is Yes (all other checks pass in X-Spam-Tests)", () => {
    const headers: PostmarkHeader[] = [
      { Name: 'X-Spam-Tests', Value: 'DKIM_SIGNED,DKIM_VALID,DKIM_VALID_AU,SPF_PASS' },
      { Name: 'X-Spam-Status', Value: 'Yes, score=7.0' }
    ];
    assert(!isSenderVerified(headers, baseFromEmail), "Should NOT be verified due to X-Spam-Status Yes");
  });

  // The following two tests for "misaligned SPF" and "subdomain SPF" are now effectively testing
  // the same core logic: if DKIM is aligned for From and SPF_PASS is in X-Spam-Tests, it passes.
  // The details of envelope-from in Received-SPF are irrelevant to the new function logic.
  await t.step("Verified: DKIM Aligned (From) and SPF_PASS in X-Spam-Tests (Received-SPF irrelevant)", () => {
    const headers: PostmarkHeader[] = [
      { Name: 'Received-SPF', Value: 'pass (sender IP is 1.2.3.4) envelope-from=user@another-domain.com' }, // Irrelevant
      { Name: 'X-Spam-Tests', Value: 'DKIM_SIGNED,DKIM_VALID,DKIM_VALID_AU,SPF_PASS' },
      { Name: 'X-Spam-Status', Value: 'No' }
    ];
    assert(isSenderVerified(headers, baseFromEmail), "Should be verified based on X-Spam-Tests flags");
  });

  // This test becomes redundant with the one above, but keeping structure for clarity of transition
   await t.step("Verified: DKIM Aligned (From) and SPF_PASS in X-Spam-Tests (Received-SPF with subdomain irrelevant)", () => {
    const headers: PostmarkHeader[] = [
      { Name: 'Received-SPF', Value: 'pass (sender IP is 1.2.3.4) envelope-from=user@sub.example.com' }, // Irrelevant
      { Name: 'X-Spam-Tests', Value: 'DKIM_SIGNED,DKIM_VALID,DKIM_VALID_AU,SPF_PASS' },
      { Name: 'X-Spam-Status', Value: 'No' }
    ];
    assert(isSenderVerified(headers, baseFromEmail), "Should be verified based on X-Spam-Tests flags");
  });

  // Test for "missing Received-SPF header" is removed as it's no longer used by the function.

  await t.step("missing X-Spam-Tests header", () => {
    const headers: PostmarkHeader[] = [
      { Name: 'Received-SPF', Value: 'pass (sender IP is 1.2.3.4) envelope-from=user@example.com' },
      { Name: 'X-Spam-Status', Value: 'No' }
    ];
    assert(!isSenderVerified(headers, baseFromEmail), "Should NOT be verified due to missing X-Spam-Tests");
  });

  await t.step("X-Spam-Tests header present but empty", () => {
    const headers: PostmarkHeader[] = [
      { Name: 'Received-SPF', Value: 'pass (sender IP is 1.2.3.4) envelope-from=user@example.com' },
      { Name: 'X-Spam-Tests', Value: '' },
      { Name: 'X-Spam-Status', Value: 'No' }
    ];
    assert(!isSenderVerified(headers, baseFromEmail), "Should NOT be verified due to empty X-Spam-Tests");
  });

  await t.step("empty headers array", () => {
    const headers: PostmarkHeader[] = [];
    assert(!isSenderVerified(headers, baseFromEmail), "Should NOT be verified with empty headers array");
  });

  await t.step("empty fromEmail", () => {
    const headers: PostmarkHeader[] = [
      { Name: 'Received-SPF', Value: 'pass (sender IP is 1.2.3.4) envelope-from=user@example.com' },
      { Name: 'X-Spam-Tests', Value: 'DKIM_SIGNED,DKIM_VALID,DKIM_VALID_AU' },
      { Name: 'X-Spam-Status', Value: 'No' }
    ];
    assert(!isSenderVerified(headers, ""), "Should NOT be verified with empty fromEmail");
  });
   await t.step("null headers", () => {
    assert(!isSenderVerified(null as any, baseFromEmail), "Should handle null headers gracefully");
  });
  await t.step("null fromEmail", () => {
     const headers: PostmarkHeader[] = [ { Name: 'Received-SPF', Value: 'pass' }];
    assert(!isSenderVerified(headers, null as any), "Should handle null fromEmail gracefully");
  });
});

// --- Integration tests for processEmailWithKnowReply focusing on sender verification ---

Deno.test("[processEmailWithKnowReply] Sender NOT Verified - skips MCP actions", async () => {
  const activityLogsInsertSpy = spy(async (data: any) => ({ error: null, data }));
  const mockSupabase = createMockSupabaseClient({
    workspaceConfigData: mockWorkspaceConfig,
    agentMappingsData: mockAgentMappings, // These won't be used if MCP is skipped
    mcpEndpointsData: mockMcpEndpointConfigsList,
    activityLogsInsertSpy: activityLogsInsertSpy, // Specific spy for this table
    emailInteractionsUpdateResult: [{ id: MOCK_EMAIL_INTERACTION_ID }],
    llmLogsInsertSpy: spy(async (data: any) => ({ error: null, data })), // Gemini won't be called
  });

  envGetStub = stub(Deno.env, "get", (key: string) => {
    // GEMINI_API_KEY might be checked before sender verification, or not.
    // For this test, we assume it's available, but sender verification will prevent its use.
    if (key === 'GEMINI_API_KEY') return "test_gemini_api_key";
    return undefined;
  });

  const unverifiedHeaders: PostmarkHeader[] = [
    { Name: 'Received-SPF', Value: 'fail (bad IP)' },
    { Name: 'X-Spam-Tests', Value: 'DKIM_SIGNED,DKIM_VALID,DKIM_VALID_AU' }, // DKIM might be fine
    { Name: 'X-Spam-Status', Value: 'No' }
  ];
  const testPayloadUnverified: PostmarkWebhookPayload = {
    ...mockPostmarkPayload, // Use base mock payload
    Headers: unverifiedHeaders,
    From: 'sender@unverified.com', // Ensure From matches FromFull.Email for consistency
    FromFull: { Email: 'sender@unverified.com', Name: 'Unverified Sender', MailboxHash: '' },
    MessageID: 'unverified-test-msg-id',
  };

  let geminiFetchCalled = false;
  capturedKnowReplyPayload = null;

  fetchStub = stub(globalThis, "fetch", async (url: URL | Request | string, options?: RequestInit): Promise<Response> => {
    const urlString = url.toString();
    if (urlString.includes("generativelanguage.googleapis.com")) {
      geminiFetchCalled = true;
      // This should ideally not be called. If it is, return empty plan.
      return Promise.resolve(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify([]) }] } }] }), { status: 200 }));
    } else if (urlString.includes("/mcp/")) { // Any MCP call
      throw new Error("MCP execution fetch should not have been called for unverified sender!");
    } else if (urlString === mockWorkspaceConfig.knowreply_webhook_url) {
      capturedKnowReplyPayload = JSON.parse(options!.body!.toString());
      return Promise.resolve(new Response(JSON.stringify({ message: "KnowReply OK" }), { status: 200 }));
    }
    return Promise.resolve(new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  });

  try {
    await processEmailWithKnowReply(mockSupabase, MOCK_USER_ID, testPayloadUnverified, "emailInteractionUnverified");

    assert(!geminiFetchCalled, "Gemini fetch for plan generation should NOT have been called for unverified sender.");
    assertExists(capturedKnowReplyPayload);
    assert(
      capturedKnowReplyPayload?.mcp_action_digest?.includes("Sender email could not be verified"),
      `Digest should indicate sender verification failed. Got: ${capturedKnowReplyPayload?.mcp_action_digest}`
    );
    assertEquals(capturedKnowReplyPayload?.mcp_results?.length, 0, "MCP results should be empty for unverified sender");

    assert(activityLogsInsertSpy.calls.length >= 1, "Activity log should have at least one call");
    const senderVerificationLog = activityLogsInsertSpy.calls.find(call => {
        const logEntry = Array.isArray(call.args[0]) ? call.args[0][0] : call.args[0];
        return logEntry?.action === 'sender_verification_failed';
    });
    assertExists(senderVerificationLog, "Activity log for 'sender_verification_failed' should exist.");
    const logDetails = (Array.isArray(senderVerificationLog.args[0]) ? senderVerificationLog.args[0][0] : senderVerificationLog.args[0]).details;
    assertEquals(logDetails?.from_email, 'sender@unverified.com');

  } finally {
    envGetStub?.restore();
    fetchStub?.restore();
    capturedKnowReplyPayload = null;
  }
});


Deno.test("[processEmailWithKnowReply] Sender IS Verified - proceeds with MCP actions", async () => {
  const activityLogsInsertSpy = spy(async (data: any) => ({ error: null, data }));
  const mockSupabase = createMockSupabaseClient({
    workspaceConfigData: mockWorkspaceConfig,
    agentMappingsData: mockAgentMappings,
    mcpEndpointsData: mockMcpEndpointConfigsList, // tool_fetch_order_details
    mcpConnectionParamsData: { "test_shop": { connection_values: { api_key: "dummy_key" } } },
    activityLogsInsertSpy: activityLogsInsertSpy,
    emailInteractionsUpdateResult: [{ id: MOCK_EMAIL_INTERACTION_ID }],
    llmLogsInsertSpy: spy(async (data: any) => ({ error: null, data })),
  });

  envGetStub = stub(Deno.env, "get", (key: string) => {
    if (key === 'GEMINI_API_KEY') return "test_gemini_api_key";
    if (key === 'MCP_SERVER_INTERNAL_API_KEY') return "test_mcp_internal_key";
    return undefined;
  });

  const verifiedHeaders: PostmarkHeader[] = [
    { Name: 'Received-SPF', Value: 'pass (sender IP is 1.2.3.4) envelope-from=sender@verified.com' },
    { Name: 'X-Spam-Tests', Value: 'DKIM_SIGNED,DKIM_VALID,DKIM_VALID_AU' },
    { Name: 'X-Spam-Status', Value: 'No' }
  ];
  const testPayloadVerified: PostmarkWebhookPayload = {
    ...mockPostmarkPayload,
    Headers: verifiedHeaders,
    From: 'sender@verified.com',
    FromFull: { Email: 'sender@verified.com', Name: 'Verified Sender', MailboxHash: '' },
    MessageID: 'verified-test-msg-id',
  };

  const mcpPlan = [{ tool: "tool_fetch_order_details", args: { orderId: "VERIFIED123" } }];
  const mcpExecutionResult = { orderId: "VERIFIED123", status: "processed" };
  let geminiFetchCalled = false;
  let mcpFetchCalled = false;
  capturedKnowReplyPayload = null;

  fetchStub = stub(globalThis, "fetch", async (url: URL | Request | string, options?: RequestInit): Promise<Response> => {
    const urlString = url.toString();
    if (urlString.includes("generativelanguage.googleapis.com")) {
      geminiFetchCalled = true;
      return Promise.resolve(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(mcpPlan) }] } }] }), { status: 200 }));
    } else if (urlString.includes("/mcp/test_shop/getOrder")) {
      mcpFetchCalled = true;
      return Promise.resolve(new Response(JSON.stringify(mcpExecutionResult), { status: 200 }));
    } else if (urlString === mockWorkspaceConfig.knowreply_webhook_url) {
      capturedKnowReplyPayload = JSON.parse(options!.body!.toString());
      return Promise.resolve(new Response(JSON.stringify({ message: "KnowReply OK" }), { status: 200 }));
    }
    return Promise.resolve(new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  });

  try {
    await processEmailWithKnowReply(mockSupabase, MOCK_USER_ID, testPayloadVerified, "emailInteractionVerified");

    assert(geminiFetchCalled, "Gemini fetch for plan generation SHOULD have been called for verified sender.");
    assert(mcpFetchCalled, "MCP fetch for plan execution SHOULD have been called for verified sender.");
    assertExists(capturedKnowReplyPayload);
    assert(
      !capturedKnowReplyPayload?.mcp_action_digest?.includes("Sender email could not be verified"),
      "Digest should NOT indicate sender verification failed."
    );
    assert(
      capturedKnowReplyPayload?.mcp_action_digest?.includes("Action 1: tool_fetch_order_details"),
      "Digest should contain MCP action details."
    );
    assertExists(capturedKnowReplyPayload?.mcp_results);
    assertEquals(capturedKnowReplyPayload?.mcp_results?.length, 1);

    const senderVerificationLogFound = activityLogsInsertSpy.calls.some(call => {
        const logEntry = Array.isArray(call.args[0]) ? call.args[0][0] : call.args[0];
        return logEntry?.action === 'sender_verification_failed';
    });
    assert(!senderVerificationLogFound, "Activity log for 'sender_verification_failed' should NOT exist for verified sender.");

  } finally {
    envGetStub?.restore();
    fetchStub?.restore();
    capturedKnowReplyPayload = null;
  }
});
