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

export interface KnowReplyAgentConfig {
  agent_id: string
  mcp_endpoints: Array<{
    id: string
    name: string
    provider_name: string
    action_name: string
    instructions?: string
    expected_format?: any
    active?: boolean
    output_schema?: any
  }>
}

export async function generateMCPToolPlan(
  emailBody: string,
  senderEmail: string,
  senderName: string,
  availableMcps: KnowReplyAgentConfig['mcp_endpoints'],
  geminiApiKey: string,
  supabaseClient: any,
  userId: string | null,
  emailInteractionId: string | null
): Promise<object[] | null> {
  const envModel = Deno.env.get('GEMINI_MODEL');
  const modelName = (envModel && envModel.trim() !== '') ? envModel.trim() : 'gemini-1.5-pro';
  // console.log(`🤖 Generating MCP Tool Plan using Google Gemini model: ${modelName}...`);

  if (!emailBody || emailBody.trim() === '') {
    // console.warn('✉️ Email body is empty. Skipping MCP plan generation.');
    return [];
  }

  if (!availableMcps || availableMcps.length === 0) {
    // console.log('🛠️ No available MCPs for planning. Returning empty plan.');
    return [];
  }

  const geminiPrompt = `You are an intent and action planner. Based on the email sender information and customer email content below, determine which external tools (MCPs) are needed to answer or fulfill the request.

Email Sender Information:
---
Sender Name: ${senderName}
Sender Email: ${senderEmail}
---

Customer Email Content:
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
    return {
      name: mcp.name,
      description: mcp.instructions || 'No specific instructions provided.',
      args_schema_keys: argsSchemaKeys,
      output_schema: mcp.output_schema || null,
    };
  }),
  null,
  2
)}
---

Planning Sequences and Using Outputs:
If the user's request requires multiple actions, you can plan a sequence of tool calls.
To use an output from a previous step (e.g., 'steps[0]', 'steps[1]') as an argument for a subsequent step, use the placeholder syntax: '{{steps[INDEX].outputs.FIELD_NAME}}'.
- 'INDEX' is the 0-based index of the step in the plan array whose output you want to use.
- 'FIELD_NAME' is the specific field name from that step's 'output_schema'. This field name must exactly match a key present in the 'output_schema' of the tool at 'steps[INDEX]'.
The 'output_schema' provided for each tool in the "Available Tools" list shows what 'FIELD_NAME's it will return.

Important Note on Arguments:
When constructing the "args" object for a chosen tool:
- You MUST use the argument names as provided in that tool's 'args_schema_keys' list for direct inputs.
- For arguments that depend on previous steps, use the '{{steps[INDEX].outputs.FIELD_NAME}}' syntax. Ensure 'FIELD_NAME' matches the 'output_schema' of the source step.

Important Instructions for Using Sender Information:
- When planning actions, especially the first action in a sequence or any action that requires identifying the customer (e.g., fetching orders, customer details), you **must** consider using the details from the 'Email Sender Information' section (like 'Sender Email' or 'Sender Name') as arguments if the tool accepts them. For example, if a tool like 'getOrders' or 'getCustomerDetails' accepts an 'email' argument, use the 'Sender Email' provided.
- Even if a tool argument (like 'email' or 'customerId') is marked as optional (e.g., in 'args_schema_keys' or its description implies it's optional), if the 'Email Sender Information' provides relevant data for that argument, you **should** include it in the plan to ensure the action is specific and effective.
- Do not leave critical identifying arguments (like 'email' for a customer-specific lookup) as null or unprovided if the sender's information is available and directly applicable to fulfilling the user's request based on the email content.

Output format constraints:
Respond ONLY with a valid JSON array. Do not add any other text before or after the array.
If no tools are needed, or if the email content does not require any actionable steps, return an empty array [].
Only use tools from the 'Available Tools' list. Ensure the tool name in your output matches exactly a name from the 'Available Tools' list.

Example of a multi-step plan:
[
  {
    "tool": "user.getCustomerByEmail",
    "args": { "email": "customer@example.com" }
  },
  {
    "tool": "orders.getLatestOrder",
    "args": { "customerId": "{{steps[0].outputs.id}}" }
  },
  {
    "tool": "shipping.getTrackingInfo",
    "args": { "orderId": "{{steps[1].outputs.order_id}}" }
  }
]
Your entire response must be only the JSON array.`;

  // console.log('📝 Constructed Prompt for Gemini (first 200 chars):', geminiPrompt.substring(0,200));

  const requestPayloadForGemini = {
    contents: [{ parts: [{ text: geminiPrompt }] }],
    generationConfig: {
      response_mime_type: "application/json",
      temperature: 0.2,
    }
  };

  let llmApiResponse: any = null;
  let parsedPlan: object[] | null = null;
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
            if (Array.isArray(jsonFromTheLLM)) parsedPlan = jsonFromTheLLM;
            else if (jsonFromTheLLM && Array.isArray((jsonFromTheLLM as any).plan)) parsedPlan = (jsonFromTheLLM as any).plan;
            else {
              llmError = new Error('LLM response JSON is not an array or a {plan: []} object.');
              parsedPlan = [];
            }
          } catch (e) { // Catching 'e' which is 'unknown' by default
            llmError = e instanceof Error ? e : new Error(String(e));
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
      parsedPlan = parsedPlan.filter((step: any) => validToolNames.has(step?.tool));
    } else if (!llmError && !parsedPlan) {
      if (!parsedPlan) parsedPlan = [];
    }
  } catch (error) { // Catching 'error' which is 'unknown'
    llmError = error instanceof Error ? error : new Error(String(error));
    if (!llmApiResponse) llmApiResponse = { error: { message: llmError.message } };
    parsedPlan = null;
  }

  const logData = { user_id: userId, email_interaction_id: emailInteractionId, prompt_messages: requestPayloadForGemini.contents, llm_response: llmApiResponse, tool_plan_generated: parsedPlan, model_used: modelName, error_message: llmError ? llmError.message : null };
  try {
    await supabaseClient.from('llm_logs').insert([logData]);
  } catch (e) { // Catching 'e'
    console.error('Exception during LLM log insertion:', (e instanceof Error ? e.message : String(e)));
  }
  if (llmError) return null;
  return parsedPlan;
}

export function resolvePath(obj: any, path: string): any {
  if (obj === null || typeof obj !== 'object') {
    return undefined;
  }
  if (!path) return undefined;

  // Normalize path: remove leading dot if path starts with [
  let normalizedPath = path.replace(/\[(\d+)]/g, '.$1');
  if (normalizedPath.startsWith('.')) {
    normalizedPath = normalizedPath.substring(1);
  }
  const segments = normalizedPath.split('.');

  let current = obj;
  for (const segment of segments) {
    if (current === null || typeof current !== 'object') return undefined;
    if (Array.isArray(current) && /^\d+$/.test(segment)) {
      const index = parseInt(segment, 10);
      if (index >= current.length || index < 0) return undefined;
      current = current[index];
    } else if (current.hasOwnProperty(segment)) {
      current = current[segment];
    } else {
      return undefined;
    }
  }
  return current;
}

export async function executeMCPPlan(
  mcpPlan: any[],
  availableMcps: KnowReplyAgentConfig['mcp_endpoints'],
  supabaseClient: any,
  userId: string,
  emailInteractionId: string
): Promise<any[]> {
  const results: any[] = [];
  const executionOutputs: any[] = [];
  if (!mcpPlan || mcpPlan.length === 0) return results;

  const mcpServerInternalApiKey = Deno.env.get('MCP_SERVER_INTERNAL_API_KEY');
  const placeholderRegex = /^{{steps\[(\d+)]\.outputs\.([^}]+)}}$/;

  for (let i = 0; i < mcpPlan.length; i++) {
    const actionToExecute = mcpPlan[i];
    let currentActionFailed = false;
    let errorMsgForAction = '';

    if (!mcpServerInternalApiKey || mcpServerInternalApiKey.trim() === '') {
      errorMsgForAction = 'MCP_SERVER_INTERNAL_API_KEY is not configured.';
      currentActionFailed = true;
      if (!results.find(r => r.error_message === errorMsgForAction && r.tool_name !== (actionToExecute.tool || 'unknown_tool'))) {
         await supabaseClient.from('activity_logs').insert({ user_id: userId, email_interaction_id: emailInteractionId, action: 'mcp_execution_system_error', status: 'error', details: { error: errorMsgForAction } });
      }
    } else if (!actionToExecute.tool || typeof actionToExecute.tool !== 'string') {
      errorMsgForAction = 'Invalid action: tool name missing or not a string.';
      currentActionFailed = true;
    }

    const mcpConfig = !currentActionFailed ? availableMcps.find(mcp => mcp.name === actionToExecute.tool) : undefined;
    if (!currentActionFailed && (!mcpConfig || !mcpConfig.provider_name || !mcpConfig.action_name)) {
      errorMsgForAction = `MCP configuration incomplete or not found for tool: ${actionToExecute.tool}.`;
      currentActionFailed = true;
    }

    let resolvedArgs: { [key: string]: any } = {};
    let connParamsResult: any;

    if (!currentActionFailed && mcpConfig) {
        const { data, error } = await supabaseClient.from('mcp_connection_params').select('connection_values').eq('user_id', userId).eq('provider_name', mcpConfig.provider_name).single();
        connParamsResult = {data, error};
        if (connParamsResult.error || !connParamsResult.data || !connParamsResult.data.connection_values || Object.keys(connParamsResult.data.connection_values).length === 0) {
            errorMsgForAction = `Connection parameters not found or empty for provider: ${mcpConfig.provider_name}.`;
            if (connParamsResult.error && connParamsResult.error.code !== 'PGRST116') errorMsgForAction = `Error fetching connection params: ${connParamsResult.error.message}`;
            currentActionFailed = true;
        }
    }

    if (!currentActionFailed && mcpConfig) {
        for (const key in actionToExecute.args) {
          const value = actionToExecute.args[key];
          if (typeof value === 'string') {
            const match = value.match(placeholderRegex);
            if (match) {
              const refStepIndex = parseInt(match[1], 10);
              const pathToValue = match[2];
              if (refStepIndex < 0 || refStepIndex >= i) {
                errorMsgForAction = `Invalid placeholder: step index ${refStepIndex} out of bounds.`; currentActionFailed = true; break;
              }
              const previousStepOutput = executionOutputs[refStepIndex];
              if (!previousStepOutput || previousStepOutput.error) {
                errorMsgForAction = `Invalid placeholder: step ${refStepIndex} failed or produced no usable output.`; currentActionFailed = true; break;
              }
              const resolvedValue = resolvePath(previousStepOutput, pathToValue);
              if (resolvedValue === undefined) {
                errorMsgForAction = `Invalid placeholder: path '${pathToValue}' not found in output of step ${refStepIndex}.`; currentActionFailed = true; break;
              }
              resolvedArgs[key] = resolvedValue;
            } else {
              resolvedArgs[key] = value;
            }
          } else {
            resolvedArgs[key] = value;
          }
        }
    }

    let responseData: any = null;
    let rawResponseText = '';
    let status: 'success' | 'error' = 'error';

    if (currentActionFailed) {
        status = 'error';
    } else if (mcpConfig && connParamsResult?.data?.connection_values) {
        const targetUrl = `${MCP_SERVER_BASE_URL}/mcp/${mcpConfig.provider_name}/${mcpConfig.action_name}`;
        const requestPayload = { args: resolvedArgs, auth: connParamsResult.data.connection_values };
        try {
            const response = await fetch(targetUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-internal-api-key': mcpServerInternalApiKey! }, body: JSON.stringify(requestPayload) });
            rawResponseText = await response.text();
            if (response.ok) {
                status = 'success';
                try { responseData = JSON.parse(rawResponseText); executionOutputs[i] = responseData; }
                catch (e) {
                    const err = e instanceof Error ? e : new Error(String(e));
                    errorMsgForAction = `Successful call, but response not valid JSON. Raw: ${rawResponseText.substring(0,100)}... (${err.message})`;
                    responseData = null;
                    executionOutputs[i] = { error: errorMsgForAction, raw_response: rawResponseText };
                }
            } else {
                errorMsgForAction = `MCP call failed: ${response.status} - ${response.statusText}. Raw: ${rawResponseText.substring(0, 200)}`;
                executionOutputs[i] = { error: errorMsgForAction, raw_response: rawResponseText };
            }
        } catch (e) {
            const err = e instanceof Error ? e : new Error(String(e));
            errorMsgForAction = `Network or fetch error: ${err.message}`;
            rawResponseText = err.message;
            executionOutputs[i] = { error: errorMsgForAction, raw_response: rawResponseText };
        }
    }

    results.push({ tool_name: actionToExecute.tool, status: status, response: responseData, raw_response: rawResponseText, error_message: errorMsgForAction || null });
    if (status === 'error' && !executionOutputs[i]) executionOutputs[i] = { error: errorMsgForAction, raw_response: rawResponseText };

    await supabaseClient.from('activity_logs').insert({ user_id: userId, email_interaction_id: emailInteractionId, action: 'mcp_execution_attempt', status: status, details: { step: i, tool_name: actionToExecute.tool, target_url: mcpConfig ? `${MCP_SERVER_BASE_URL}/mcp/${mcpConfig.provider_name}/${mcpConfig.action_name}` : 'N/A', request_args: resolvedArgs, response_status_code: status === 'success' && !errorMsgForAction ? 200 : 'N/A', error: errorMsgForAction || null } });
  }
  return results;
}

async function processEmailWithKnowReply(
  supabase: any,
  userId: string,
  payload: PostmarkWebhookPayload,
  emailInteractionId: string
): Promise<{ success: boolean; warnings: string[]; errors: string[] }> {
  // console.log('🤖 Starting KnowReply processing for user:', userId);
  const warnings: string[] = [];
  const errors: string[] = [];
  try {
    const { data: workspaceConfig, error: configError } = await supabase.from('workspace_configs').select('knowreply_webhook_url, knowreply_api_token').eq('user_id', userId).single();
    if (configError || !workspaceConfig?.knowreply_webhook_url || !workspaceConfig?.knowreply_api_token) {
      errors.push('No KnowReply webhook URL or API token found.'); return { success: false, warnings, errors };
    }
    interface AgentMapping { agent_id: string; mcp_endpoint_id: string | null; }
    const { data: agentMappingsData, error: mappingsError } = await supabase.from('knowreply_agent_mcp_mappings').select('agent_id, mcp_endpoint_id').eq('user_id', userId).eq('active', true);
    if (mappingsError) { errors.push(`Error fetching agent mappings: ${(mappingsError as Error).message}`); return { success: false, warnings, errors };}
    const agentMappings: AgentMapping[] = agentMappingsData || [];
    if (!agentMappings || agentMappings.length === 0) { errors.push('No active agent configurations found.'); return { success: false, warnings, errors };}
    const uniqueAgentIds = [...new Set(agentMappings.map(mapping => mapping.agent_id))];
    const mcpEndpointIds = agentMappings.map(mapping => mapping.mcp_endpoint_id).filter(Boolean);
    let mcpEndpoints: KnowReplyAgentConfig['mcp_endpoints'] = [];
    if (mcpEndpointIds.length > 0) {
      const { data: endpoints, error: endpointsError } = await supabase.from('mcp_endpoints').select('id, name, provider_name, action_name, instructions, expected_format, active, output_schema').in('id', mcpEndpointIds).eq('active', true);
      if (endpointsError) { errors.push(`Error fetching MCP endpoints: ${(endpointsError as Error).message}`); }
      else { mcpEndpoints = endpoints || []; }
    }
    const agentConfigs: Record<string, KnowReplyAgentConfig> = {};
    uniqueAgentIds.forEach(agentId => { agentConfigs[agentId] = { agent_id: agentId, mcp_endpoints: [] };});
    agentMappings.forEach(mapping => {
      if (mapping.mcp_endpoint_id) {
        const endpoint = mcpEndpoints.find(ep => ep.id === mapping.mcp_endpoint_id);
        if (endpoint && agentConfigs[mapping.agent_id]) agentConfigs[mapping.agent_id].mcp_endpoints.push(endpoint);
      }
    });
    let processedSuccessfully = 0;
    for (const [agentId, agentConfig] of Object.entries(agentConfigs)) {
      try {
        await processWithAgent(workspaceConfig, agentConfig, payload, supabase, userId, emailInteractionId);
        processedSuccessfully++;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        const errorMsg = `Error processing with agent ${agentId}: ${err.message}`;
        errors.push(errorMsg);
        await supabase.from('activity_logs').insert({ user_id: userId, email_interaction_id: emailInteractionId, action: 'knowreply_processing_error', status: 'error', details: { agent_id: agentId, error: err.message }});
      }
    }
    if (processedSuccessfully > 0) warnings.push(`Successfully processed with ${processedSuccessfully} agent(s)`);
    else errors.push('No agents processed successfully');
    return { success: processedSuccessfully > 0, warnings, errors };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    errors.push(`KnowReply processing failed: ${err.message}`);
    await supabase.from('activity_logs').insert({ user_id: userId, email_interaction_id: emailInteractionId, action: 'knowreply_processing_failed', status: 'error', details: { error: err.message }});
    return { success: false, warnings, errors };
  }
}

async function processWithAgent(
  workspaceConfig: any,
  agentConfig: KnowReplyAgentConfig,
  payload: PostmarkWebhookPayload,
  supabase: any,
  userId: string,
  emailInteractionId: string
) {
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
  let mcpPlan: object[] | null = null;
  if (!geminiApiKey) {
    await supabase.from('activity_logs').insert({ user_id: userId, email_interaction_id: emailInteractionId, action: 'mcp_planning_skipped', status: 'warning', details: { agent_id: agentConfig.agent_id, reason: 'GEMINI_API_KEY not set' }});
  } else {
    const emailBodyContent = payload.TextBody || payload.HtmlBody || payload.StrippedTextReply || "";
    if (agentConfig.mcp_endpoints && agentConfig.mcp_endpoints.length > 0) {
      mcpPlan = await generateMCPToolPlan(emailBodyContent, payload.FromFull.Email, payload.FromName, agentConfig.mcp_endpoints, geminiApiKey, supabase, userId, emailInteractionId);
    }
  }
  let mcpResults: any[] | null = null;
  if (mcpPlan && mcpPlan.length > 0) {
    mcpResults = await executeMCPPlan(mcpPlan, agentConfig.mcp_endpoints, supabase, userId, emailInteractionId);
    const {error: updateError} = await supabase.from('email_interactions').update({ mcp_results: mcpResults, updated_at: new Date().toISOString() }).eq('id', emailInteractionId);
    if (updateError) {
        console.error('Failed to store MCP results in email_interactions:', updateError);
        await supabase.from('activity_logs').insert({ user_id: userId, email_interaction_id: emailInteractionId, action: 'mcp_result_storage_error', status: 'error', details: { agent_id: agentConfig.agent_id, error: updateError.message } });
    }
  }
  const knowReplyRequest = { agent_id: agentConfig.agent_id, email: { provider: 'postmark', sender: payload.From, recipient: payload.ToFull?.[0]?.Email || payload.To, subject: payload.Subject, body: payload.TextBody || payload.HtmlBody || payload.StrippedTextReply, headers: payload.Headers?.reduce((acc, h) => ({...acc, [h.Name]:h.Value}), {}), authentication: { spf_pass: payload.Headers?.find(h => h.Name === 'Received-SPF')?.Value?.includes('Pass') || false, spam_score: parseFloat(payload.Headers?.find(h => h.Name === 'X-Spam-Score')?.Value || "0") || undefined }, raw: payload }, mcp_results: mcpResults || [] };
  const response = await fetch(workspaceConfig.knowreply_webhook_url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${workspaceConfig.knowreply_api_token}`}, body: JSON.stringify(knowReplyRequest) });
  const responseData = await response.json();
  if (!response.ok) throw new Error(`KnowReply API error: ${response.status} - ${JSON.stringify(responseData)}`);
  const {error: updateIntError} = await supabase.from('email_interactions').update({ knowreply_agent_used: agentConfig.agent_id, knowreply_request: knowReplyRequest, knowreply_response: responseData, mcp_results: responseData.mcp_results || null, mcp_plan: mcpPlan, intent: responseData.intent || null, status: 'processed', updated_at: new Date().toISOString() }).eq('id', emailInteractionId).select();
  if (updateIntError) throw new Error(`Failed to update email interaction: ${updateIntError.message}`);
  await supabase.from('activity_logs').insert({ user_id: userId, email_interaction_id: emailInteractionId, action: 'knowreply_processing_success', status: 'success', details: { agent_id: agentConfig.agent_id, intent: responseData.intent, mcp_endpoints_used: agentConfig.mcp_endpoints.length }});
}

if (import.meta.main) {
  serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
    try {
      const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
      const payload: PostmarkWebhookPayload = await req.json();
      const toEmail = payload.ToFull?.[0]?.Email || payload.To;
      const emailPart = toEmail.split('@')[0];
      const inboundHash = emailPart.split('+')[0];
      const { data: workspaceConfig, error: configError } = await supabase.from('workspace_configs').select('user_id').eq('postmark_inbound_hash', inboundHash).single();

      if (configError || !workspaceConfig) {
        return new Response(JSON.stringify({ status: 'error', message: 'Inbound hash not found or config error.' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
      }
      console.log(`Received email for workspace user: ${workspaceConfig.user_id}`);
      const { data: interaction, error: interactionError } = await supabase.from('email_interactions').insert({
        user_id: workspaceConfig.user_id, message_id: payload.MessageID, from_email: payload.From, to_email: toEmail, subject: payload.Subject, status: 'received', postmark_request: payload
      }).select().single();
      if(interactionError || !interaction) throw new Error(`Could not create interaction record: ${(interactionError as Error).message}`);

      await processEmailWithKnowReply(supabase, workspaceConfig.user_id, payload, interaction.id);

      return new Response(JSON.stringify({ status: 'success', message: 'Email processed (simplified response)' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      return new Response(JSON.stringify({ status: 'error', message: `Internal error: ${err.message}` }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
    }
  });
}
