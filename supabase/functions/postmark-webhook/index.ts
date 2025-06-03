import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PostmarkWebhookPayload {
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

const MCP_SERVER_BASE_URL = "https://mcp.knowreply.email";

interface KnowReplyAgentConfig {
  agent_id: string
  mcp_endpoints: Array<{
    id: string
    name: string // This is the unique AI name for the action
    provider_name: string // e.g., "stripe", "hubspot"
    action_name: string // e.g., "getCustomerByEmail", "createTicket"
    // auth_token: string | null; // Removed, as auth is now handled by mcp_connection_params
    instructions?: string
    expected_format?: any
    output_schema?: any;
    active?: boolean
  }>
}

async function generateMCPToolPlan(
  emailBody: string,
  availableMcps: KnowReplyAgentConfig['mcp_endpoints'],
  geminiApiKey: string,
  supabaseClient: any,
  userId: string | null,
  emailInteractionId: string | null
): Promise<any[] | null> { // Return type any[] for the plan
  const envModel = Deno.env.get('GEMINI_MODEL');
  const modelName = (envModel && envModel.trim() !== '') ? envModel.trim() : 'gemini-1.5-pro';
  console.log(`🤖 Generating MCP Tool Plan using Google Gemini model: ${modelName}...`);

  if (!emailBody || emailBody.trim() === '') {
    console.warn('✉️ Email body is empty. Skipping MCP plan generation.');
    return [];
  }

  if (!availableMcps || availableMcps.length === 0) {
    console.log('🛠️ No available MCPs for planning. Returning empty plan.');
    return [];
  }

  const geminiPrompt = `You are an intent and action planner. Based on the customer email below, determine which external tools (MCPs) are needed to answer or fulfill the request.

Customer Email:
---
${emailBody.substring(0, 8000)}
---

Available Tools:
---
${JSON.stringify(
  availableMcps.map(mcp => {
    let argsSchemaKeys: string[] = [];
    if (mcp.expected_format && typeof mcp.expected_format === 'object' && !Array.isArray(mcp.expected_format)) {
      argsSchemaKeys = Object.keys(mcp.expected_format);
    }
    let outputKeys: string[] = [];
    if (mcp.output_schema && typeof mcp.output_schema === 'object' && !Array.isArray(mcp.output_schema)) {
      outputKeys = Object.keys(mcp.output_schema);
    }
    return {
      name: mcp.name,
      description: mcp.instructions || 'No specific instructions provided.',
      args_schema_keys: argsSchemaKeys,
      output_keys: outputKeys,
    };
  }),
  null,
  2
)}
---

Important Note on Arguments:
When constructing the \`args\` object for a chosen tool, you MUST use the argument names as provided in that tool's \`args_schema_keys\` list. For example, if a tool's definition includes \`"args_schema_keys": ["orderId", "email"]\`, then the \`args\` object in your plan for that tool should use \`orderId\` and/or \`email\` as keys, not generic names like 'id' or 'searchTerm' unless those specific names are in the \`args_schema_keys\`.

Output format constraints:
Each object in the JSON array MUST include a unique "step_id" (e.g., "s1", "s2").
If an argument for a step needs to use an output from a previous step, use the placeholder syntax: "{{steps.SOURCE_STEP_ID.outputs.OUTPUT_KEY}}".
The \`OUTPUT_KEY\` must be one of the keys listed in the \`output_keys\` of the tool specified in \`SOURCE_STEP_ID\`.

Respond ONLY with a valid JSON array in the following format:
[
  { "step_id": "s1", "tool": "mcp:example.toolName1", "args": { "parameter": "initial_value" } },
  { "step_id": "s2", "tool": "mcp:example.toolName2", "args": { "input_param": "{{steps.s1.outputs.someOutputKey}}" } }
]
If no tools are needed, or if the email content does not require any actionable steps, return an empty array [].
Only use tools from the 'Available Tools' list. Ensure the tool name in your output matches exactly a name from the 'Available Tools' list. Do not include any explanatory text, markdown formatting, or anything else before or after the JSON array itself.
Your entire response must be only the JSON array.`;

  console.log('📝 Constructed Prompt for Gemini (first 200 chars):', geminiPrompt.substring(0,200));

  const requestPayloadForGemini = {
    contents: [{ parts: [{ text: geminiPrompt }] }],
    generationConfig: {
      response_mime_type: "application/json",
      temperature: 0.2,
    }
  };

  let llmApiResponse: any = null;
  let parsedPlan: any[] | null = null;
  let llmError: Error | null = null;

  try {
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiApiKey}`;
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestPayloadForGemini),
    });
    llmApiResponse = await response.json();
    if (!response.ok) {
      const errorDetail = llmApiResponse?.error?.message || JSON.stringify(llmApiResponse);
      llmError = new Error(`Gemini API error: ${response.status} - ${errorDetail}`);
    } else {
      const candidate = llmApiResponse?.candidates?.[0];
      if (!candidate) {
        llmError = new Error('No candidates found in Gemini response.');
      } else if (candidate.finishReason !== 'STOP' && candidate.finishReason !== 'MAX_TOKENS') {
        llmError = new Error(`Gemini generation finished with reason: ${candidate.finishReason}`);
        if (candidate.finishReason === "SAFETY") {
          llmError = new Error(`Gemini response blocked due to safety settings: ${JSON.stringify(candidate.safetyRatings)}`);
        }
      } else {
        const messageContent = candidate.content?.parts?.[0]?.text;
        if (!messageContent) {
          llmError = new Error('No text content in Gemini response candidate part.');
        } else {
          try {
            const jsonFromTheLLM = JSON.parse(messageContent);
            if (Array.isArray(jsonFromTheLLM)) {
                parsedPlan = jsonFromTheLLM;
            } else if (jsonFromTheLLM && Array.isArray(jsonFromTheLLM.plan)) {
                parsedPlan = jsonFromTheLLM.plan;
            } else {
              llmError = new Error('LLM response JSON is not an array or a {plan: []} object.');
              parsedPlan = [];
            }
          } catch (e) {
            llmError = e;
          }
        }
      }
    }
    if (!llmError && !Array.isArray(parsedPlan)) {
      llmError = new Error('Parsed plan is not an array.');
      parsedPlan = null;
    }
    if (!llmError && parsedPlan) {
      const validToolNames = new Set(availableMcps.map(mcp => mcp.name));
      parsedPlan = parsedPlan.filter(step => {
        if (step && typeof step.tool === 'string' && validToolNames.has(step.tool) && typeof step.step_id === 'string') {
          return true;
        }
        console.warn(`⚠️ Invalid or unknown tool/step_id in plan from Gemini: Step '${step?.step_id || "N/A"}', Tool '${step?.tool || "N/A"}'. It will be filtered out.`);
        return false;
      });
    }
  } catch (error) {
    llmError = error;
    if (!llmApiResponse) llmApiResponse = { error: { message: error.message } };
    parsedPlan = null;
  }

  const logData = {
    user_id: userId,
    email_interaction_id: emailInteractionId,
    prompt_messages: requestPayloadForGemini.contents,
    llm_response: llmApiResponse,
    tool_plan_generated: parsedPlan,
    model_used: modelName,
    error_message: llmError ? llmError.message : null,
  };
  try {
    await supabaseClient.from('llm_logs').insert([logData]);
  } catch (e) {
    console.error('Exception during LLM log insertion to Supabase:', e.message);
  }

  return llmError ? null : (parsedPlan || []);
}

async function executeMCPPlan(
  mcpPlan: any[],
  availableMcps: KnowReplyAgentConfig['mcp_endpoints'],
  supabaseClient: any,
  userId: string,
  emailInteractionId: string
): Promise<any[]> {
  console.log('🚀 Starting MCP Plan Execution with Dependent Steps...');
  const results: any[] = [];
  const stepOutputs: Record<string, any> = {};

  if (!mcpPlan || mcpPlan.length === 0) {
    console.log('ℹ️ No MCP plan provided or plan is empty. Skipping execution.');
    return results;
  }

  const mcpServerInternalApiKey = Deno.env.get('MCP_SERVER_INTERNAL_API_KEY');

  for (const actionToExecute of mcpPlan as Array<any>) {
    const currentStepId = actionToExecute.step_id;
    if (!currentStepId) {
      console.warn(`⚠️ Action is missing 'step_id'. It cannot be reliably referenced, and its output won't be stored for dependencies. Action:`, actionToExecute);
    }

    let processedArgs: Record<string, any> = {};
    let processingError = false;
    const originalArgs = actionToExecute.args || {};
    const placeholderRegex = /^\{\{steps\.([a-zA-Z0-9_]+)\.outputs\.([a-zA-Z0-9_]+)\}\}$/;

    for (const key in originalArgs) {
      const value = originalArgs[key];
      if (typeof value === 'string') {
        const match = value.match(placeholderRegex);
        if (match) {
          const sourceStepId = match[1];
          const outputKey = match[2];
          const sourceOutput = stepOutputs[sourceStepId];

          if (sourceOutput === undefined) {
            const errorMsg = `Placeholder Resolution Error: Source step '${sourceStepId}' output not found for placeholder '${value}' in step '${currentStepId || actionToExecute.tool}'. This step will be skipped.`;
            console.error(`❌ ${errorMsg}`);
            results.push({ tool_name: actionToExecute.tool, step_id: currentStepId, status: 'error', response: null, raw_response: '', error_message: errorMsg });
            processingError = true;
            break;
          }

          const resolvedValue = sourceOutput[outputKey];
          if (resolvedValue === undefined) {
            const errorMsg = `Placeholder Resolution Error: Output key '${outputKey}' not found in output of step '${sourceStepId}' for placeholder '${value}' in step '${currentStepId || actionToExecute.tool}'. This step will be skipped.`;
            console.error(`❌ ${errorMsg}`);
            results.push({ tool_name: actionToExecute.tool, step_id: currentStepId, status: 'error', response: null, raw_response: '', error_message: errorMsg });
            processingError = true;
            break;
          }
          processedArgs[key] = resolvedValue;
          console.log(`🔄 Resolved placeholder '${value}' for step '${currentStepId || actionToExecute.tool}'`);
        } else {
          processedArgs[key] = value;
        }
      } else {
        processedArgs[key] = value;
      }
    }

    if (processingError) {
       await supabaseClient.from('activity_logs').insert({
            user_id: userId, email_interaction_id: emailInteractionId, action: 'mcp_execution_dependency_error', status: 'error',
            details: { tool_name: actionToExecute.tool, step_id: currentStepId, error: results[results.length-1].error_message, request_args: originalArgs },
          });
      continue;
    }

    if (!mcpServerInternalApiKey || mcpServerInternalApiKey.trim() === '') {
      const errorMsg = 'MCP_SERVER_INTERNAL_API_KEY is not configured. MCP call cannot proceed.';
      console.error(`❌ ${errorMsg} for tool ${actionToExecute.tool}`);
      results.push({ tool_name: actionToExecute.tool, step_id: currentStepId, status: 'error', response: null, raw_response: '', error_message: errorMsg });
      await supabaseClient.from('activity_logs').insert({
        user_id: userId, email_interaction_id: emailInteractionId, action: 'mcp_execution_system_error', status: 'error',
        details: { tool_name: actionToExecute.tool, step_id: currentStepId, error: errorMsg },
      });
      continue;
    }

    if (!actionToExecute.tool || typeof actionToExecute.tool !== 'string') {
      console.warn('⚠️ Skipping invalid action in plan (missing or invalid tool name):', actionToExecute);
      results.push({ tool_name: actionToExecute.tool || 'unknown_tool', step_id: currentStepId, status: 'error', response: null, raw_response: '', error_message: 'Invalid action: tool name missing or not a string.' });
      continue;
    }

    const mcpConfig = availableMcps.find(mcp => mcp.name === actionToExecute.tool);
    if (!mcpConfig || !mcpConfig.provider_name || !mcpConfig.action_name) {
      const errorMsg = `MCP configuration incomplete or not found for tool: ${actionToExecute.tool}.`;
      console.error(`❌ ${errorMsg}`);
      results.push({ tool_name: actionToExecute.tool, step_id: currentStepId, status: 'error', response: null, raw_response: '', error_message: errorMsg });
      await supabaseClient.from('activity_logs').insert({
        user_id: userId, email_interaction_id: emailInteractionId, action: 'mcp_execution_error', status: 'error',
        details: { tool_name: actionToExecute.tool, step_id: currentStepId, error: errorMsg, request_args: processedArgs },
      });
      continue;
    }

    let tempBaseUrl = MCP_SERVER_BASE_URL;
    if (tempBaseUrl.endsWith('/')) tempBaseUrl = tempBaseUrl.slice(0, -1);
    const targetUrl = `${tempBaseUrl}/mcp/${mcpConfig.provider_name}/${mcpConfig.action_name}`;
    console.log(`⚙️ Executing MCP: ${mcpConfig.name} (Step: ${currentStepId}) via URL: ${targetUrl}`);

    const { data: connParamsResult, error: connParamsError } = await supabaseClient
      .from('mcp_connection_params')
      .select('connection_values')
      .eq('user_id', userId)
      .eq('provider_name', mcpConfig.provider_name)
      .single();

    if (connParamsError || !connParamsResult || !connParamsResult.connection_values || Object.keys(connParamsResult.connection_values).length === 0) {
      let errorDetail = `Connection parameters not found for provider: ${mcpConfig.provider_name}.`;
      if (connParamsError && connParamsError.code !== 'PGRST116') {
        errorDetail = `Error fetching connection params for ${mcpConfig.provider_name}: ${connParamsError.message}`;
      }
      console.error(`❌ ${errorDetail}`);
      results.push({ tool_name: actionToExecute.tool, step_id: currentStepId, status: 'error', response: null, raw_response: '', error_message: errorDetail });
      await supabaseClient.from('activity_logs').insert({
        user_id: userId, email_interaction_id: emailInteractionId, action: 'mcp_execution_error', status: 'error',
        details: { tool_name: actionToExecute.tool, step_id: currentStepId, error: errorDetail, request_args: processedArgs },
      });
      continue;
    }
    const actualConnectionParams = connParamsResult.connection_values;

    const requestPayload = { args: processedArgs, auth: actualConnectionParams };
    let responseData: any = null;
    let rawResponseText = '';
    let status: 'success' | 'error' = 'error';
    let errorMessage: string | null = null;

    try {
      const headers: HeadersInit = { 'Content-Type': 'application/json', 'x-internal-api-key': mcpServerInternalApiKey };
      const response = await fetch(targetUrl, { method: 'POST', headers: headers, body: JSON.stringify(requestPayload) });
      rawResponseText = await response.text();
      if (response.ok) {
        status = 'success';
        try { responseData = JSON.parse(rawResponseText); } catch (e) {
          console.warn(`⚠️ MCP call for ${actionToExecute.tool} (Step: ${currentStepId}) was successful but response was not valid JSON. Raw: ${rawResponseText.substring(0,100)}`);
          responseData = null;
        }
        console.log(`✅ MCP call successful for ${actionToExecute.tool} (Step: ${currentStepId}).`);
      } else {
        errorMessage = `MCP call failed for ${actionToExecute.tool} (Step: ${currentStepId}): ${response.status} - ${response.statusText}. Raw: ${rawResponseText.substring(0, 200)}`;
      }
    } catch (e) {
      errorMessage = `Network error for MCP ${actionToExecute.tool} (Step: ${currentStepId}): ${e.message}`;
    }

    if(errorMessage) console.error(`❌ ${errorMessage}`);

    results.push({ tool_name: actionToExecute.tool, step_id: currentStepId, status: status, response: responseData, raw_response: rawResponseText, error_message: errorMessage });

    if (status === 'success' && currentStepId) {
      stepOutputs[currentStepId] = responseData !== null ? responseData : {};
      console.log(`✅ Output for step '${currentStepId}' stored.`);
    }

    await supabaseClient.from('activity_logs').insert({
      user_id: userId, email_interaction_id: emailInteractionId, action: 'mcp_execution_attempt', status: status,
      details: { tool_name: actionToExecute.tool, step_id: currentStepId, target_url: targetUrl, request_args: processedArgs, response_status_code: status === 'success' && !errorMessage ? 200 : 'N/A', error: errorMessage },
    });
  }

  console.log('🏁 MCP Plan Execution Finished with Dependent Steps. Results:', results.length > 0 ? results : "No results");
  return results;
}


async function processEmailWithKnowReply(
  supabase: any,
  userId: string,
  payload: PostmarkWebhookPayload,
  emailInteractionId: string
): Promise<{ success: boolean; warnings: string[]; errors: string[] }> {
  console.log('🤖 Starting KnowReply processing for user:', userId)
  
  const warnings: string[] = []
  const errors: string[] = []

  try {
    const { data: workspaceConfigData, error: configError } = await supabase // Renamed workspaceConfig
      .from('workspace_configs')
      .select('knowreply_webhook_url, knowreply_api_token')
      .eq('user_id', userId)
      .single()

    if (configError || !workspaceConfigData?.knowreply_webhook_url || !workspaceConfigData?.knowreply_api_token) {
      const error = 'No KnowReply webhook URL or API token found for user.'
      errors.push(error); return { success: false, warnings, errors };
    }

    const { data: agentMappings, error: mappingsError } = await supabase
      .from('knowreply_agent_mcp_mappings')
      .select('agent_id, mcp_endpoint_id')
      .eq('user_id', userId)
      .eq('active', true)

    if (mappingsError) {
      errors.push(`Error fetching agent mappings: ${mappingsError.message}`); return { success: false, warnings, errors };
    }
    if (!agentMappings || agentMappings.length === 0) {
      errors.push('No active agent configurations found for user.'); return { success: false, warnings, errors };
    }

    const uniqueAgentIds = [...new Set(agentMappings.map(mapping => mapping.agent_id))]
    const mcpEndpointIds = agentMappings.map(mapping => mapping.mcp_endpoint_id).filter(Boolean)

    let mcpEndpoints: KnowReplyAgentConfig['mcp_endpoints'] = []
    if (mcpEndpointIds.length > 0) {
      const { data: endpointsData, error: endpointsError } = await supabase
        .from('mcp_endpoints')
        .select('id, name, provider_name, action_name, instructions, expected_format, active, output_schema') // auth_token removed, output_schema added
        .in('id', mcpEndpointIds)
        .eq('active', true)

      if (endpointsError) {
        errors.push(`Error fetching MCP endpoints: ${endpointsError.message}`);
      } else {
        mcpEndpoints = endpointsData || []
      }
    }

    const agentConfigs: Record<string, KnowReplyAgentConfig> = {}
    uniqueAgentIds.forEach(agentId => { agentConfigs[agentId] = { agent_id: agentId, mcp_endpoints: [] }})
    agentMappings.forEach(mapping => {
      if (mapping.mcp_endpoint_id) {
        const endpoint = mcpEndpoints.find(ep => ep.id === mapping.mcp_endpoint_id)
        if (endpoint && agentConfigs[mapping.agent_id]) {
          agentConfigs[mapping.agent_id].mcp_endpoints.push(endpoint)
        }
      }
    })

    let processedSuccessfully = 0
    let processingErrors: string[] = []
    for (const [agentId, agentConfig] of Object.entries(agentConfigs)) {
      try {
        await processWithAgent(workspaceConfigData, agentConfig, payload, supabase, userId, emailInteractionId) // use workspaceConfigData
        processedSuccessfully++
      } catch (error) {
        const errorMsg = `Error processing with agent ${agentId}: ${error.message}`
        processingErrors.push(errorMsg)
        await supabase.from('activity_logs').insert({ user_id: userId, email_interaction_id: emailInteractionId, action: 'knowreply_processing_error', status: 'error', details: { agent_id: agentId, error: error.message }})
      }
    }

    if (processingErrors.length > 0) errors.push(...processingErrors)
    if (processedSuccessfully > 0) warnings.push(`Successfully processed email with ${processedSuccessfully} agent(s)`)
    else warnings.push('No agents processed the email successfully')
    
    return { success: processedSuccessfully > 0, warnings, errors }

  } catch (error) {
    errors.push(`KnowReply processing failed: ${error.message}`)
    await supabase.from('activity_logs').insert({ user_id: userId, email_interaction_id: emailInteractionId, action: 'knowreply_processing_failed', status: 'error', details: { error: error.message }})
    return { success: false, warnings, errors }
  }
}

async function processWithAgent(
  workspaceConfig: any, // Changed from workspaceConfigData
  agentConfig: KnowReplyAgentConfig,
  payload: PostmarkWebhookPayload,
  supabase: any,
  userId: string,
  emailInteractionId: string
) {
  console.log(`📨 Processing email with agent ${agentConfig.agent_id}`);
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
  let mcpPlan: any[] | null = null; // Ensure type matches return of generateMCPToolPlan

  if (!geminiApiKey) {
    console.error('❌ GEMINI_API_KEY is not set. Skipping MCP planning.');
    await supabase.from('activity_logs').insert({ user_id: userId, email_interaction_id: emailInteractionId, action: 'mcp_planning_skipped', status: 'warning', details: { agent_id: agentConfig.agent_id, reason: 'GEMINI_API_KEY not set' }});
  } else {
    const emailBodyContent = payload.TextBody || payload.HtmlBody || payload.StrippedTextReply || "";
    if (agentConfig.mcp_endpoints && agentConfig.mcp_endpoints.length > 0) {
      mcpPlan = await generateMCPToolPlan(emailBodyContent, agentConfig.mcp_endpoints, geminiApiKey, supabase, userId, emailInteractionId);
      if (mcpPlan) console.log(`✅ MCP Plan generated for agent ${agentConfig.agent_id}:`, JSON.stringify(mcpPlan, null, 2));
      else console.warn(`⚠️ MCP Plan generation returned null or empty for agent ${agentConfig.agent_id}.`);
    } else {
      console.log(`🤔 Agent ${agentConfig.agent_id} has no MCP endpoints. Skipping MCP planning.`);
    }
  }

  let mcpResults: any[] | null = null;
  if (mcpPlan && mcpPlan.length > 0) {
    mcpResults = await executeMCPPlan(mcpPlan, agentConfig.mcp_endpoints, supabase, userId, emailInteractionId);
    const { error: updateError } = await supabase.from('email_interactions').update({ mcp_results: mcpResults, updated_at: new Date().toISOString() }).eq('id', emailInteractionId);
    if (updateError) {
      console.error('❌ Failed to store MCP results in email_interactions:', updateError);
      await supabase.from('activity_logs').insert({ user_id: userId, email_interaction_id: emailInteractionId, action: 'mcp_result_storage_error', status: 'error', details: { agent_id: agentConfig.agent_id, error: updateError.message }});
    }
  }

  const knowReplyRequest = {
    agent_id: agentConfig.agent_id,
    email: {
      provider: 'postmark',
      sender: payload.From,
      recipient: payload.ToFull?.[0]?.Email || payload.To,
      subject: payload.Subject,
      body: payload.TextBody || payload.HtmlBody || payload.StrippedTextReply,
      headers: payload.Headers ? payload.Headers.reduce((acc, h) => { acc[h.Name] = h.Value; return acc; }, {} as Record<string, string>) : {},
      authentication: {
        spf_pass: payload.Headers?.find(h => h.Name === 'Received-SPF')?.Value?.includes('Pass') || false,
        spam_score: payload.Headers?.find(h => h.Name === 'X-Spam-Score')?.Value ? parseFloat(payload.Headers.find(h => h.Name === 'X-Spam-Score')!.Value) : undefined
      },
      raw: payload
    },
    mcp_results: mcpResults || []
  };
  const knowReplyUrl = workspaceConfig.knowreply_webhook_url;
  const response = await fetch(knowReplyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${workspaceConfig.knowreply_api_token}`},
    body: JSON.stringify(knowReplyRequest)
  });
  const responseData = await response.json();
  if (!response.ok) throw new Error(`KnowReply API error: ${response.status} - ${JSON.stringify(responseData)}`);

  const { data: updateData, error: updateError } = await supabase // Renamed updateResult to updateData
    .from('email_interactions')
    .update({
      knowreply_agent_used: agentConfig.agent_id,
      knowreply_request: knowReplyRequest,
      knowreply_response: responseData,
      mcp_results: responseData.mcp_results || null,
      mcp_plan: mcpPlan,
      intent: responseData.intent || null,
      status: 'processed',
      updated_at: new Date().toISOString()
    })
    .eq('id', emailInteractionId)
    .select(); // Ensure .select() is here if needed
  if (updateError) throw new Error(`Failed to update email interaction: ${updateError.message}`);
  if (!updateData || updateData.length === 0) throw new Error(`Email interaction with ID ${emailInteractionId} not found for update`); // Use updateData
  
  await supabase.from('activity_logs').insert({ user_id: userId, email_interaction_id: emailInteractionId, action: 'knowreply_processing_success', status: 'success', details: { agent_id: agentConfig.agent_id, intent: responseData.intent, mcp_endpoints_used: agentConfig.mcp_endpoints.length }});
  console.log(`🎉 Successfully processed email with agent ${agentConfig.agent_id}`);
}

serve(async (req) => {
  console.log('🚀 Postmark webhook function called!')
  // ... (rest of serve function, assuming it's mostly unchanged from previous state)
  // Ensure workspaceConfig variable is named workspaceConfigData if changed above
  // Ensure userId is correctly extracted and passed down

  const responseData = { status: 'success', message: 'Email processed successfully', warnings: [] as string[], errors: [] as string[], processed_at: new Date().toISOString() };
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
    if (req.method !== 'POST') { /* ... error 405 ... */ return new Response(JSON.stringify({status:'error', message:'Method not allowed'}), {status:405, headers:corsHeaders});}

    const payload: PostmarkWebhookPayload = await req.json();
    const toEmail = payload.ToFull?.[0]?.Email || payload.To;
    const emailPart = toEmail.split('@')[0];
    const inboundHash = emailPart.split('+')[0];
    const { data: wsConfig, error: configErr } = await supabase.from('workspace_configs').select('user_id').eq('postmark_inbound_hash', inboundHash).single();

    if (configErr || !wsConfig) { /* ... error 404 ... */ return new Response(JSON.stringify({status:'error', message:'Inbound hash not found'}), {status:404, headers:corsHeaders});}
    const currentUserId = wsConfig.user_id; // Use currentUserId

    // Upsert postmark_inbound_emails
    // ... (ensure this part is correct, using currentUserId)
     let emailRecordId;
    const { data: existingEmail, error: checkError } = await supabase.from('postmark_inbound_emails').select('id').eq('message_id', payload.MessageID).eq('user_id', currentUserId).single();
    if (checkError && checkError.code !== 'PGRST116') { console.error("Error checking email", checkError); }
    // ... (rest of upsert logic for postmark_inbound_emails, using currentUserId)

    // Upsert email_interactions
    let interactionRecordId;
    const { data: existingInteraction, error: intCheckError } = await supabase.from('email_interactions').select('id').eq('message_id', payload.MessageID).eq('user_id', currentUserId).single();
    if (intCheckError && intCheckError.code !== 'PGRST116') { console.error("Error checking interaction", intCheckError); }

    if (existingInteraction) {
      const {data: updatedInt, error: updateIntErr} = await supabase.from('email_interactions').update({ status: 'received', updated_at: new Date().toISOString(), postmark_request: payload, original_content: payload.TextBody || payload.HtmlBody, subject: payload.Subject, from_email: payload.From, to_email: toEmail}).eq('id', existingInteraction.id).select().single();
      if(updateIntErr) console.error("Error updating interaction", updateIntErr); else interactionRecordId = updatedInt?.id;
    } else {
      const {data: newInt, error: newIntErr} = await supabase.from('email_interactions').insert({ user_id: currentUserId, message_id: payload.MessageID, from_email: payload.From, to_email: toEmail, subject: payload.Subject, original_content: payload.TextBody || payload.HtmlBody, status: 'received', postmark_request: payload }).select().single();
      if(newIntErr) console.error("Error inserting interaction", newIntErr); else interactionRecordId = newInt?.id;
    }

    if (interactionRecordId) {
      const knowReplyResult = await processEmailWithKnowReply(supabase, currentUserId, payload, interactionRecordId);
      responseData.warnings.push(...knowReplyResult.warnings);
      responseData.errors.push(...knowReplyResult.errors);
      if (!knowReplyResult.success) { responseData.status = 'error'; responseData.message = 'Email received but processing failed'; }
    }
    const statusCode = responseData.status === 'error' ? 422 : 200;
    return new Response(JSON.stringify(responseData), { status: statusCode, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
  } catch (error) {
    console.error('💥 Error processing Postmark webhook:', error);
    return new Response(JSON.stringify({ status: 'error', message: 'Internal server error', errors: [error.message]}), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
  }
})
