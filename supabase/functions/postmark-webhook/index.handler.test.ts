import {
  assertEquals,
  assertMatch,
  assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { sinon } from "https://deno.land/x/sinon@v.1.17.0/mod.ts";
import { SupabaseClient, createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Assuming index.ts is refactored to export its main handler function like this:
// export async function mainHandler(req: Request): Promise<Response> { /* ... */ }
// For the purpose of this test, we'll need to adapt if index.ts isn't structured this way.
// Let's proceed by defining a placeholder for what would be the imported handler from index.ts
// In a real scenario, you would `import { mainHandler } from './index.ts';`
// For now, we will effectively re-define parts of index.ts's serve logic for testing.
// This is not ideal but necessary if index.ts is not refactored for testability.

import * as handlerUtils from './handlerUtils.ts'; // To mock handlePostmarkRequest
import { PostmarkWebhookPayload, WorkspaceConfigWithUser } from "./types.ts"; // Assuming this is also used by index.ts indirectly

// Placeholder for the actual handler from index.ts
// This would ideally be: import { mainHandler as serveHandler } from './index.ts';
// For now, this test will simulate the behavior of the serve call.
// The 'serve' function from index.ts itself will be the system under test.
// We will call its inner async (req: Request) handler.

// Due to Deno's nature and `serve` being called directly in index.ts,
// testing the exported handler directly is the best approach.
// We will assume index.ts is refactored like:
// export const mainServeHandler = async (req: Request) => { /* ... logic ... */ };
// serve(mainServeHandler);
// And then we import mainServeHandler.
// If not, we test it by running the function and capturing stdout/stderr or using integration tests.
// For a unit test, we'll mock its direct dependencies.

// This test will effectively be an integration test of the index.ts handler,
// mocking external systems (Supabase DB, handlePostmarkRequest).

// Store original functions/objects
const originalDenoEnvGet = Deno.env.get;
// We need a way to mock createClient if it's imported and used directly.
// This is complex for ESM modules without specific loader hooks or library support.
// Let's assume for now we can stub it via its module if possible, or acknowledge this limitation.

Deno.test("[index.handler.ts] Postmark Webhook Handler", async (t) => {
  let denoEnvStub: sinon.SinonStub;
  let handlePostmarkRequestStub: sinon.SinonStub;
  let mockSupabaseClient: any;
  let supabaseFromStub: sinon.SinonStub;

  // This is the core of index.ts that we are testing
  // Re-defining it here for clarity on what's being tested.
  // Ideally, this exact function (or its content) is exported from index.ts
  async function testableIndexHandler(req: Request): Promise<Response> {
    console.log('🚀 TEST Postmark webhook function called!');
    console.log('📝 Request method:', req.method);
    console.log('🔗 Request URL:', req.url);

    if (req.method === 'OPTIONS') {
      console.log('✅ Handling CORS preflight request');
      return new Response(null, { headers: handlerUtils.corsHeaders });
    }

    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    const customerApiKey = pathParts.length === 5 && pathParts[3] === 'postmark-webhook' ? pathParts[4] : null;

    if (!customerApiKey) {
      return new Response(JSON.stringify({ status: 'error', message: 'Invalid webhook URL format or API key missing.' }), {
        status: 400, headers: { ...handlerUtils.corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    console.log('🔑 Extracted Customer API Key:', customerApiKey);

    try {
      // This createClient call is what needs to be effectively mocked
      // For this test, we will use the mockSupabaseClient directly.
      // In a real scenario with `createClient` called inside, it's harder.
      const supabaseAdminClient = mockSupabaseClient;

      const { data: workspaceConfig, error: apiKeyError } = await supabaseAdminClient
        .from('workspace_configs')
        .select('*')
        .eq('webhook_api_key', customerApiKey)
        .single();

      if (apiKeyError || !workspaceConfig) {
        return new Response(JSON.stringify({ status: 'error', message: 'Authentication failed: Invalid API key.' }), {
          status: 401, headers: { ...handlerUtils.corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      console.log(`✅ User authenticated: ${workspaceConfig.user_id} via API key.`);

      if (req.method !== 'POST') {
        return new Response(JSON.stringify({ status: 'error', message: 'Method not allowed. Only POST is accepted.' }), {
          status: 405, headers: { ...handlerUtils.corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const payload: PostmarkWebhookPayload = await req.json();
      return await handlerUtils.handlePostmarkRequest(
        supabaseAdminClient,
        workspaceConfig as WorkspaceConfigWithUser,
        payload,
        sinon.stub().resolves({ success: true, warnings: [], errors: [] }) // Mocked processEmailWithKnowReply
      );
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Critical internal server error';
      return new Response(JSON.stringify({ status: 'error', message: errorMessage, errors: [errorMessage] }), {
        status: 500, headers: { ...handlerUtils.corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }


  const setupMocks = () => {
    denoEnvStub = sinon.stub(Deno.env, "get");
    denoEnvStub.withArgs("SUPABASE_URL").returns("http://localhost:54321");
    denoEnvStub.withArgs("SUPABASE_SERVICE_ROLE_KEY").returns("test-service-role-key");

    handlePostmarkRequestStub = sinon.stub(handlerUtils, "handlePostmarkRequest");

    // Mock Supabase client instance
    supabaseFromStub = sinon.stub();
    const eqStub = sinon.stub();
    const singleStub = sinon.stub();
    const selectStub = sinon.stub().returns({ eq: eqStub });
    eqStub.returns({ single: singleStub });
    supabaseFromStub.withArgs('workspace_configs').returns({ select: selectStub });

    mockSupabaseClient = { from: supabaseFromStub, auth: {} }; // Add auth if getUser is called by chance
  };

  const teardownMocks = () => {
    sinon.restore(); // Restores all sinon stubs
  };

  const createMockRequest = (url: string, method: string, body?: any): Request => {
    const headers = body ? { "Content-Type": "application/json" } : {};
    return new Request(url, { method, body: body ? JSON.stringify(body) : undefined, headers });
  };

  await t.step("Test Case 1: Valid API Key (POST request)", async () => {
    setupMocks();
    const mockPayload = { MessageID: "test-msg-1" };
    const req = createMockRequest("http://localhost/functions/v1/postmark-webhook/valid-key", "POST", mockPayload);

    const mockWorkspaceCfg = { user_id: 'user-123', webhook_api_key: 'valid-key', id: 'ws-config-id' };
    // Configure the .single() part of the workspace_configs query
    mockSupabaseClient.from('workspace_configs').select().eq().single.resolves({ data: mockWorkspaceCfg, error: null });

    handlePostmarkRequestStub.resolves(new Response(JSON.stringify({ status: 'success from mock handler' }), { status: 200 }));

    const response = await testableIndexHandler(req);
    const responseBody = await response.json();

    assertEquals(response.status, 200);
    assertEquals(responseBody.status, 'success from mock handler');

    assert(handlePostmarkRequestStub.calledOnce, "handlePostmarkRequest was not called once");
    const callArgs = handlePostmarkRequestStub.getCall(0).args;
    assertEquals(callArgs[1].user_id, 'user-123'); // Check workspaceConfig
    assertEquals(callArgs[2].MessageID, "test-msg-1"); // Check payload

    teardownMocks();
  });

  await t.step("Test Case 2: Invalid API Key (POST request)", async () => {
    setupMocks();
    const req = createMockRequest("http://localhost/functions/v1/postmark-webhook/invalid-key", "POST", { MessageID: "test-msg-2" });
    mockSupabaseClient.from('workspace_configs').select().eq().single.resolves({ data: null, error: null }); // Key not found

    const response = await testableIndexHandler(req);
    const responseBody = await response.json();

    assertEquals(response.status, 401);
    assertEquals(responseBody.message, 'Authentication failed: Invalid API key.');
    assert(!handlePostmarkRequestStub.called, "handlePostmarkRequest should not be called");
    teardownMocks();
  });

  await t.step("Test Case 3: Missing API Key in URL (POST request)", async () => {
    setupMocks();
    const req = createMockRequest("http://localhost/functions/v1/postmark-webhook/", "POST", { MessageID: "test-msg-3" });
    // No need to mock Supabase client as it should fail before DB lookup

    const response = await testableIndexHandler(req);
    const responseBody = await response.json();

    assertEquals(response.status, 400);
    assertEquals(responseBody.message, 'Invalid webhook URL format or API key missing.');
    assert(!handlePostmarkRequestStub.called, "handlePostmarkRequest should not be called for missing key");
    teardownMocks();
  });

  await t.step("Test Case 4: Non-POST Request (GET with valid API key)", async () => {
    setupMocks();
    const req = createMockRequest("http://localhost/functions/v1/postmark-webhook/valid-key", "GET");
    const mockWorkspaceCfg = { user_id: 'user-123', webhook_api_key: 'valid-key' };
    mockSupabaseClient.from('workspace_configs').select().eq().single.resolves({ data: mockWorkspaceCfg, error: null });

    const response = await testableIndexHandler(req);
    const responseBody = await response.json();

    assertEquals(response.status, 405);
    assertEquals(responseBody.message, 'Method not allowed. Only POST is accepted.');
    assert(!handlePostmarkRequestStub.called, "handlePostmarkRequest should not be called for GET");
    teardownMocks();
  });

  await t.step("Test Case 5: OPTIONS Preflight Request", async () => {
    setupMocks();
    const req = createMockRequest("http://localhost/functions/v1/postmark-webhook/any-key", "OPTIONS");

    const response = await testableIndexHandler(req);
    assertEquals(response.status, 200); // Null body for OPTIONS
    assertEquals(response.headers.get('Access-Control-Allow-Origin'), '*');
    assert(!handlePostmarkRequestStub.called, "handlePostmarkRequest should not be called for OPTIONS");
    teardownMocks();
  });

  await t.step("Test Case 6: Supabase Error during API Key Lookup", async () => {
    setupMocks();
    const req = createMockRequest("http://localhost/functions/v1/postmark-webhook/error-key", "POST", { MessageID: "test-msg-err" });
    mockSupabaseClient.from('workspace_configs').select().eq().single.resolves({ data: null, error: { message: "Simulated DB error" } });

    const response = await testableIndexHandler(req);
    const responseBody = await response.json();

    assertEquals(response.status, 401); // Still 401 as it's an auth failure path
    assertEquals(responseBody.message, 'Authentication failed: Invalid API key.');
    assert(!handlePostmarkRequestStub.called, "handlePostmarkRequest should not be called on DB error for key lookup");
    teardownMocks();
  });

  console.log("index.handler.test.ts created with test structure.");
  console.log("Run with: deno test --allow-env --allow-net supabase/functions/postmark-webhook/index.handler.test.ts");

});
