import {
  assertEquals,
  assertRejects,
  assertMatch,
  assertNotEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts"; // Using a more recent std version
import { sinon } from "https://deno.land/x/sinon@v.1.17.0/mod.ts"; // Attempting to use sinon for better mocking

import { processEmailWithKnowReply } from './agentManager.ts';
// For spying on internal calls if possible, or for mocking dependencies if we refactor agentManager.ts
// import * as agentManagerModule from './agentManager.ts';
import * as dbModule from './db.ts';
import { PostmarkWebhookPayload } from "./types.ts";

// Store original functions
const originalGetAgentIdsByEmails = dbModule.getAgentIdsByEmails;
const originalFetch = globalThis.fetch;

Deno.test("[agentManager] processEmailWithKnowReply", async (t) => {
  let mockSupabaseClient: any;
  let getAgentIdsByEmailsStub: sinon.SinonStub;
  let fetchStub: sinon.SinonStub;
  let supabaseFromStub: sinon.SinonStub;

  const setupMocks = () => {
    // Mock dbModule.getAgentIdsByEmails
    getAgentIdsByEmailsStub = sinon.stub(dbModule, "getAgentIdsByEmails");

    // Mock globalThis.fetch
    fetchStub = sinon.stub(globalThis, "fetch");
    fetchStub.resolves(new Response(JSON.stringify({ success: true, intent: "mocked_intent" }), { status: 200 })); // Default mock for KnowReply API

    // Mock Supabase client
    supabaseFromStub = sinon.stub(); // This will be the base for all 'from' calls

    mockSupabaseClient = {
      from: supabaseFromStub,
    };

    // --- Specific mock behaviors for common queries ---
    // Workspace Config
    const workspaceConfigSingleStub = sinon.stub().resolves({
      data: { knowreply_webhook_url: 'https://test.knowreply.com/webhook', knowreply_api_token: 'test-kr-token' },
      error: null
    });
    // How the code calls it: supabase.from('workspace_configs').select(...).eq(...).single()
    const workspaceEqStub = sinon.stub().returns({ single: workspaceConfigSingleStub });
    const workspaceSelectStub = sinon.stub().returns({ eq: workspaceEqStub });
    supabaseFromStub.withArgs('workspace_configs').returns({ select: workspaceSelectStub });


    // knowreply_agent_mcp_mappings - data will be set per test using the activeEqStub
    // How the code calls it: supabase.from('knowreply_agent_mcp_mappings').select('agent_id, mcp_endpoint_id').eq('user_id', userId).eq('active', true)
    // So, from() -> select() -> eq() -> eq()
    const mcpMappingsActiveEqStub = sinon.stub(); // This will be configured in each test to resolve with data or error
    const mcpMappingsUserEqStub = sinon.stub().returns({ eq: mcpMappingsActiveEqStub });
    const mcpMappingsSelectStub = sinon.stub().returns({ eq: mcpMappingsUserEqStub });
    supabaseFromStub.withArgs('knowreply_agent_mcp_mappings').returns({ select: mcpMappingsSelectStub });


    // mcp_endpoints - data will be set per test using the mcpEpActiveEqStub
    // How the code calls it: supabase.from('mcp_endpoints').select(...).in(...).eq('user_id', userId).eq('active', true)
    // So, from() -> select() -> in() -> eq() -> eq()
    const mcpEpActiveEqStub = sinon.stub(); // This will be configured in each test
    const mcpEpUserEqStub = sinon.stub().returns({ eq: mcpEpActiveEqStub });
    const mcpEpInStub = sinon.stub().returns({ eq: mcpEpUserEqStub });
    const mcpEpSelectStub = sinon.stub().returns({ in: mcpEpInStub });
    supabaseFromStub.withArgs('mcp_endpoints').returns({ select: mcpEpSelectStub });

    // activity_logs
    const activityLogsInsertStub = sinon.stub().resolves({ data: [{}], error: null });
    supabaseFromStub.withArgs('activity_logs').returns({ insert: activityLogsInsertStub });

    // email_interactions
    // How the code calls it: supabase.from('email_interactions').update(...).eq(...).select()
    const emailInteractionsSelectStub = sinon.stub().resolves({ data: [{id: "interactionId"}], error: null });
    const emailInteractionsEqStub = sinon.stub().returns({ select: emailInteractionsSelectStub });
    const emailInteractionsUpdateStub = sinon.stub().returns({ eq: emailInteractionsEqStub });
    supabaseFromStub.withArgs('email_interactions').returns({ update: emailInteractionsUpdateStub });
  };

  const teardownMocks = () => {
    sinon.restore(); // This restores all stubs/spies/mocks created by sinon in the default sandbox
  };

  const createMockPayload = (toEmails: string[], ccEmails: string[] = [], bccEmails: string[] = []): PostmarkWebhookPayload => {
    return {
      FromFull: { Email: "sender@example.com", Name: "Sender", MailboxHash: "" },
      ToFull: toEmails.map(email => ({ Email: email, Name: "", MailboxHash: "" })),
      CcFull: ccEmails.map(email => ({ Email: email, Name: "", MailboxHash: "" })),
      BccFull: bccEmails.map(email => ({ Email: email, Name: "", MailboxHash: "" })),
      Subject: "Test Subject",
      TextBody: "Test email body",
      MessageID: "test-message-id",
      // Add other required fields from PostmarkWebhookPayload with default values
      FromName: "Sender",
      MessageStream: "inbound",
      From: "sender@example.com",
      To: toEmails.join(','),
      Cc: ccEmails.join(','),
      Bcc: bccEmails.join(','),
      OriginalRecipient: toEmails[0] || "",
      ReplyTo: "",
      MailboxHash: "",
      Date: new Date().toISOString(),
      HtmlBody: "",
      StrippedTextReply: "",
      Tag: "",
      Headers: [],
      Attachments: [],
    };
  };

  await t.step("Scenario 1: Single Agent Match (agent1)", async () => {
    setupMocks();
    const payload = createMockPayload(["agent1@example.com"]);

    getAgentIdsByEmailsStub.resolves(['agent1']);

    // Mock MCP mappings for agent1
    const mcpMappingsActiveEqStub = supabaseFromStub.withArgs('knowreply_agent_mcp_mappings').getCall(0).returnValue.select().eq().eq;
    mcpMappingsActiveEqStub.resolves({ data: [{ agent_id: 'agent1', mcp_endpoint_id: 'mcp1' }], error: null });

    // Mock MCP endpoint details for mcp1
    const mcpEpActiveEqStub = supabaseFromStub.withArgs('mcp_endpoints').getCall(0).returnValue.select().in().eq().eq;
    mcpEpActiveEqStub.resolves({ data: [{ id: 'mcp1', name: 'TestMCP', provider_name: 'test', action_name: 'do_stuff', active: true, instructions: 'Test MCP instructions' }], error: null });

    const result = await processEmailWithKnowReply(mockSupabaseClient, "user1", payload, "interaction1");

    assertEquals(result.success, true, "Result success should be true");
    assertEquals(result.errors.length, 0, "Result errors should be empty");
    assertMatch(result.warnings[0], /Successfully processed email with 1 out of 1 matched agent\(s\)/);

    assertEquals(fetchStub.callCount, 1, "Fetch (KnowReply API) should be called once");
    const fetchArgBody = JSON.parse(fetchStub.getCall(0).args[1].body as string);
    assertEquals(fetchArgBody.agent_id, "agent1", "Agent ID in fetch call body is incorrect");

    const activityLogInsertStub = supabaseFromStub.withArgs('activity_logs').getCall(0)?.returnValue.insert;
    assert(activityLogInsertStub?.called, "Activity log insert not called for success");

    let successLogFound = false;
    activityLogInsertStub?.getCalls().forEach(call => {
      if (call.args[0].action === 'knowreply_processing_success' && call.args[0].details.agent_id === 'agent1') {
        successLogFound = true;
      }
    });
    assert(successLogFound, "Success activity log for agent1 not found");

    const emailInteractionsUpdateStub = supabaseFromStub.withArgs('email_interactions').getCall(0)?.returnValue.update;
    assert(emailInteractionsUpdateStub?.called, "email_interactions update not called");
    // Check if the eq part of update().eq() was called with interaction1
    const emailInteractionsEqStub = emailInteractionsUpdateStub?.getCall(0).returnValue.eq;
    assert(emailInteractionsEqStub?.calledWith("interaction1"), "email_interactions update not called with correct interaction ID");

    teardownMocks();
  });

  await t.step("Scenario 1b: Single Agent Match (agent1) - NO MCPs", async () => {
    setupMocks();
    const payload = createMockPayload(["agent1@example.com"]);
    getAgentIdsByEmailsStub.resolves(['agent1']);

    const mcpMappingsActiveEqStub = supabaseFromStub.withArgs('knowreply_agent_mcp_mappings').getCall(0).returnValue.select().eq().eq;
    mcpMappingsActiveEqStub.resolves({ data: [], error: null }); // No MCP mappings for agent1

    // mcp_endpoints should not be called if no mcp_endpoint_ids from previous step
    const mcpEpInStub = supabaseFromStub.withArgs('mcp_endpoints').getCall(0)?.returnValue.select().in;

    const result = await processEmailWithKnowReply(mockSupabaseClient, "user1-no-mcp", payload, "interaction-no-mcp");

    assertEquals(result.success, true, "Result success for no-MCP agent");
    assertEquals(result.errors.length, 0);
    assertMatch(result.warnings[0], /Successfully processed email with 1 out of 1 matched agent\(s\)/);

    assertEquals(fetchStub.callCount, 1, "Fetch (KnowReply API) should be called once for no-MCP agent");
    const fetchArgBody = JSON.parse(fetchStub.getCall(0).args[1].body as string);
    assertEquals(fetchArgBody.agent_id, "agent1");
    assertEquals(fetchArgBody.mcp_results.length, 0);
    assertMatch(fetchArgBody.mcp_action_digest, /No MCP actions were deemed necessary based on the email content.|MCP planning skipped: Agent has no MCP endpoints configured./i);


    const activityLogInsertStub = supabaseFromStub.withArgs('activity_logs').getCall(0)?.returnValue.insert;
    let successLogFound = false;
    activityLogInsertStub?.getCalls().forEach(call => {
      if (call.args[0].action === 'knowreply_processing_success' && call.args[0].details.agent_id === 'agent1') {
        successLogFound = true;
      }
    });
    assert(successLogFound, "Success activity log for agent1 (no MCP) not found");

    if(mcpEpInStub) { // It might not be called if logic short-circuits
        assert(!mcpEpInStub.called || mcpEpInStub.calledWith([]), "MCP Endpoints 'in' clause should not be called with IDs if no MCPs mapped");
    }


    teardownMocks();
  });

  await t.step("Scenario 2: No Agent Match", async () => {
    setupMocks();
    const payload = createMockPayload(["unknown@example.com"]);
    getAgentIdsByEmailsStub.resolves([]);

    const result = await processEmailWithKnowReply(mockSupabaseClient, "user2", payload, "interaction2");

    assertEquals(result.success, true);
    assertMatch(result.warnings[0], /No agents found matching recipient emails/);
    assertEquals(result.errors.length, 0);
    assertEquals(fetchStub.called, false);

    teardownMocks();
  });

  await t.step("Scenario 3: Multiple Different Agents Match (agent1, agent2)", async () => {
    setupMocks();
    const payload = createMockPayload(["agent1@example.com"], ["agent2@foo.bar"]);

    getAgentIdsByEmailsStub.resolves(["agent1", "agent2"]);

    const mcpMappingsActiveEqStub = supabaseFromStub.withArgs('knowreply_agent_mcp_mappings').getCall(0).returnValue.select().eq().eq;
    mcpMappingsActiveEqStub.resolves({
        data: [
            { agent_id: 'agent1', mcp_endpoint_id: 'mcp1' },
            { agent_id: 'agent2', mcp_endpoint_id: 'mcp2' }
        ],
        error: null
    });

    const mcpEpActiveEqStub = supabaseFromStub.withArgs('mcp_endpoints').getCall(0).returnValue.select().in().eq().eq;
    mcpEpActiveEqStub.resolves({
        data: [
            { id: 'mcp1', name: 'TestMCP1', provider_name: 'test', action_name: 'do_stuff1', active: true, instructions: 'Test MCP1 instructions' },
            { id: 'mcp2', name: 'TestMCP2', provider_name: 'test', action_name: 'do_stuff2', active: true, instructions: 'Test MCP2 instructions' }
        ],
        error: null
    });

    const result = await processEmailWithKnowReply(mockSupabaseClient, "user3", payload, "interaction3");

    assertEquals(result.success, true, "Multi-agent: Result success should be true");
    assertEquals(result.errors.length, 0, "Multi-agent: Result errors should be empty");
    assertMatch(result.warnings[0], /Successfully processed email with 2 out of 2 matched agent\(s\)/);

    assertEquals(fetchStub.callCount, 2, "Multi-agent: Fetch (KnowReply API) should be called twice");

    const agentIdsCalled = [
        JSON.parse(fetchStub.getCall(0).args[1].body as string).agent_id,
        JSON.parse(fetchStub.getCall(1).args[1].body as string).agent_id
    ].sort();
    assertEquals(agentIdsCalled, ["agent1", "agent2"], "Multi-agent: Correct agents not processed");

    const activityLogInsertStub = supabaseFromStub.withArgs('activity_logs').getCall(0)?.returnValue.insert;
    assert(activityLogInsertStub?.calledTwice, "Multi-agent: Activity log insert not called twice for successes");

    let agent1LogFound = false;
    let agent2LogFound = false;
    activityLogInsertStub?.getCalls().forEach(call => {
      if (call.args[0].action === 'knowreply_processing_success') {
        if (call.args[0].details.agent_id === 'agent1') agent1LogFound = true;
        if (call.args[0].details.agent_id === 'agent2') agent2LogFound = true;
      }
    });
    assert(agent1LogFound, "Multi-agent: Success activity log for agent1 not found");
    assert(agent2LogFound, "Multi-agent: Success activity log for agent2 not found");

    teardownMocks();
  });

  await t.step("Scenario 4: Multiple Emails, Same Agent Match (agent1)", async () => {
    setupMocks();
    const payload = createMockPayload(["email1@example.com"], ["email2@example.com"]); // Both map to agent1

    getAgentIdsByEmailsStub.resolves(["agent1"]); // db helper returns unique IDs

    const mcpMappingsActiveEqStub = supabaseFromStub.withArgs('knowreply_agent_mcp_mappings').getCall(0).returnValue.select().eq().eq;
    mcpMappingsActiveEqStub.resolves({ data: [{ agent_id: 'agent1', mcp_endpoint_id: 'mcp1' }], error: null });

    const mcpEpActiveEqStub = supabaseFromStub.withArgs('mcp_endpoints').getCall(0).returnValue.select().in().eq().eq;
    mcpEpActiveEqStub.resolves({ data: [{ id: 'mcp1', name: 'TestMCP', provider_name: 'test', action_name: 'do_stuff', active: true, instructions: 'Test MCP instructions' }], error: null });

    const result = await processEmailWithKnowReply(mockSupabaseClient, "user4", payload, "interaction4");

    assertEquals(result.success, true);
    assertEquals(result.errors.length, 0);
    assertMatch(result.warnings[0], /Successfully processed email with 1 out of 1 matched agent\(s\)/);
    assertEquals(fetchStub.callCount, 1);
    assertEquals(JSON.parse(fetchStub.getCall(0).args[1].body as string).agent_id, "agent1");
    teardownMocks();
  });

  await t.step("Scenario 5: Email in Bcc maps to agent3", async () => {
    setupMocks();
    const payload = createMockPayload(["to@example.com"], ["cc@example.com"], ["agent3@example.com"]);

    getAgentIdsByEmailsStub.callsFake(async (_supabase, _userId, emails) => {
        if (emails.includes("agent3@example.com")) return Promise.resolve(["agent3"]);
        return Promise.resolve([]);
    });

    const mcpMappingsActiveEqStub = supabaseFromStub.withArgs('knowreply_agent_mcp_mappings').getCall(0).returnValue.select().eq().eq;
    mcpMappingsActiveEqStub.resolves({ data: [{ agent_id: 'agent3', mcp_endpoint_id: 'mcp3' }], error: null });

    const mcpEpActiveEqStub = supabaseFromStub.withArgs('mcp_endpoints').getCall(0).returnValue.select().in().eq().eq;
    mcpEpActiveEqStub.resolves({ data: [{ id: 'mcp3', name: 'TestMCP3', provider_name: 'test', action_name: 'do_stuff3', active: true, instructions: 'Test MCP3 instructions' }], error: null });

    const result = await processEmailWithKnowReply(mockSupabaseClient, "user5", payload, "interaction5");

    assertEquals(result.success, true);
    assertMatch(result.warnings[0], /Successfully processed email with 1 out of 1 matched agent\(s\)/);
    assertEquals(fetchStub.callCount, 1);
    assertEquals(JSON.parse(fetchStub.getCall(0).args[1].body as string).agent_id, "agent3");
    teardownMocks();
  });

  // Test Case 6: Agent Matched by Email, but No MCP Mappings - Covered by Scenario 1b

  // Restore original functions after all tests in this suite are done
  // This is tricky with Deno's test structure if not careful.
  // Best practice is often to restore in an afterAll hook if the test runner supports it,
  // or ensure each test cleans up its own stubs as done with teardownMocks.
});

// Final cleanup (if necessary and if a global afterAll concept exists or is simulated)
// dbModule.getAgentIdsByEmails = originalGetAgentIdsByEmails;
// globalThis.fetch = originalFetch;

console.log("agentManager.test.ts created and initial tests structured.");
console.log("Run with: deno test --allow-env --allow-net supabase/functions/postmark-webhook/agentManager.test.ts");
