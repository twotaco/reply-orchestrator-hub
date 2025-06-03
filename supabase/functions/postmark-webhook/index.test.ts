import {
  assert,
  assertEquals,
  assertExists,
  assertMatch,
  assertNotEquals,
  assertThrows,
} from "https://deno.land/std@0.214.0/assert/mod.ts";
import { stub, spy, returnsNext } from "https://deno.land/std@0.214.0/testing/mock.ts";

// Assuming functions are exported from index.ts, e.g.:
// export { generateMCPToolPlan, executeMCPPlan };
// Adjust path as necessary if your compiled/transpiled output is different
// For Deno functions, direct import from .ts should work.
import { generateMCPToolPlan, executeMCPPlan } from './index.ts';

// --- Mocking Setup ---
let originalFetch: typeof globalThis.fetch;

// Helper to mock fetch responses for OpenAI (legacy, keep if other tests use it)
// const mockOpenAIFetch = (response: any, status: number = 200, ok: boolean = true) => {
//   return stub(globalThis, "fetch", returnsNext([
//     Promise.resolve(new Response(JSON.stringify(response), { status, statusText: ok ? "OK" : "Error" }))
//   ]));
// };

// Updated helper to mock fetch for Gemini
const mockGeminiFetch = (
  geminiResponseHandler: (url: URL | Request | string, options?: RequestInit) => Promise<Response>
) => {
  return stub(globalThis, "fetch", geminiResponseHandler);
};

// Define the fixed MCP server base URL for use in tests, matching index.ts
const TEST_MCP_SERVER_BASE_URL = "https://mcp.knowreply.email";

// Mock Supabase client
const mockSupabaseClient = {
  from: function (_tableName: string) {
    return {
      insert: async (data: any) => {
        // console.log(`Mock Supabase insert into ${_tableName}:`, data);
        // This can be spied on or further mocked per test
        return { error: null, data: data };
      },
    };
  },
};

Deno.test("[generateMCPToolPlan with Gemini] should generate a plan successfully", async () => {
  const mockApiKey = "test-gemini-key";
  const expectedPlan = [{ tool: "mcp:stripe.getCustomer", args: { email: "test@example.com" } }];
  const geminiResponse = {
    candidates: [{
      content: { parts: [{ text: JSON.stringify(expectedPlan) }], role: "model" },
      finishReason: "STOP"
    }]
  };
  const mockAvailableMcps = [
    {
      name: "mcp:stripe.getCustomer",
      instructions: "Get customer from Stripe by email",
      provider_name: "stripe", // No mcp_server_base_url here
      action_name: "getCustomer",
      auth_token: "sk_test_mock",
      expected_format: {},
      active: true,
    }
  ];

  const fetchStub = mockGeminiFetch(async (url, options) => {
    assert(url.toString().startsWith(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${mockApiKey}`), "Gemini API URL is incorrect");
    assert(options?.method === "POST", "HTTP method should be POST");
    const body = JSON.parse(options!.body!.toString());
    assertExists(body.contents, "Gemini request body should have 'contents'");
    const promptText = body.contents[0].parts[0].text;
    assert(promptText.includes(mockAvailableMcps[0].name), "MCP name not in prompt");
    assert(promptText.includes(mockAvailableMcps[0].instructions), "MCP instructions not in prompt");
    assertEquals(body.generationConfig?.response_mime_type, "application/json", "response_mime_type should be application/json");
    return Promise.resolve(new Response(JSON.stringify(geminiResponse), { status: 200 }));
  });
  const insertSpy = spy(mockSupabaseClient.from("llm_logs"), "insert");

  try {
    const plan = await generateMCPToolPlan(
      "Test email body about stripe customer",
      mockAvailableMcps,
      mockApiKey,
      mockSupabaseClient,
      "test-user-id",
      "test-email-interaction-id"
    );

    assertEquals(plan, expectedPlan);
    assertEquals(fetchStub.calls.length, 1, "Fetch was not called exactly once");

    assertEquals(insertSpy.calls.length, 1, "Supabase insert for llm_logs was not called");
    const logData = insertSpy.calls[0].args[0][0];
    assertEquals(logData.user_id, "test-user-id");
    assertEquals(logData.model_used, "gemini-pro");
    assertEquals(logData.tool_plan_generated, expectedPlan);
    assertExists(logData.prompt_messages[0].parts[0].text, "Prompt text not logged correctly for Gemini");
    assert(logData.prompt_messages[0].parts[0].text.includes(JSON.stringify([{name: mockAvailableMcps[0].name, description: mockAvailableMcps[0].instructions}],null,2)));


  } finally {
    fetchStub.restore(); // Restore original fetch
    insertSpy.restore();
  }
});

Deno.test("[generateMCPToolPlan with Gemini] should handle Gemini API error", async () => {
  const mockApiKey = "test-gemini-key";
  const geminiErrorResponse = { error: { code: 500, message: "Gemini Internal Server Error" } };
   const mockAvailableMcps = [{
     name: "mcp:test.tool",
     instructions: "Test tool",
     provider_name:"b",  // No mcp_server_base_url
     action_name:"c",
     auth_token: "test_token",
     expected_format: {},
     active: true,
    }];


  const fetchStub = mockGeminiFetch(async (url) => {
    assert(url.toString().includes(mockApiKey), "Gemini API key not in URL");
    return Promise.resolve(new Response(JSON.stringify(geminiErrorResponse), { status: 500, statusText: "Internal Server Error" }));
  });
  const insertSpy = spy(mockSupabaseClient.from("llm_logs"), "insert");

  try {
    const plan = await generateMCPToolPlan(
      "Test email body",
      mockAvailableMcps,
      mockApiKey,
      mockSupabaseClient,
      "test-user-id",
      "test-email-interaction-id"
    );
    assertEquals(plan, null, "Plan should be null on API error");
    assertEquals(insertSpy.calls.length, 1, "Supabase insert for llm_logs was not called even on error");
    const logData = insertSpy.calls[0].args[0][0];
    assertExists(logData.error_message, "Error message should be logged");
    assert(logData.error_message!.includes("Gemini API error"), "Error message should specify Gemini");

  } finally {
    fetchStub.restore();
    insertSpy.restore();
  }
});

Deno.test("[generateMCPToolPlan with Gemini] should return empty array if no tools needed", async () => {
    const mockApiKey = "test-gemini-key";
    const geminiResponseNoTools = {
        candidates: [{
            content: { parts: [{ text: JSON.stringify([]) }], role: "model" },
            finishReason: "STOP"
        }]
    };
    const mockAvailableMcps = [{
      name: "mcp:test.tool",
      instructions: "Test tool",
      provider_name:"b", // No mcp_server_base_url
      action_name:"c",
      auth_token: "test_token",
      expected_format: {},
      active: true,
    }];
    const fetchStub = mockGeminiFetch(async () => {
        return Promise.resolve(new Response(JSON.stringify(geminiResponseNoTools), { status: 200 }));
    });
    const insertSpy = spy(mockSupabaseClient.from("llm_logs"), "insert");

    try {
        const plan = await generateMCPToolPlan(
            "Thank you email",
            mockAvailableMcps,
            mockApiKey,
            mockSupabaseClient, "user1", "email1"
        );
        assertEquals(plan, []);
        assertEquals(insertSpy.calls.length, 1, "llm_log insert should be called");
        assertEquals(insertSpy.calls[0].args[0][0].tool_plan_generated, []);
    } finally {
        fetchStub.restore();
        insertSpy.restore();
    }
});

Deno.test("[generateMCPToolPlan with Gemini] should handle invalid JSON string in Gemini response text part", async () => {
    const mockApiKey = "test-gemini-key";
    const geminiResponseInvalidJsonText = {
        candidates: [{
            content: { parts: [{ text: "This is not JSON" }], role: "model" },
            finishReason: "STOP"
        }]
    };
    const mockAvailableMcps = [{
      name: "mcp:test.tool",
      instructions: "Test tool",
      provider_name:"b", // No mcp_server_base_url
      action_name:"c",
      auth_token: "test_token",
      expected_format: {},
      active: true,
    }];
    const fetchStub = mockGeminiFetch(async () => {
        return Promise.resolve(new Response(JSON.stringify(geminiResponseInvalidJsonText), { status: 200 }));
    });
    const insertSpy = spy(mockSupabaseClient.from("llm_logs"), "insert");

    try {
        const plan = await generateMCPToolPlan(
            "Test email",
            mockAvailableMcps,
            mockApiKey,
            mockSupabaseClient, "user1", "email1"
        );
        assertEquals(plan, null, "Plan should be null or empty for invalid JSON content");
        assertEquals(insertSpy.calls.length, 1, "llm_log insert should be called");
        const logData = insertSpy.calls[0].args[0][0];
        assertExists(logData.error_message, "Error message should be logged for invalid JSON");
        assert(logData.error_message!.includes("Error parsing JSON from Gemini response") || logData.error_message!.includes("LLM response JSON is not an array"), "Error message should indicate JSON parsing issue");

    } finally {
        fetchStub.restore();
        insertSpy.restore();
    }
});

Deno.test("[generateMCPToolPlan with Gemini] should handle SAFETY block", async () => {
  const mockApiKey = "test-gemini-key";
  const geminiSafetyBlockResponse = {
    candidates: [], // No candidates when blocked
    promptFeedback: {
      blockReason: "SAFETY",
      safetyRatings: [ /* ... some safety ratings data ... */ ]
    }
  };
  const mockAvailableMcps = [{
    name: "mcp:test.tool",
    instructions: "Test tool",
    provider_name:"b", // No mcp_server_base_url
    action_name:"c",
    auth_token: "test_token",
    expected_format: {},
    active: true,
  }];
   const fetchStub = mockGeminiFetch(async () => {
        return Promise.resolve(new Response(JSON.stringify(geminiSafetyBlockResponse), { status: 200 })); // Gemini might return 200 OK even if blocked
    });
  const insertSpy = spy(mockSupabaseClient.from("llm_logs"), "insert");

  try {
    const plan = await generateMCPToolPlan(
      "Problematic email body",
      mockAvailableMcps,
      mockApiKey,
      mockSupabaseClient, "user1", "email1"
    );
    assertEquals(plan, null, "Plan should be null when Gemini blocks due to safety");
    assertEquals(insertSpy.calls.length, 1, "llm_log insert should be called");
    const logData = insertSpy.calls[0].args[0][0];
    assertExists(logData.error_message, "Error message should be logged for safety block");
    assert(logData.error_message!.includes("Gemini response blocked due to safety settings"), "Error message should indicate safety block");
  } finally {
    fetchStub.restore();
    insertSpy.restore();
  }
});


Deno.test("[executeMCPPlan] successful execution of a single action", async () => {
  const mcpPlan = [{ tool: "mcp:stripe.payment", args: { amount: 100, currency: "usd" } }];
  const availableMcps = [{
    name: "mcp:stripe.payment",
    provider_name: "stripe", // No mcp_server_base_url
    action_name: "createPayment",
    auth_token: "sk_test_provider_key",
    instructions: "Creates a stripe payment",
    expected_format: {}, active: true
  }];

  originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assertEquals(url.toString(), `${TEST_MCP_SERVER_BASE_URL}/mcp/stripe/createPayment`);
    assert(options?.method === "POST");
    assertEquals(options?.headers?.['Content-Type'], "application/json");
    const body = JSON.parse(options!.body!.toString());
    assertEquals(body.args.amount, 100);
    assertEquals(body.auth.token, "sk_test_provider_key");
    return Promise.resolve(new Response(JSON.stringify({ success: true, paymentId: "pi_123" }), { status: 200 }));
  };
  const activityLogSpy = spy(mockSupabaseClient.from("activity_logs"), "insert");

  try {
    const results = await executeMCPPlan(
        mcpPlan,
        availableMcps,
        mockSupabaseClient,
        "user1",
        "email1"
    );

    assertEquals(results.length, 1);
    assertEquals(results[0].tool_name, "mcp:stripe.payment"); // Updated to match new mock
    assertEquals(results[0].status, "success");
    assertEquals(results[0].response?.paymentId, "pi_123"); // Updated to match new mock
    assert(activityLogSpy.calls.length > 0, "Activity log was not called");
    const activityLogDetails = activityLogSpy.calls[0].args[0][0].details;
    assertEquals(activityLogDetails.target_url, `${TEST_MCP_SERVER_BASE_URL}/mcp/stripe/createPayment`);


  } finally {
    globalThis.fetch = originalFetch;
    activityLogSpy.restore();
  }
});

Deno.test("[executeMCPPlan] MCP execution failure (HTTP error)", async () => {
    const mcpPlan = [{ tool: "mcp:failing.tool", args: { data: "bad_data" } }];
    const availableMcps = [{
      name: "mcp:failing.tool",
      provider_name: "failing_provider", // No mcp_server_base_url
      action_name: "doomed_action",
      auth_token: "irrelevant_key",
      expected_format: {}, active: true
    }];

    originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      assertEquals(url.toString(), `${TEST_MCP_SERVER_BASE_URL}/mcp/failing_provider/doomed_action`);
      assert(options?.method === "POST");
      assertEquals(options?.headers?.['Content-Type'], "application/json");
      const body = JSON.parse(options!.body!.toString());
      assertEquals(body.args.data, "bad_data");
      assertExists(body.auth.token === "irrelevant_key"); // Check auth token is passed
      return Promise.resolve(new Response(JSON.stringify({ error: "MCP Server Error" }), { status: 500, statusText: "Server Error" }));
    };
    const activityLogSpy = spy(mockSupabaseClient.from("activity_logs"), "insert");

    try {
        const results = await executeMCPPlan(mcpPlan, availableMcps, mockSupabaseClient, "user1", "email1");
        assertEquals(results.length, 1);
        assertEquals(results[0].status, "error");
        assertExists(results[0].error_message, "Error message should exist for failed MCP call");
        assert(results[0].error_message!.includes("MCP call failed"), "Error message content is incorrect");
        assert(activityLogSpy.calls.length > 0, "Activity log was not called");
        assertEquals(activityLogSpy.calls[0].args[0][0].status, "error");
    assertEquals(activityLogDetails.target_url, `${TEST_MCP_SERVER_BASE_URL}/mcp/failing_provider/doomed_action`);


    } finally {
        globalThis.fetch = originalFetch;
        activityLogSpy.restore();
    }
});

Deno.test("[executeMCPPlan] MCP returns non-JSON response (HTTP success)", async () => {
    const mcpPlan = [{ tool: "mcp:text.tool", args: { format: "text" } }];
    const availableMcps = [{
      name: "mcp:text.tool",
      provider_name: "text_provider", // No mcp_server_base_url
      action_name: "get_plain_text",
      auth_token: null,
      expected_format: {}, active: true
    }];

    originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
        assertEquals(url.toString(), `${TEST_MCP_SERVER_BASE_URL}/mcp/text_provider/get_plain_text`);
        assertEquals(options?.method, "POST");
        assertEquals(options?.headers?.['Content-Type'], "application/json");
        const body = JSON.parse(options!.body!.toString());
        assertEquals(body.args.format, "text");
        assertEquals(body.auth.token, null); // Ensure null token is handled
        return Promise.resolve(new Response("Plain text response", { status: 200 }));
    };
    const activityLogSpy = spy(mockSupabaseClient.from("activity_logs"), "insert");

    try {
        const results = await executeMCPPlan(mcpPlan, availableMcps, mockSupabaseClient, "user1", "email1");
        assertEquals(results.length, 1);
        assertEquals(results[0].status, "success");
        assertEquals(results[0].response, null);
        assertEquals(results[0].raw_response, "Plain text response");
        assert(activityLogSpy.calls.length > 0, "Activity log was not called");

    } finally {
        globalThis.fetch = originalFetch;
        activityLogSpy.restore();
    }
});

Deno.test("[executeMCPPlan] MCP tool not found in availableMcps", async () => {
    const mcpPlan = [{ tool: "mcp:ghost.tool", args: {} }];
    const availableMcps = [{
      name: "mcp:real.tool",
      provider_name: "real_provider", // No mcp_server_base_url
      action_name: "real_action",
      auth_token: "key", expected_format: {}, active: true
    }];
    const activityLogSpy = spy(mockSupabaseClient.from("activity_logs"), "insert");

    try {
        const results = await executeMCPPlan(mcpPlan, availableMcps, mockSupabaseClient, "user1", "email1");
        assertEquals(results.length, 1);
        assertEquals(results[0].status, "error");
        assert(results[0].error_message!.includes("MCP configuration not found for tool: mcp:ghost.tool"), "Error message for unknown tool is incorrect");
        assertEquals(activityLogSpy.calls.length, 1, "Activity log should be called for config error");
        assertEquals(activityLogSpy.calls[0].args[0][0].action, "mcp_execution_error");


    } finally {
      activityLogSpy.restore();
    }
});

Deno.test("[executeMCPPlan] MCP tool config incomplete (missing mcp_server_base_url)", async () => {
    const mcpPlan = [{ tool: "mcp:half_configured.tool", args: {} }];
    const availableMcps = [{
      name: "mcp:half_configured.tool",
      provider_name: "half_provider", // mcp_server_base_url is implicitly handled by fixed URL
      // action_name is missing for this test of incomplete config
      auth_token: "key", expected_format: {}, active: true
    }];
    const activityLogSpy = spy(mockSupabaseClient.from("activity_logs"), "insert");

    try {
        const results = await executeMCPPlan(mcpPlan, availableMcps, mockSupabaseClient, "user1", "email1");
        assertEquals(results.length, 1);
        assertEquals(results[0].status, "error");
        assert(results[0].error_message!.includes("MCP configuration incomplete or not found"), "Error message for incomplete config is incorrect");
        assert(results[0].error_message!.includes("action_name"), "Error message should mention missing field action_name");
    } finally {
      activityLogSpy.restore();
    }
});


Deno.test("[executeMCPPlan] Plan with multiple actions (success and failure)", async () => {
    const mcpPlan = [
        { tool: "mcp:first.success", args: { data: "good_call" } },
        { tool: "mcp:second.failure", args: { data: "bad_call" } }
    ];
    const availableMcps = [
        { name: "mcp:first.success", provider_name: "provider1", action_name: "actionA", auth_token: "token_success", instructions:"i1", expected_format:{}, active:true },
        { name: "mcp:second.failure", provider_name: "provider2", action_name: "actionB", auth_token: "token_fail", instructions:"i2", expected_format:{}, active:true }
    ];

    const fetchStub = stub(globalThis, "fetch", (url: URL | Request | string, options?: RequestInit) => {
        const urlString = url.toString();
        const body = options?.body ? JSON.parse(options.body.toString()) : {};

        if (urlString === `${TEST_MCP_SERVER_BASE_URL}/mcp/provider1/actionA`) {
            assertEquals(body.args.data, "good_call");
            assertEquals(body.auth.token, "token_success");
            return Promise.resolve(new Response(JSON.stringify({ result: "success_data_from_A" }), { status: 200 }));
        } else if (urlString.includes("/mcp/provider2/actionB")) {
            assertEquals(body.args.data, "bad_call");
            assertEquals(body.auth.token, "token_fail");
            return Promise.resolve(new Response(JSON.stringify({ error: "failure_data_from_B" }), { status: 500, statusText: "Server Error" }));
        }
        return Promise.resolve(new Response("Mock Not Found", { status: 404 }));
    });
    const activityLogSpy = spy(mockSupabaseClient.from("activity_logs"), "insert");

    try {
        const results = await executeMCPPlan(mcpPlan, availableMcps, mockSupabaseClient, "user1", "email1");
        assertEquals(results.length, 2);

        const successResult = results.find(r => r.tool_name === "mcp:first.success");
        assertExists(successResult);
        assertEquals(successResult.status, "success");
        assertEquals(successResult.response?.result, "success_data_from_A");

        const failureResult = results.find(r => r.tool_name === "mcp:second.failure");
        assertExists(failureResult);
        assertEquals(failureResult.status, "error");
        assert(failureResult.error_message!.includes("MCP call failed"), "Error message for failed tool in multi-action is incorrect");

        assertEquals(fetchStub.calls.length, 2, "Fetch should be called twice");
        assertEquals(activityLogSpy.calls.length, 2, "Activity log should be called twice");

    } finally {
        fetchStub.restore();
        activityLogSpy.restore();
    }
});

Deno.test("[executeMCPPlan] Placeholder argument warning", async () => {
    const mcpPlan = [{ tool: "mcp:placeholder.test", args: { param1: "{{placeholder_value}}", param2: "normal_value" } }];
    const availableMcps = [{
      name: "mcp:placeholder.test",
      provider_name: "placeholder_provider", // No mcp_server_base_url
      action_name: "placeholder_action",
      auth_token: "token_placeholder",
      instructions:"inst", expected_format:{}, active:true
    }];

    originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      assertEquals(url.toString(), `${TEST_MCP_SERVER_BASE_URL}/mcp/placeholder_provider/placeholder_action`);
      const body = JSON.parse(options!.body!.toString());
      assertEquals(body.args.param1, "{{placeholder_value}}");
      assertEquals(body.args.param2, "normal_value");
      assertEquals(body.auth.token, "token_placeholder");
      return Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
    };
    const consoleWarnSpy = spy(console, "warn");
    const activityLogSpy = spy(mockSupabaseClient.from("activity_logs"), "insert");


    try {
        await executeMCPPlan(mcpPlan, availableMcps, mockSupabaseClient, "user1", "email1");
        // Check if fetch was called (basic check, detailed assertions are in the mock)
        // This direct check on globalThis.fetch.calls won't work as it's not a spy object itself.
        // The assertions within the mock fetch serve this purpose.

        let warningLogged = false;
        for (const call of consoleWarnSpy.calls) {
            if (typeof call.args[0] === 'string' && call.args[0].includes("Placeholder argument detected")) {
                warningLogged = true;
                break;
            }
        }
        assert(warningLogged, "Placeholder argument warning was not logged to console.warn");
        assertEquals(activityLogSpy.calls.length, 1, "Activity log should still be called once.");


    } finally {
        globalThis.fetch = originalFetch;
        consoleWarnSpy.restore();
        activityLogSpy.restore();
    }
});

// Note: Need to ensure that generateMCPToolPlan and executeMCPPlan are EXPORTED from index.ts
// e.g. in index.ts:
// export async function generateMCPToolPlan(...) { ... }
// export async function executeMCPPlan(...) { ... }
//
// To run these tests:
// deno test supabase/functions/postmark-webhook/index.test.ts --allow-env --allow-net=generativelanguage.googleapis.com,mcp.knowreply.email
// (Adjust --allow-net as needed for actual MCP endpoints if not fully mocked)
// If functions are not exported, this file will fail to import them.
// The current implementation of index.ts DOES export them, so this note might be outdated.

Deno.test("[executeMCPPlan] multi-step plan with output/input chaining (placeholder resolution)", async () => {
  const testUserId = "test_user_output_chain";
  const testEmailInteractionId = "email_interaction_chain";

  const availableMcps = [
    {
      id: "mcp1",
      name: "stripe.getCustomerByEmail",
      provider_name: "stripe",
      action_name: "getCustomerByEmail",
      instructions: "Get customer by email from Stripe.",
      expected_format: { email: "string" }, // Simplified for test
      output_schema: { id: "string", email: "string", name: "string" },
      active: true,
    },
    {
      id: "mcp2",
      name: "stripe.getInvoices",
      provider_name: "stripe",
      action_name: "getInvoices",
      instructions: "Get invoices for a customer ID.",
      expected_format: { customerId: "string", status: "string" }, // Simplified
      output_schema: { data: "array", has_more: "boolean" },
      active: true,
    },
  ];

  const mockPlan = [
    { tool: "stripe.getCustomerByEmail", args: { email: "customer@example.com" } },
    { tool: "stripe.getInvoices", args: { customerId: "{{steps[0].outputs.id}}", status: "paid" } }
  ];

  // Mock Deno.env.get for MCP_SERVER_INTERNAL_API_KEY
  const envGetStub = stub(Deno.env, "get", (key) => {
    if (key === 'MCP_SERVER_INTERNAL_API_KEY') return "test_internal_key";
    if (key === 'GEMINI_MODEL') return "gemini-pro"; // Or any default model used
    // Add other env vars if your function directly uses them and they affect the test
    return undefined;
  });

  // Mock fetch
  const originalGlobalFetch = globalThis.fetch;
  let getInvoicesCallArgs: any = null; // To store args passed to getInvoices

  globalThis.fetch = async (url: URL | Request | string, options?: RequestInit): Promise<Response> => {
    const urlString = url.toString();
    const body = options?.body ? JSON.parse(options.body.toString()) : {};

    if (urlString.endsWith("/mcp/stripe/getCustomerByEmail")) {
      assertEquals(body.args.email, "customer@example.com");
      return Promise.resolve(new Response(
        JSON.stringify({ id: "cus_test_123", email: "customer@example.com", name: "Test Customer" }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      ));
    } else if (urlString.endsWith("/mcp/stripe/getInvoices")) {
      getInvoicesCallArgs = body.args; // Store args for later assertion
      // Assertions for arguments will be done after executeMCPPlan call for more clarity
      return Promise.resolve(new Response(
        JSON.stringify({ data: [{ id: "inv_abc", amount: 1000, currency: "usd" }], has_more: false }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      ));
    }
    console.error("Mock fetch received unexpected URL:", urlString);
    return Promise.resolve(new Response(JSON.stringify({ error: "Mock Not Found" }), { status: 404 }));
  };

  // Mock Supabase client
  const mockSupabaseClientWithConnParams = {
    from: (tableName: string) => {
      if (tableName === 'mcp_connection_params') {
        return {
          select: () => ({
            eq: (_field: string, _value: string) => ({ // for user_id
              eq: (_field2: string, _value2: string) => ({ // for provider_name
                single: async () => ({
                  data: { connection_values: { token: "dummy_stripe_token" } },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (tableName === 'activity_logs') {
        return {
          insert: async (data: any) => ({ error: null, data: data }), // No-op or simple mock
        };
      }
      // Fallback to a generic mock for other tables if needed
      return {
        insert: async (data: any) => ({ error: null, data: data }),
        select: () => ({ eq: () => ({ single: async () => ({ data: {}, error: "Not implemented in mock" }) }) }),
      };
    },
  };
  const activityLogSpy = spy(mockSupabaseClientWithConnParams.from("activity_logs"), "insert");
  const consoleLogSpy = spy(console, "log"); // To check placeholder resolution logs

  try {
    const results = await executeMCPPlan(
      mockPlan,
      availableMcps as any, // Cast as any if KnowReplyAgentConfig['mcp_endpoints'] is too strict for test setup
      mockSupabaseClientWithConnParams as any, // Cast as any for simplicity
      testUserId,
      testEmailInteractionId
    );

    // Assert outcomes
    assertEquals(results.length, 2, "Should have results for two actions.");

    // Check getCustomerByEmail result
    assertEquals(results[0].tool_name, "stripe.getCustomerByEmail");
    assertEquals(results[0].status, "success");
    assertEquals(results[0].response?.id, "cus_test_123");

    // Check getInvoices result
    assertEquals(results[1].tool_name, "stripe.getInvoices");
    assertEquals(results[1].status, "success");
    assertExists(results[1].response?.data, "Invoice data should exist");
    assertEquals(results[1].response?.data[0]?.id, "inv_abc");

    // Assert that getInvoices was called with the correct, resolved customerId
    assertExists(getInvoicesCallArgs, "getInvoices was not called or its args were not captured.");
    assertEquals(getInvoicesCallArgs.customerId, "cus_test_123", "customerId was not correctly substituted.");
    assertEquals(getInvoicesCallArgs.status, "paid", "status argument was not passed correctly.");

    // Check activity logs
    assertEquals(activityLogSpy.calls.length, 2, "Activity log should be called for each step.");
    assertEquals(activityLogSpy.calls[0].args[0][0].details.step, 0);
    assertEquals(activityLogSpy.calls[0].args[0][0].details.request_args.email, "customer@example.com");
    assertEquals(activityLogSpy.calls[1].args[0][0].details.step, 1);
    assertEquals(activityLogSpy.calls[1].args[0][0].details.request_args.customerId, "cus_test_123");


    // Check console logs for placeholder resolution
    let placeholderResolutionLogged = false;
    for (const call of consoleLogSpy.calls) {
        const arg = call.args[0];
        if (typeof arg === 'string' && arg.includes("[Step 1] Resolved placeholder '{{steps[0].outputs.id}}' to: cus_test_123")) {
            placeholderResolutionLogged = true;
            break;
        }
    }
    assert(placeholderResolutionLogged, "Placeholder resolution log message not found.");

  } finally {
    // Teardown
    globalThis.fetch = originalGlobalFetch;
    envGetStub.restore();
    activityLogSpy.restore();
    consoleLogSpy.restore();
  }
});

// Add a simple test to ensure the file is processed by Deno test runner
Deno.test("Test suite placeholder", () => {
  assert(true, "Test suite is running");
});
