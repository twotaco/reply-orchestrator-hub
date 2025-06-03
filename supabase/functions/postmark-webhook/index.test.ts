import {
  assert,
  assertEquals,
  assertExists,
  assertMatch,
  assertNotEquals,
  assertThrows,
} from "https://deno.land/std@0.214.0/assert/mod.ts";
import { stub, spy, type Stub, type Spy } from "https://deno.land/std@0.214.0/testing/mock.ts";
import { generateMCPToolPlan, executeMCPPlan, KnowReplyAgentConfig, resolvePath } from './index.ts'; // Added resolvePath

// --- Global Test Utilities ---
const TEST_MCP_SERVER_BASE_URL = "https://mcp.knowreply.email";

// Helper to mock fetch responses for Gemini
const mockGeminiFetch = (
  geminiResponseHandler: (url: URL | Request | string, options?: RequestInit) => Promise<Response>
): Stub<typeof globalThis, [input: string | Request | URL, init?: RequestInit | undefined], Promise<Response>> => {
  return stub(globalThis, "fetch", geminiResponseHandler);
};

// Helper to create a Supabase client mock
interface MockSupabaseClient {
  from: (tableName: string) => {
    select: (selectStr?: string) => any;
    insert: Spy<any, any[], Promise<{ error: any; data: any; }>>;
  };
}

const createMockSupabaseClient = (params?: {
  mcpConnectionParamsData?: Record<string, { connection_values: any, error?: any }>;
}): MockSupabaseClient => {
  const spies: Record<string, Spy<any, any[], Promise<{ error: any; data: any; }>>> = {};

  return {
    from: (tableName: string) => {
      let insertSpy = spies[tableName];
      if (!insertSpy) {
        insertSpy = spy(async (data: any) => ({ error: null, data }));
        spies[tableName] = insertSpy;
      }

      return {
        select: (selectStr?: string) => {
          if (tableName === 'mcp_connection_params' && params?.mcpConnectionParamsData) {
            return {
              eq: (_userIdField: string, _userId: string) => ({
                eq: (_providerField: string, providerName: string) => ({
                  single: async () => {
                    const providerData = params.mcpConnectionParamsData![providerName];
                    return providerData ? { data: providerData, error: providerData.error } : { data: null, error: { message: "Mock: Not found for provider " + providerName } };
                  }
                })
              })
            };
          }
          return {
            eq: () => ({ single: async () => ({ data: {}, error: "Not implemented in mock select" }) })
          } as any;
        },
        insert: insertSpy,
      };
    },
  };
};

Deno.test("resolvePath utility tests", async (t) => {
  const testCases = [
    { name: "simple direct property access", obj: { user: { name: "John" } }, path: "user.name", expected: "John" },
    { name: "direct id access", obj: { id: "123" }, path: "id", expected: "123" },
    { name: "array element access", obj: { orders: [{ id: 101 }, { id: 102 }] }, path: "orders[0].id", expected: 101 },
    { name: "array direct element access", obj: { items: ["a", "b"] }, path: "items[1]", expected: "b" },
    { name: "nested array and object access", obj: { data: { results: [{ value: "test" }] } }, path: "data.results[0].value", expected: "test" },
    { name: "path with multiple array indexes", obj: { matrix: [[1,2],[3,4]]}, path: "matrix[1][0]", expected: 3 },
    { name: "non-existent top-level property", obj: { user: { name: "John" } }, path: "customer.name", expected: undefined },
    { name: "non-existent nested property", obj: { user: { name: "John" } }, path: "user.age", expected: undefined },
    { name: "out-of-bounds array index (positive)", obj: { orders: [{ id: 101 }] }, path: "orders[1].id", expected: undefined },
    { name: "out-of-bounds array index (negative)", obj: { orders: [{ id: 101 }] }, path: "orders[-1].id", expected: undefined },
    { name: "property on non-object intermediate path", obj: { user: "John" }, path: "user.name", expected: undefined },
    { name: "index on non-array intermediate path", obj: { orders: { notAnArray: true } }, path: "orders[0].id", expected: undefined },
    { name: "empty path", obj: { user: "John" }, path: "", expected: undefined },
    { name: "null object", obj: null, path: "user.name", expected: undefined },
    { name: "undefined object", obj: undefined, path: "user.name", expected: undefined },
    { name: "path with hyphens", obj: { "user-data": { "full-name": "John Doe" } }, path: "user-data.full-name", expected: "John Doe"},
    { name: "path with numbers in property names", obj: { "prop1": { "item0": "val" } }, path: "prop1.item0", expected: "val"},
    { name: "path starting with array index (direct object)", obj: { arr: [ {a:1} ] }, path: "arr[0]", expected: {a:1} },
    { name: "path is just an array index for top level array object value", obj: [{a:1}], path: "[0].a", expected: 1},
    { name: "path is just an array index for top level array direct value", obj: ["first", "second"], path: "[1]", expected: "second"},
    { name: "path to a value that is explicitly undefined", obj: { user: { name: undefined } }, path: "user.name", expected: undefined },
    { name: "path with leading/trailing dots", obj: { user: "John" }, path: ".user.", expected: undefined },
    { name: "path with multiple consecutive dots", obj: { user: "John" }, path: "user..name", expected: undefined },
];

  for (const tc of testCases) {
    await t.step(tc.name, () => {
      assertEquals(resolvePath(tc.obj, tc.path), tc.expected);
    });
  }

   await t.step("empty path returns undefined (current behavior)", () => {
    const obj = {a:1};
    assertEquals(resolvePath(obj, ""), undefined);
  });

  await t.step("path is just an array index for top level array (direct object access)", () => {
    assertEquals(resolvePath([{a:1}], "[0]"), {a:1});
  });
});


Deno.test("[generateMCPToolPlan] should generate a plan successfully", async () => {
  let envGetStubInstance: Stub<Deno.Env> | undefined;
  let fetchStubInstance: Stub<typeof globalThis> | undefined;
  let insertSpy: Spy<any, any[], Promise<{ error: any; data: any; }>> | undefined;

  try {
    envGetStubInstance = stub(Deno.env, "get", (key: string) => {
      if (key === 'GEMINI_MODEL') return "gemini-1.5-pro";
      return undefined;
    });
    const mockApiKey = "test-gemini-key";
    const expectedPlan = [{ tool: "mcp:stripe.getCustomer", args: { email: "test@example.com" } }];
    const geminiResponse = { candidates: [{ content: { parts: [{ text: JSON.stringify(expectedPlan) }] }, finishReason: "STOP" }] };
    const mockAvailableMcps: KnowReplyAgentConfig['mcp_endpoints'] = [
      { id: "mcp-test-1", name: "mcp:stripe.getCustomer", instructions: "Get customer by Stripe email", provider_name: "stripe", action_name: "getCustomer", expected_format: {}, active: true, output_schema: {id: "string"} }
    ];

    fetchStubInstance = mockGeminiFetch(async (url, options) => {
      const modelInUse = Deno.env.get('GEMINI_MODEL')?.trim() || 'gemini-1.5-pro';
      assert(url.toString().startsWith(`https://generativelanguage.googleapis.com/v1beta/models/${modelInUse}:generateContent?key=${mockApiKey}`), `Gemini API URL is incorrect. Expected model ${modelInUse}, got ${url}`);
      return Promise.resolve(new Response(JSON.stringify(geminiResponse), { status: 200 }));
    });

    const mockSupabase = createMockSupabaseClient();
    insertSpy = mockSupabase.from("llm_logs").insert;

    const plan = await generateMCPToolPlan("Test email body", "sender@example.com", "Sender Name", mockAvailableMcps, mockApiKey, mockSupabase as any, "user1", "email1");
    assertEquals(plan, expectedPlan);
    assertEquals(insertSpy.calls.length, 1);
    const logData = insertSpy.calls[0].args[0][0];
    assertEquals(logData.model_used, "gemini-1.5-pro");
  } finally {
    envGetStubInstance?.restore();
    fetchStubInstance?.restore();
  }
});

Deno.test("[generateMCPToolPlan] should handle Gemini API error", async () => {
  let envGetStubInstance: Stub<Deno.Env> | undefined;
  let fetchStubInstance: Stub<typeof globalThis> | undefined;
  let insertSpy: Spy<any, any[], Promise<{ error: any; data: any; }>> | undefined;
  try {
    envGetStubInstance = stub(Deno.env, "get", (key: string) => (key === 'GEMINI_MODEL' ? "gemini-1.5-pro" : undefined));
    const mockApiKey = "test-gemini-key";
    const geminiErrorResponse = { error: { code: 500, message: "Gemini Internal Server Error" } };
    const mockAvailableMcps: KnowReplyAgentConfig['mcp_endpoints'] = [{ id: "mcp-test-2", name: "mcp:test.tool", instructions: "Test tool", provider_name:"b", action_name:"c", expected_format: {}, active: true }];

    fetchStubInstance = mockGeminiFetch(async () => Promise.resolve(new Response(JSON.stringify(geminiErrorResponse), { status: 500 })));
    const mockSupabase = createMockSupabaseClient();
    insertSpy = mockSupabase.from("llm_logs").insert;

    const plan = await generateMCPToolPlan("Test email body", "sender@example.com", "Sender Name", mockAvailableMcps, mockApiKey, mockSupabase as any, "user1", "email1");
    assertEquals(plan, null);
    assertEquals(insertSpy.calls.length, 1);
    assert(insertSpy.calls[0].args[0][0].error_message?.includes("Gemini API error"));
  } finally {
    envGetStubInstance?.restore();
    fetchStubInstance?.restore();
  }
});

Deno.test("[generateMCPToolPlan] should return empty array if no tools needed", async () => {
    let envGetStubInstance: Stub<Deno.Env> | undefined;
    let fetchStubInstance: Stub<typeof globalThis> | undefined;
    let insertSpy: Spy<any, any[], Promise<{ error: any; data: any; }>> | undefined;
    try {
        envGetStubInstance = stub(Deno.env, "get", (key: string) => (key === 'GEMINI_MODEL' ? "gemini-1.5-pro" : undefined));
        const mockApiKey = "test-gemini-key";
        const geminiResponse = { candidates: [{ content: { parts: [{ text: JSON.stringify([]) }] }, finishReason: "STOP" }] };
        const mockAvailableMcps: KnowReplyAgentConfig['mcp_endpoints'] = [{ id: "mcp-test-3", name: "mcp:test.tool", instructions: "Test", provider_name: "p", action_name: "a", active: true }];
        fetchStubInstance = mockGeminiFetch(async () => Promise.resolve(new Response(JSON.stringify(geminiResponse), { status: 200 })));
        const mockSupabase = createMockSupabaseClient();
        insertSpy = mockSupabase.from("llm_logs").insert;
        const plan = await generateMCPToolPlan("Thank you email", "sender@example.com", "Sender Name", mockAvailableMcps, mockApiKey, mockSupabase as any, "user1", "email1");
        assertEquals(plan, []);
        assertEquals(insertSpy.calls.length, 1);
    } finally {
        envGetStubInstance?.restore();
        fetchStubInstance?.restore();
    }
});


Deno.test("[executeMCPPlan] successful execution of a single action", async () => {
  let envGetStubInstance: Stub<Deno.Env> | undefined;
  let originalGlobalFetch: typeof globalThis.fetch | undefined;
  let activityLogSpy: Spy<any, any[], Promise<{ error: any; data: any; }>> | undefined;

  try {
    envGetStubInstance = stub(Deno.env, "get", (key: string) => (key === 'MCP_SERVER_INTERNAL_API_KEY' ? "test_internal_key" : undefined));
    const mcpPlan = [{ tool: "mcp:stripe.payment", args: { amount: 100, currency: "usd" } }];
    const availableMcps: KnowReplyAgentConfig['mcp_endpoints'] = [{ id: "mcp-stripe-payment", name: "mcp:stripe.payment", provider_name: "stripe", action_name: "createPayment", instructions: "Creates a stripe payment", expected_format: {}, active: true }];

    const mockSupabase = createMockSupabaseClient({
        mcpConnectionParamsData: { "stripe": { connection_values: { token: "sk_test_provider_key" } } }
    });
    activityLogSpy = mockSupabase.from("activity_logs").insert;

    originalGlobalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      assertEquals(url.toString(), `${TEST_MCP_SERVER_BASE_URL}/mcp/stripe/createPayment`);
      const body = JSON.parse(options!.body!.toString());
      assertEquals(body.auth.token, "sk_test_provider_key");
      return Promise.resolve(new Response(JSON.stringify({ success: true, paymentId: "pi_123" }), { status: 200 }));
    };

    const results = await executeMCPPlan(mcpPlan, availableMcps, mockSupabase as any, "user1", "email1");
    assertEquals(results[0].status, "success");
    assertEquals(results[0].response?.paymentId, "pi_123");
    assertEquals(activityLogSpy.calls.length, 1);
    const logEntryArg = activityLogSpy.calls[0].args[0] as any;
    assertEquals(logEntryArg.details.target_url, `${TEST_MCP_SERVER_BASE_URL}/mcp/stripe/createPayment`);
  } finally {
    envGetStubInstance?.restore();
    if (originalGlobalFetch) globalThis.fetch = originalGlobalFetch;
  }
});

Deno.test("[executeMCPPlan] multi-step plan with output/input chaining (placeholder resolution)", async () => {
  let envGetStubInstance: Stub<Deno.Env> | undefined;
  let originalGlobalFetch: typeof globalThis.fetch | undefined;
  let activityLogSpy: Spy<any, any[], Promise<{ error: any; data: any; }>> | undefined;
  let consoleLogSpyInstance: Stub<Console> | undefined;

  try {
    envGetStubInstance = stub(Deno.env, "get", (key: string) => {
      if (key === 'MCP_SERVER_INTERNAL_API_KEY') return "test_internal_key";
      if (key === 'GEMINI_MODEL') return "gemini-1.5-pro";
      return undefined;
    });
    consoleLogSpyInstance = stub(console, "log");

    const mcpConfigs: KnowReplyAgentConfig['mcp_endpoints'] = [
      { id: "mcp1", name: "stripe.getCustomerByEmail", provider_name: "stripe", action_name: "getCustomerByEmail", instructions: "Get customer by email", output_schema: { id: "string" }, active: true },
      { id: "mcp2", name: "stripe.getInvoices", provider_name: "stripe", action_name: "getInvoices", instructions: "Get invoices", output_schema: { data: "array" }, active: true },
    ];
    const plan = [
      { tool: "stripe.getCustomerByEmail", args: { email: "customer@example.com" } },
      { tool: "stripe.getInvoices", args: { customerId: "{{steps[0].outputs.id}}", status: "paid" } }
    ];

    let getInvoicesCallArgs: any = null;
    originalGlobalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      const urlString = url.toString();
      const body = JSON.parse(options!.body!.toString());
      if (urlString.endsWith("/mcp/stripe/getCustomerByEmail")) {
        return Promise.resolve(new Response(JSON.stringify({ id: "cus_test_123", email: "customer@example.com" }), { status: 200 }));
      } else if (urlString.endsWith("/mcp/stripe/getInvoices")) {
        getInvoicesCallArgs = body.args;
        return Promise.resolve(new Response(JSON.stringify({ data: [{id: "inv_abc"}] }), { status: 200 }));
      }
      return Promise.resolve(new Response("Mock Not Found", { status: 404 }));
    };

    const mockSupabase = createMockSupabaseClient({
        mcpConnectionParamsData: { "stripe": { connection_values: { token: "dummy_stripe_token" }}}
    });
    activityLogSpy = mockSupabase.from("activity_logs").insert;

    const results = await executeMCPPlan(plan, mcpConfigs, mockSupabase as any, "test_user_chain", "email_interaction_chain");

    assertEquals(results.length, 2);
    assertEquals(results[0].status, "success");
    assertEquals(results[1].status, "success");
    assertExists(getInvoicesCallArgs);
    assertEquals(getInvoicesCallArgs.customerId, "cus_test_123");
    assertEquals(activityLogSpy.calls.length, 2);

    let placeholderResolutionLogged = false;
    for (const call of consoleLogSpyInstance.calls) {
        const arg = call.args[0];
        if (typeof arg === 'string' && arg.includes("[Step 1] Resolved placeholder '{{steps[0].outputs.id}}' to: cus_test_123")) {
            placeholderResolutionLogged = true;
            break;
        }
    }
    assert(placeholderResolutionLogged, "Placeholder resolution log message not found.");

  } finally {
    envGetStubInstance?.restore();
    if (originalGlobalFetch) globalThis.fetch = originalGlobalFetch;
    consoleLogSpyInstance?.restore();
  }
});

Deno.test("[executeMCPPlan] other error condition (example - to be filled/refactored)", async () => {
    let envGetStubInstance: Stub<Deno.Env> | undefined;
    try {
        envGetStubInstance = stub(Deno.env, "get", key => key === 'MCP_SERVER_INTERNAL_API_KEY' ? "test_internal_key" : undefined);
        const mcpPlan = [{ tool: "mcp:failing.tool", args: {data: "any"}}];
        const availableMcps: KnowReplyAgentConfig['mcp_endpoints'] = [{id: "id1", name: "mcp:failing.tool", provider_name: "failing", action_name: "action", active: true}];
        const mockSupabase = createMockSupabaseClient({mcpConnectionParamsData: {"failing": {connection_values: {token: "tok"}}}});
        const results = await executeMCPPlan(mcpPlan, availableMcps, mockSupabase as any, "user1", "email1");
        assert(results[0].status === "error");
    } finally {
        envGetStubInstance?.restore();
    }
});


Deno.test("Test suite placeholder", () => {
  assert(true, "Test suite is running");
});
