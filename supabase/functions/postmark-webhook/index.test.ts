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
  const expectedPlan = [{ tool: "mcp:test.tool", args: { param: "value" } }];
  const geminiResponse = {
    candidates: [{
      content: { parts: [{ text: JSON.stringify(expectedPlan) }], role: "model" },
      finishReason: "STOP"
    }]
  };

  const fetchStub = mockGeminiFetch(async (url, options) => {
    assert(url.toString().startsWith(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${mockApiKey}`), "Gemini API URL is incorrect");
    assert(options?.method === "POST", "HTTP method should be POST");
    const body = JSON.parse(options!.body!.toString());
    assertExists(body.contents, "Gemini request body should have 'contents'");
    assertEquals(body.generationConfig?.response_mime_type, "application/json", "response_mime_type should be application/json");
    return Promise.resolve(new Response(JSON.stringify(geminiResponse), { status: 200 }));
  });
  const insertSpy = spy(mockSupabaseClient.from("llm_logs"), "insert");

  try {
    const plan = await generateMCPToolPlan(
      "Test email body",
      [{ name: "mcp:test.tool", instructions: "Test tool instructions" }],
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

  } finally {
    fetchStub.restore(); // Restore original fetch
    insertSpy.restore();
  }
});

Deno.test("[generateMCPToolPlan with Gemini] should handle Gemini API error", async () => {
  const mockApiKey = "test-gemini-key";
  const geminiErrorResponse = { error: { code: 500, message: "Gemini Internal Server Error" } };

  const fetchStub = mockGeminiFetch(async (url) => {
    assert(url.toString().includes(mockApiKey), "Gemini API key not in URL");
    return Promise.resolve(new Response(JSON.stringify(geminiErrorResponse), { status: 500, statusText: "Internal Server Error" }));
  });
  const insertSpy = spy(mockSupabaseClient.from("llm_logs"), "insert");

  try {
    const plan = await generateMCPToolPlan(
      "Test email body",
      [{ name: "mcp:test.tool", instructions: "Test tool" }],
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
    const fetchStub = mockGeminiFetch(async () => {
        return Promise.resolve(new Response(JSON.stringify(geminiResponseNoTools), { status: 200 }));
    });
    const insertSpy = spy(mockSupabaseClient.from("llm_logs"), "insert");

    try {
        const plan = await generateMCPToolPlan(
            "Thank you email",
            [{ name: "mcp:test.tool", instructions: "Test tool" }],
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
    // originalFetch = globalThis.fetch; // Not needed if using stub effectively
    const fetchStub = mockGeminiFetch(async () => {
        return Promise.resolve(new Response(JSON.stringify(geminiResponseInvalidJsonText), { status: 200 }));
    });
    const insertSpy = spy(mockSupabaseClient.from("llm_logs"), "insert");

    try {
        const plan = await generateMCPToolPlan(
            "Test email",
            [{ name: "mcp:test.tool", instructions: "Test tool" }],
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
   const fetchStub = mockGeminiFetch(async () => {
        return Promise.resolve(new Response(JSON.stringify(geminiSafetyBlockResponse), { status: 200 })); // Gemini might return 200 OK even if blocked
    });
  const insertSpy = spy(mockSupabaseClient.from("llm_logs"), "insert");

  try {
    const plan = await generateMCPToolPlan(
      "Problematic email body",
      [{ name: "mcp:test.tool", instructions: "Test tool" }],
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


Deno.test("[executeMCPPlan] successful execution of a single action", async () => { // This test and subsequent executeMCPPlan tests should remain unchanged
  const mcpPlan = [{ tool: "mcp:valid.tool", args: { data: "send" } }];
  const availableMcps = [{ name: "mcp:valid.tool", post_url: "https://mcp.example.com/action", auth_token: "token123" }];
  
  // Using a generic fetch mock for MCP calls, not specific to Gemini/OpenAI
  originalFetch = globalThis.fetch; // Store original
  globalThis.fetch = async (url, options) => {
    if (url.toString().includes("mcp.example.com/action")) {
      return Promise.resolve(new Response(JSON.stringify({ success: true, result: "tool_data" }), { status: 200 }));
    }
    return Promise.resolve(new Response("Not Found", { status: 404 }));
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
    assertEquals(results[0].tool_name, "mcp:valid.tool");
    assertEquals(results[0].status, "success");
    assertEquals(results[0].response?.result, "tool_data");
    assert(fetchStub.calls.length > 0, "Fetch for MCP was not called");
    assertEquals(fetchStub.calls[0].args[0], "https://mcp.example.com/action");
    assertEquals(fetchStub.calls[0].args[1]?.method, "POST");
    assertEquals(fetchStub.calls[0].args[1]?.headers?.['Authorization'], "Bearer token123");
    assertEquals(JSON.parse(fetchStub.calls[0].args[1]?.body as string), { data: "send" });
    assert(activityLogSpy.calls.length > 0, "Activity log was not called");

  } finally {
    fetchStub.restore();
    activityLogSpy.restore();
  }
});

Deno.test("[executeMCPPlan] MCP execution failure (HTTP error)", async () => {
    const mcpPlan = [{ tool: "mcp:error.tool", args: {} }];
    const availableMcps = [{ name: "mcp:error.tool", post_url: "https://mcp.example.com/error" }];
    
    const fetchStub = mockFetch({ error: "MCP Server Error" }, 500, false);
    const activityLogSpy = spy(mockSupabaseClient.from("activity_logs"), "insert");

    try {
        const results = await executeMCPPlan(mcpPlan, availableMcps, mockSupabaseClient, "user1", "email1");
        assertEquals(results.length, 1);
        assertEquals(results[0].status, "error");
        assertExists(results[0].error_message);
        assertMatch(results[0].error_message!, /MCP call failed/);
        assert(activityLogSpy.calls.length > 0, "Activity log was not called");
        assertEquals(activityLogSpy.calls[0].args[0][0].status, "error");

    } finally {
        fetchStub.restore();
        activityLogSpy.restore();
    }
});

Deno.test("[executeMCPPlan] MCP returns non-JSON response (HTTP success)", async () => {
    const mcpPlan = [{ tool: "mcp:nonjson.tool", args: {} }];
    const availableMcps = [{ name: "mcp:nonjson.tool", post_url: "https://mcp.example.com/nonjson" }];
    
    originalFetch = globalThis.fetch;
    globalThis.fetch = async (_url, _options) => {
        return Promise.resolve(new Response("Plain text response", { status: 200 }));
    };
    const activityLogSpy = spy(mockSupabaseClient.from("activity_logs"), "insert");

    try {
        const results = await executeMCPPlan(mcpPlan, availableMcps, mockSupabaseClient, "user1", "email1");
        assertEquals(results.length, 1);
        assertEquals(results[0].status, "success"); // HTTP 200 is success
        assertEquals(results[0].response, null);
        assertEquals(results[0].raw_response, "Plain text response");
        assert(activityLogSpy.calls.length > 0, "Activity log was not called");

    } finally {
        globalThis.fetch = originalFetch;
        activityLogSpy.restore();
    }
});

Deno.test("[executeMCPPlan] MCP tool not found in availableMcps", async () => {
    const mcpPlan = [{ tool: "mcp:unknown.tool", args: {} }];
    const availableMcps = [{ name: "mcp:known.tool", post_url: "https://mcp.example.com/known" }];
    const activityLogSpy = spy(mockSupabaseClient.from("activity_logs"), "insert");

    try {
        const results = await executeMCPPlan(mcpPlan, availableMcps, mockSupabaseClient, "user1", "email1");
        assertEquals(results.length, 1);
        assertEquals(results[0].status, "error");
        assertMatch(results[0].error_message!, /MCP configuration not found/);
        assert(activityLogSpy.calls.length > 0, "Activity log was not called on config error");
        assertEquals(activityLogSpy.calls[0].args[0][0].action, "mcp_execution_error");


    } finally {
      activityLogSpy.restore();
    }
});

Deno.test("[executeMCPPlan] Plan with multiple actions (success and failure)", async () => {
    const mcpPlan = [
        { tool: "mcp:success.tool", args: { data: "good" } },
        { tool: "mcp:failure.tool", args: { data: "bad" } }
    ];
    const availableMcps = [
        { name: "mcp:success.tool", post_url: "https://mcp.example.com/success" },
        { name: "mcp:failure.tool", post_url: "https://mcp.example.com/failure" }
    ];

    const fetchStub = stub(globalThis, "fetch", (url: URL | Request | string) => {
        if (url.toString().includes("/success")) {
            return Promise.resolve(new Response(JSON.stringify({ result: "success_data" }), { status: 200 }));
        } else if (url.toString().includes("/failure")) {
            return Promise.resolve(new Response(JSON.stringify({ error: "failure_data" }), { status: 500, statusText: "Server Error" }));
        }
        return Promise.resolve(new Response("Not Found", { status: 404 }));
    });
    const activityLogSpy = spy(mockSupabaseClient.from("activity_logs"), "insert");

    try {
        const results = await executeMCPPlan(mcpPlan, availableMcps, mockSupabaseClient, "user1", "email1");
        assertEquals(results.length, 2);
        
        const successResult = results.find(r => r.tool_name === "mcp:success.tool");
        assertExists(successResult);
        assertEquals(successResult.status, "success");
        assertEquals(successResult.response?.result, "success_data");

        const failureResult = results.find(r => r.tool_name === "mcp:failure.tool");
        assertExists(failureResult);
        assertEquals(failureResult.status, "error");
        assertMatch(failureResult.error_message!, /MCP call failed/);
        
        assertEquals(fetchStub.calls.length, 2, "Fetch should be called twice");
        assertEquals(activityLogSpy.calls.length, 2, "Activity log should be called twice");

    } finally {
        fetchStub.restore();
        activityLogSpy.restore();
    }
});

Deno.test("[executeMCPPlan] Placeholder argument warning (visual check of console or future spy on console.warn)", async () => {
    // This test primarily checks if the warning is logged.
    // Deno's built-in test runner captures console output, so it can be visually inspected.
    // For automated check, one might spy on console.warn if using a more sophisticated mocking library
    // or by temporarily reassigning console.warn.

    const mcpPlan = [{ tool: "mcp:placeholder.tool", args: { param: "{{placeholder_value}}" } }];
    const availableMcps = [{ name: "mcp:placeholder.tool", post_url: "https://mcp.example.com/placeholder" }];
    
    const fetchStub = mockFetch({ success: true });
    const consoleWarnSpy = spy(console, "warn");

    try {
        await executeMCPPlan(mcpPlan, availableMcps, mockSupabaseClient, "user1", "email1");
        assert(fetchStub.calls.length > 0, "Fetch was not called");
        
        // Check if console.warn was called with the expected message
        let warningLogged = false;
        for (const call of consoleWarnSpy.calls) {
            if (typeof call.args[0] === 'string' && call.args[0].includes("Placeholder argument detected")) {
                warningLogged = true;
                break;
            }
        }
        assert(warningLogged, "Placeholder argument warning was not logged to console.warn");

    } finally {
        fetchStub.restore();
        consoleWarnSpy.restore();
    }
});

// Note: Need to ensure that generateMCPToolPlan and executeMCPPlan are EXPORTED from index.ts
// e.g. in index.ts:
// export async function generateMCPToolPlan(...) { ... }
// export async function executeMCPPlan(...) { ... }
//
// To run these tests:
// deno test supabase/functions/postmark-webhook/index.test.ts --allow-env --allow-net=api.openai.com,mcp.example.com
// (Adjust --allow-net as needed for actual MCP endpoints if not fully mocked)
// If functions are not exported, this file will fail to import them.
// The current implementation of index.ts does not export these functions.
// That would be the first modification needed in index.ts itself.

console.log("NOTE: For these tests to run, `generateMCPToolPlan` and `executeMCPPlan` must be exported from `./index.ts`.");
console.log("The current `index.ts` in the prompt context does not export them. This needs to be addressed first.");
console.log("Example export in index.ts: `export async function generateMCPToolPlan(...) { ... }`");

// Add a simple test to ensure the file is processed by Deno test runner
Deno.test("Test suite placeholder", () => {
  assert(true, "Test suite is running");
});
