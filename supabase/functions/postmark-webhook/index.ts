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

interface KnowReplyAgentConfig {
  agent_id: string
  mcp_endpoints: Array<{
    id: string
    name: string
    post_url: string
    auth_token: string | null
    instructions?: string // Added for MCP Planner
    expected_format?: any // Added for MCP Planner (future use for args_schema)
  }>
}

// Function to generate MCP Tool Plan using OpenAI
async function generateMCPToolPlan(
  emailBody: string,
  availableMcps: KnowReplyAgentConfig['mcp_endpoints'],
  geminiApiKey: string, // Changed from openAIApiKey
  supabaseClient: any, // For logging
  userId: string | null,
  emailInteractionId: string | null
): Promise<object[] | null> {
  console.log('🤖 Generating MCP Tool Plan using Google Gemini...');
  const modelName = 'gemini-pro'; // Define model name for logging and use
  if (!emailBody || emailBody.trim() === '') {
    console.warn('✉️ Email body is empty. Skipping MCP plan generation.');
    return [];
  }

  if (!availableMcps || availableMcps.length === 0) {
    console.log('🛠️ No available MCPs for planning. Returning empty plan.');
    return [];
  }

  const simplifiedMcps = availableMcps.map(mcp => ({
    name: mcp.name,
    description: mcp.instructions || 'No specific instructions provided.',
    // Later, we can try to derive args_schema from mcp.expected_format
    // args_schema: mcp.expected_format ? { type: "object", properties: { example_param: { type: "string" } } } : {} 
  }));

  const systemPrompt = `You are an intent and action planner. Your goal is to identify which tools (MCPs) are needed to answer a customer's email and what arguments they need.
Only use tools from the 'Available Tools' list provided.
Return a JSON array of planned tool calls. Each object in the array must have a "tool" key (the MCP name) and an "args" key (an object of arguments for the MCP).
Ensure the "tool" name in your output matches exactly a name from the 'Available Tools' list.
If no tools are needed, or if the email does not require any actions, return an empty array [].
If the email is a simple thank you, an out-of-office reply, or spam, return an empty array [].`;

  const userPrompt = `Customer Email:
---
${emailBody.substring(0, 4000)}
---

Available Tools:
---
${JSON.stringify(simplifiedMcps, null, 2)}
---

Output Format guidance (ensure output is ONLY the JSON array, do not add any other text before or after the array):
[
  { "tool": "mcp:example.toolName", "args": { "parameter": "value" } }
]`;

  // Construct the prompt for Gemini
  const geminiPrompt = `You are an intent and action planner. Based on the customer email below, determine which external tools (MCPs) are needed to answer or fulfill the request.

Customer Email:
---
${emailBody.substring(0, 8000)} 
---

Available Tools:
---
${JSON.stringify(availableMcps.map(mcp => ({ name: mcp.name, description: mcp.instructions || 'No specific instructions provided.' })), null, 2)}
---

Output format constraints:
Respond ONLY with a valid JSON array in the following format:
[
  { "tool": "mcp:example.toolName", "args": { "parameter": "value" } }
]
If no tools are needed, or if the email content does not require any actionable steps, return an empty array [].
Only use tools from the 'Available Tools' list. Ensure the tool name in your output matches exactly a name from the 'Available Tools' list. Do not include any explanatory text, markdown formatting, or anything else before or after the JSON array itself.
Your entire response must be only the JSON array.`;

  console.log('📝 Constructed Prompt for Gemini (first 200 chars):', geminiPrompt.substring(0,200));
  
  // Gemini API expects contents.parts.text format
  const requestPayloadForGemini = {
    contents: [{
      parts: [{
        text: geminiPrompt
      }]
    }],
    generationConfig: {
      response_mime_type: "application/json", // Request JSON output directly
      temperature: 0.2, // Lower temperature for more deterministic JSON
      // maxOutputTokens: 2048, // Optional: adjust as needed
    }
  };

  let llmApiResponse: any = null;
  let parsedPlan: object[] | null = null;
  let llmError: Error | null = null;

  try {
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiApiKey}`;
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestPayloadForGemini),
    });

    llmApiResponse = await response.json(); // Store the full API response

    if (!response.ok) {
      const errorDetail = llmApiResponse?.error?.message || JSON.stringify(llmApiResponse);
      console.error(`❌ Gemini API error: ${response.status} - ${response.statusText}`, errorDetail);
      llmError = new Error(`Gemini API error: ${response.status} - ${errorDetail}`);
    } else {
      console.log('✅ Gemini API call successful.');
      const candidate = llmApiResponse?.candidates?.[0];
      if (!candidate) {
        llmError = new Error('No candidates found in Gemini response.');
        console.warn(`⚠️ ${llmError.message}`, llmApiResponse);
      } else if (candidate.finishReason !== 'STOP' && candidate.finishReason !== 'MAX_TOKENS') { 
        // MAX_TOKENS can sometimes be acceptable if JSON is complete
        llmError = new Error(`Gemini generation finished with reason: ${candidate.finishReason}`);
        console.warn(`⚠️ ${llmError.message}`, llmApiResponse);
         if (candidate.finishReason === "SAFETY") {
          console.error("❌ Gemini response blocked due to safety settings. Response details:", candidate.safetyRatings);
          llmError = new Error(`Gemini response blocked due to safety settings: ${JSON.stringify(candidate.safetyRatings)}`);
        }
      } else {
        const messageContent = candidate.content?.parts?.[0]?.text;
        if (!messageContent) {
          llmError = new Error('No text content in Gemini response candidate part.');
          console.warn(`⚠️ ${llmError.message}`, llmApiResponse);
        } else {
          console.log('🛠️ Attempting to parse LLM response from Gemini:', messageContent);
          try {
            // Gemini with response_mime_type: "application/json" should return valid JSON directly.
            // However, the actual *content* of that JSON (the plan) needs to be an array as per prompt.
            const jsonFromTheLLM = JSON.parse(messageContent); 

            // Check if the parsed JSON is itself the array (our desired plan format)
            if (Array.isArray(jsonFromTheLLM)) {
                parsedPlan = jsonFromTheLLM;
            } 
            // Or if the LLM wrapped it, e.g. { "plan": [...] } (less likely with strong prompting for direct array)
            else if (jsonFromTheLLM && Array.isArray(jsonFromTheLLM.plan)) {
                console.warn("⚠️ Gemini returned JSON object with a 'plan' key instead of direct array. Adapting.");
                parsedPlan = jsonFromTheLLM.plan;
            }
            else {
              llmError = new Error('LLM response JSON is not an array or a {plan: []} object.');
              console.warn(`⚠️ ${llmError.message}`, jsonFromTheLLM);
              parsedPlan = []; // Default to empty if structure is unexpected but valid JSON
            }
          } catch (e) {
            console.error('❌ Error parsing JSON from Gemini response:', e.message);
            console.error('Raw response content that failed parsing:', messageContent);
            llmError = e;
          }
        }
      }
    }
    
    if (!llmError && !Array.isArray(parsedPlan)) {
      console.warn('⚠️ Parsed plan is not an array:', parsedPlan);
      llmError = new Error('Parsed plan is not an array.');
      parsedPlan = null; // Ensure it's null if not a valid array
    }
    
    // Further validation: check if tool names in the plan are valid
    const validToolNames = new Set(simplifiedMcps.map(mcp => mcp.name));
    // Validation of the parsed plan (if no error occurred before this)
    if (!llmError && parsedPlan) {
      const validToolNames = new Set(simplifiedMcps.map(mcp => mcp.name));
      parsedPlan = parsedPlan.filter(step => {
        if (step && typeof step.tool === 'string' && validToolNames.has(step.tool)) {
          return true;
        }
        console.warn(`⚠️ Invalid or unknown tool in plan from Gemini: '${step?.tool || "N/A"}'. It will be filtered out.`);
        return false;
      });
      console.log('✅ MCP Tool Plan from Gemini generated and validated:', parsedPlan);
    } else if (!llmError && !parsedPlan) {
        // If parsedPlan is null but there was no explicit llmError, it means something unexpected happened.
        // For example, the JSON was valid but empty or not the array we wanted.
        // If response_mime_type: "application/json" was used, Gemini should error if it can't produce JSON.
        // This case might occur if the prompt was not followed for the *content* of the JSON.
        console.warn("⚠️ Parsed plan is null or empty after Gemini call, despite no direct API or parsing error. This might indicate the LLM did not follow content instructions.");
        // We might still want to set an llmError here or ensure parsedPlan is treated as empty.
        if (!parsedPlan) parsedPlan = []; // Ensure it's an empty array if null but no error.
    }


  } catch (error) { // Catch fetch errors or other unexpected errors during the fetch/initial .json() call
    console.error('❌ Exception during Gemini API call or initial response processing:', error.message);
    llmError = error; // Store the error
    if (!llmApiResponse) llmApiResponse = { error: { message: error.message } }; // Ensure llmApiResponse has error info
    parsedPlan = null; // Ensure plan is null on exception
  }

  // Log LLM interaction to Supabase
  const logData = {
    user_id: userId,
    email_interaction_id: emailInteractionId,
    prompt_messages: requestPayloadForGemini.contents, // Log the Gemini specific prompt structure
    llm_response: llmApiResponse, 
    tool_plan_generated: parsedPlan,
    model_used: modelName,
    error_message: llmError ? llmError.message : null,
  };

  try {
    const { error: logError } = await supabaseClient.from('llm_logs').insert([logData]);
    if (logError) {
      console.error('Failed to log LLM (Gemini) interaction to llm_logs:', logError.message);
    } else {
      console.log('📝 LLM interaction logged successfully to llm_logs.');
    }
  } catch (e) {
    // Prevent logging errors from disrupting the main flow
    console.error('Exception during LLM log insertion to Supabase:', e.message);
  }

  if (llmError) {
    // If there was an error at any point (API call, parsing, validation), return null
    return null; 
  }
  return parsedPlan; // Return the validated plan (could be empty array)
  }
}

// Function to execute the MCP plan
async function executeMCPPlan(
  mcpPlan: any[],
  availableMcps: KnowReplyAgentConfig['mcp_endpoints'],
  supabaseClient: any,
  userId: string,
  emailInteractionId: string
): Promise<any[]> {
  console.log('🚀 Starting MCP Plan Execution...');
  const results: any[] = [];

  if (!mcpPlan || mcpPlan.length === 0) {
    console.log('ℹ️ No MCP plan provided or plan is empty. Skipping execution.');
    return results;
  }

  for (const action of mcpPlan) {
    if (!action.tool || typeof action.tool !== 'string') {
      console.warn('⚠️ Skipping invalid action in plan (missing or invalid tool name):', action);
      results.push({
        tool_name: action.tool || 'unknown_tool',
        status: 'error',
        response: null,
        raw_response: '',
        error_message: 'Invalid action: tool name missing or not a string.',
      });
      continue;
    }

    console.log(`🔎 Looking for MCP configuration for tool: ${action.tool}`);
    const mcpConfig = availableMcps.find(mcp => mcp.name === action.tool);

    if (!mcpConfig) {
      const errorMsg = `MCP configuration not found for tool: ${action.tool}`;
      console.error(`❌ ${errorMsg}`);
      results.push({
        tool_name: action.tool,
        status: 'error',
        response: null,
        raw_response: '',
        error_message: errorMsg,
      });
      // Log to activity_logs
      await supabaseClient.from('activity_logs').insert({
        user_id: userId,
        email_interaction_id: emailInteractionId,
        action: 'mcp_execution_error',
        status: 'error',
        details: { tool_name: action.tool, error: errorMsg, request_args: action.args },
      });
      continue;
    }

    console.log(`⚙️ Executing MCP: ${mcpConfig.name} with URL: ${mcpConfig.post_url}`);
    let requestBody = action.args || {};

    // Placeholder detection for argument values
    for (const key in requestBody) {
      if (typeof requestBody[key] === 'string' && requestBody[key].startsWith('{{') && requestBody[key].endsWith('}}')) {
        console.warn(`⚠️ Placeholder argument detected for ${action.tool} - ${key}: ${requestBody[key]}. Using as literal string for now.`);
      }
    }
    
    let responseData: any = null;
    let rawResponseText = '';
    let status: 'success' | 'error' = 'error';
    let errorMessage: string | null = null;

    try {
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (mcpConfig.auth_token) {
        headers['Authorization'] = `Bearer ${mcpConfig.auth_token}`;
      }

      console.log(`📤 Making POST request to ${mcpConfig.post_url} for tool ${action.tool}`);
      const response = await fetch(mcpConfig.post_url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody),
      });

      rawResponseText = await response.text();

      if (response.ok) {
        status = 'success';
        try {
          responseData = JSON.parse(rawResponseText);
          console.log(`✅ MCP call successful for ${action.tool}. Response:`, responseData);
        } catch (e) {
          // Response was ok, but not valid JSON
          console.warn(`⚠️ MCP call for ${action.tool} was successful (status ${response.status}) but response was not valid JSON. Raw response: ${rawResponseText.substring(0,100)}...`);
          responseData = null; // Keep rawResponseText
          // Optionally, could set status to 'error' or add a specific warning field if strict JSON is required.
          // For now, a 2xx response is "success" at HTTP level.
        }
      } else {
        errorMessage = `MCP call failed for ${action.tool}: ${response.status} - ${response.statusText}. Raw: ${rawResponseText.substring(0, 200)}`;
        console.error(`❌ ${errorMessage}`);
      }
    } catch (e) {
      errorMessage = `Network or fetch error for MCP ${action.tool}: ${e.message}`;
      console.error(`❌ ${errorMessage}`, e);
      rawResponseText = e.message; // Store error message as raw response if fetch itself failed
    }

    results.push({
      tool_name: action.tool,
      status: status,
      response: responseData,
      raw_response: rawResponseText,
      error_message: errorMessage,
    });

    // Log to activity_logs
    await supabaseClient.from('activity_logs').insert({
      user_id: userId,
      email_interaction_id: emailInteractionId,
      action: 'mcp_execution_attempt',
      status: status,
      details: {
        tool_name: action.tool,
        request_args: action.args,
        response_status_code: status === 'success' && !errorMessage ? 200 : (errorMessage ? 'N/A' : 500) , // Approximate
        error: errorMessage,
        // raw_mcp_response: rawResponseText.substring(0, 500) // Optional: log part of raw response
      },
    });
  }

  console.log('🏁 MCP Plan Execution Finished. Results:', results.length > 0 ? results : "No results");
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
    // Get user's KnowReply configuration - now including the API token
    const { data: workspaceConfig, error: configError } = await supabase
      .from('workspace_configs')
      .select('knowreply_webhook_url, knowreply_api_token')
      .eq('user_id', userId)
      .single()

    if (configError || !workspaceConfig?.knowreply_webhook_url || !workspaceConfig?.knowreply_api_token) {
      const error = 'No KnowReply webhook URL or API token found for user. Please configure KnowReply settings first.'
      console.log('❌', error)
      errors.push(error)
      return { success: false, warnings, errors }
    }

    console.log('✅ Found KnowReply config:', workspaceConfig.knowreply_webhook_url)
    console.log('✅ Found KnowReply API token:', workspaceConfig.knowreply_api_token ? 'Yes' : 'No')

    // Get active agent mappings for the user
    const { data: agentMappings, error: mappingsError } = await supabase
      .from('knowreply_agent_mcp_mappings')
      .select('agent_id, mcp_endpoint_id')
      .eq('user_id', userId)
      .eq('active', true)

    if (mappingsError) {
      const error = `Error fetching agent mappings: ${mappingsError.message}`
      console.error('❌', error)
      errors.push(error)
      return { success: false, warnings, errors }
    }

    if (!agentMappings || agentMappings.length === 0) {
      const error = 'No active agent configurations found for user. Please configure at least one agent in the KnowReply Setup page before processing emails.'
      console.log('❌', error)
      errors.push(error)
      return { success: false, warnings, errors }
    }

    console.log(`🎯 Found ${agentMappings.length} agent mapping(s)`)

    // Get unique agent IDs
    const uniqueAgentIds = [...new Set(agentMappings.map(mapping => mapping.agent_id))]
    console.log('🤖 Unique agents found:', uniqueAgentIds)

    // Get MCP endpoints for these mappings (if any)
    const mcpEndpointIds = agentMappings
      .map(mapping => mapping.mcp_endpoint_id)
      .filter(Boolean) // Remove null/undefined values

    let mcpEndpoints = []
    if (mcpEndpointIds.length > 0) {
      const { data: endpoints, error: endpointsError } = await supabase
        .from('mcp_endpoints')
        .select('id, name, post_url, auth_token, instructions, expected_format') // Added instructions and expected_format
        .in('id', mcpEndpointIds)
        .eq('active', true)

      if (endpointsError) {
        const error = `Error fetching MCP endpoints: ${endpointsError.message}`
        console.error('❌', error)
        errors.push(error)
      } else {
        mcpEndpoints = endpoints || []
      }
    }

    console.log(`🔗 Found ${mcpEndpoints.length} MCP endpoint(s)`)

    // Group MCP endpoints by agent_id
    const agentConfigs: Record<string, KnowReplyAgentConfig> = {}
    
    // Initialize all agents (even those without MCP endpoints)
    uniqueAgentIds.forEach(agentId => {
      agentConfigs[agentId] = {
        agent_id: agentId,
        mcp_endpoints: []
      }
    })

    // Add MCP endpoints to the appropriate agents
    agentMappings.forEach(mapping => {
      if (mapping.mcp_endpoint_id) {
        const endpoint = mcpEndpoints.find(ep => ep.id === mapping.mcp_endpoint_id)
        if (endpoint && agentConfigs[mapping.agent_id]) {
          agentConfigs[mapping.agent_id].mcp_endpoints.push(endpoint)
        }
      }
    })

    console.log('🎯 Final agent configurations:', Object.keys(agentConfigs))

    let processedSuccessfully = 0
    let processingErrors: string[] = []

    // Process with each configured agent
    for (const [agentId, agentConfig] of Object.entries(agentConfigs)) {
      console.log(`🚀 Processing with agent: ${agentId} (${agentConfig.mcp_endpoints.length} MCP endpoints)`)
      
      try {
        await processWithAgent(
          workspaceConfig,
          agentConfig,
          payload,
          supabase,
          userId,
          emailInteractionId
        )
        processedSuccessfully++
      } catch (error) {
        const errorMsg = `Error processing with agent ${agentId}: ${error.message}`
        console.error('❌', errorMsg)
        processingErrors.push(errorMsg)
        
        // Log the error but continue with other agents
        await supabase
          .from('activity_logs')
          .insert({
            user_id: userId,
            email_interaction_id: emailInteractionId,
            action: 'knowreply_processing_error',
            status: 'error',
            details: {
              agent_id: agentId,
              error: error.message
            }
          })
      }
    }

    if (processingErrors.length > 0) {
      errors.push(...processingErrors)
    }

    if (processedSuccessfully > 0) {
      warnings.push(`Successfully processed email with ${processedSuccessfully} agent(s)`)
      return { success: true, warnings, errors }
    } else {
      warnings.push('No agents processed the email successfully')
      return { success: false, warnings, errors }
    }

  } catch (error) {
    const errorMsg = `KnowReply processing failed: ${error.message}`
    console.error('💥', errorMsg)
    errors.push(errorMsg)
    
    // Log the general processing error
    await supabase
      .from('activity_logs')
      .insert({
        user_id: userId,
        email_interaction_id: emailInteractionId,
        action: 'knowreply_processing_failed',
        status: 'error',
        details: { error: error.message }
      })

    return { success: false, warnings, errors }
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
  console.log(`📨 Processing email with agent ${agentConfig.agent_id}`);

  const geminiApiKey = Deno.env.get('GEMINI_API_KEY'); // Changed to GEMINI_API_KEY
  let mcpPlan: object[] | null = null;

  if (!geminiApiKey) {
    console.error('❌ GEMINI_API_KEY is not set. Skipping MCP planning.');
    await supabase
      .from('activity_logs')
      .insert({
        user_id: userId,
        email_interaction_id: emailInteractionId,
        action: 'mcp_planning_skipped',
        status: 'warning',
        details: { agent_id: agentConfig.agent_id, reason: 'GEMINI_API_KEY not set' } // Updated reason
      });
  } else {
    const emailBodyContent = payload.TextBody || payload.HtmlBody || payload.StrippedTextReply || "";
    if (agentConfig.mcp_endpoints && agentConfig.mcp_endpoints.length > 0) {
      console.log(`🗺️ Agent ${agentConfig.agent_id} has ${agentConfig.mcp_endpoints.length} MCPs. Attempting to generate plan with Gemini.`);
      mcpPlan = await generateMCPToolPlan(
        emailBodyContent, 
        agentConfig.mcp_endpoints, 
        geminiApiKey, // Pass Gemini API key
        supabase, 
        userId,
        emailInteractionId
      );
      
      if (mcpPlan) {
        console.log(`✅ MCP Plan generated for agent ${agentConfig.agent_id}:`, JSON.stringify(mcpPlan, null, 2));
      } else {
        console.warn(`⚠️ MCP Plan generation returned null or empty for agent ${agentConfig.agent_id}.`);
      }
    } else {
      console.log(`🤔 Agent ${agentConfig.agent_id} has no MCP endpoints. Skipping MCP planning.`);
    }
  }

  // Execute the MCP Plan if one was generated
  let mcpResults: any[] | null = null;
  if (mcpPlan && mcpPlan.length > 0) {
    console.log(`▶️ Executing MCP Plan for agent ${agentConfig.agent_id}:`, mcpPlan);
    mcpResults = await executeMCPPlan(mcpPlan, agentConfig.mcp_endpoints, supabase, userId, emailInteractionId);
    console.log(`📝 MCP Results for agent ${agentConfig.agent_id}:`, mcpResults);

    // Store mcpResults in the email_interactions table
    // Ensure mcp_results field exists in your email_interactions table
    const { error: updateError } = await supabase
      .from('email_interactions')
      .update({ mcp_results: mcpResults, updated_at: new Date().toISOString() })
      .eq('id', emailInteractionId);
    if (updateError) {
      console.error('❌ Failed to store MCP results in email_interactions:', updateError);
      // Log this error to activity_logs as well
       await supabase.from('activity_logs').insert({
        user_id: userId,
        email_interaction_id: emailInteractionId,
        action: 'mcp_result_storage_error',
        status: 'error',
        details: { agent_id: agentConfig.agent_id, error: updateError.message },
      });
    } else {
      console.log('✅ Successfully stored MCP results in email_interactions.');
    }
  } else {
    console.log(`🚫 No MCP plan to execute for agent ${agentConfig.agent_id}.`);
  }

  // Prepare the KnowReply request matching your webhook's expected format
  const knowReplyRequest = {
    agent_id: agentConfig.agent_id,
    email: {
      provider: 'postmark',
      sender: payload.From,
      recipient: payload.ToFull?.[0]?.Email || payload.To,
      subject: payload.Subject,
      body: payload.TextBody || payload.HtmlBody || payload.StrippedTextReply,
      headers: payload.Headers ? payload.Headers.reduce((acc, h) => {
        acc[h.Name] = h.Value;
        return acc;
      }, {} as Record<string, string>) : {},
      authentication: {
        spf_pass: payload.Headers?.find(h => h.Name === 'Received-SPF')?.Value?.includes('Pass') || false,
        spam_score: payload.Headers?.find(h => h.Name === 'X-Spam-Score')?.Value ? 
          parseFloat(payload.Headers.find(h => h.Name === 'X-Spam-Score')!.Value) : undefined
      },
      raw: payload
    },
    mcp_results: mcpResults || [] // Use the actual results from executeMCPPlan. Default to empty array.
  }

  // Use the webhook URL directly since it's the full edge function URL
  const knowReplyUrl = workspaceConfig.knowreply_webhook_url
  
  console.log('🔗 KnowReply URL being called:', knowReplyUrl);
  console.log('📤 Sending request to KnowReply with mcp_results:', {
    agent_id: agentConfig.agent_id,
    mcp_results_count: knowReplyRequest.mcp_results?.length || 0,
    // Optionally log the full request for debugging, but be mindful of sensitive data in payload.raw
    // Example: console.log('Full KnowReply request for debugging:', JSON.stringify(knowReplyRequest, null, 2));
  });
  
  console.log('🔑 Using API token:', workspaceConfig.knowreply_api_token ? `${workspaceConfig.knowreply_api_token.substring(0, 10)}...` : 'MISSING')

  // Make the KnowReply API call WITH Authorization header
  const response = await fetch(knowReplyUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${workspaceConfig.knowreply_api_token}`
    },
    body: JSON.stringify(knowReplyRequest)
  })

  console.log('📨 KnowReply response status:', response.status)
  console.log('📨 KnowReply response headers:', Object.fromEntries(response.headers.entries()))

  const responseData = await response.json()
  console.log('📥 KnowReply response:', responseData);
  if (!response.ok) {
    console.error('❌ KnowReply API error response:', responseData)
    throw new Error(`KnowReply API error: ${response.status} - ${JSON.stringify(responseData)}`)
  }

  console.log('✅ KnowReply response received for agent:', agentConfig.agent_id)
  console.log('📊 Updating email_interactions with id:', emailInteractionId);
  
  // Update the email interaction with KnowReply results - with proper error handling
  const { data: updateResult, error: updateError } = await supabase
    .from('email_interactions')
    .update({
      knowreply_agent_used: agentConfig.agent_id,
      knowreply_request: knowReplyRequest, // Includes mcp_plan
      knowreply_response: responseData, 
      // knowreply_mcp_results from responseData is if KnowReply itself ran some and returned them.
      // The mcpResults we just got are from our own execution prior to calling KnowReply.
      // These might be duplicative or distinct depending on how KnowReply is configured.
      // For now, we are storing our locally executed mcpResults in email_interactions.mcp_results.
      // And also in email_interactions.knowreply_request.mcp_plan (the plan itself).
      // The field email_interactions.knowreply_mcp_results is for results returned BY KnowReply service.
      knowreply_mcp_results: responseData.mcp_results || null, 
      mcp_plan: mcpPlan, // Storing the generated plan
      // mcp_results: mcpResults, // We are NOT adding our execution results to the knowreply_response update here.
                                // This is because `responseData` is the response from KnowReply service.
                                // Our `mcpResults` are stored separately above.
      intent: responseData.intent || null,
      status: 'processed',
      updated_at: new Date().toISOString()
    })
    .eq('id', emailInteractionId)
    .select()

  if (updateError) {
    console.error('❌ Error updating email_interactions:', updateError)
    console.error('❌ Update error details:', {
      message: updateError.message,
      details: updateError.details,
      hint: updateError.hint,
      code: updateError.code
    })
    throw new Error(`Failed to update email interaction: ${updateError.message}`)
  }

  if (!updateResult || updateResult.length === 0) {
    console.error('❌ No rows were updated - email interaction not found:', emailInteractionId)
    throw new Error(`Email interaction with ID ${emailInteractionId} not found for update`)
  }

  console.log('✅ Successfully updated email_interactions record:', updateResult[0])

  // check for any warnings or errors in the response and output to console
  if (responseData.warnings && responseData.warnings.length > 0) {
    console.warn('⚠️ KnowReply warnings:', responseData.warnings)
  }
  if (responseData.errors && responseData.errors.length > 0) {
    console.error('❌ KnowReply errors:', responseData.errors)
  }
  
  // Log successful processing
  await supabase
    .from('activity_logs')
    .insert({
      user_id: userId,
      email_interaction_id: emailInteractionId,
      action: 'knowreply_processing_success',
      status: 'success',
      details: {
        agent_id: agentConfig.agent_id,
        intent: responseData.intent,
        mcp_endpoints_used: agentConfig.mcp_endpoints.length
      }
    })

  console.log(`🎉 Successfully processed email with agent ${agentConfig.agent_id}`)
}

serve(async (req) => {
  console.log('🚀 Postmark webhook function called!')
  console.log('📝 Request method:', req.method)
  console.log('🌐 Request URL:', req.url)
  console.log('📋 Request headers:', Object.fromEntries(req.headers.entries()))

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('✅ Handling CORS preflight request')
    return new Response(null, { headers: corsHeaders })
  }

  const responseData = {
    status: 'success',
    message: 'Email processed successfully',
    warnings: [] as string[],
    errors: [] as string[],
    processed_at: new Date().toISOString()
  }

  try {
    console.log('🔧 Creating Supabase client...')
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    if (req.method !== 'POST') {
      console.log('❌ Method not allowed:', req.method)
      responseData.status = 'error'
      responseData.message = 'Method not allowed'
      responseData.errors.push('Only POST method is allowed')
      return new Response(JSON.stringify(responseData), { 
        status: 405, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log('📨 Parsing request body...')
    const payload: PostmarkWebhookPayload = await req.json()
    console.log('📧 Received Postmark webhook payload:')
    console.log('   From:', payload.From)
    console.log('   To:', payload.To)
    console.log('   Subject:', payload.Subject)
    console.log('   MessageID:', payload.MessageID)

    // Extract spam information from headers
    const spamHeaders = payload.Headers || []
    const spamScore = spamHeaders.find(h => h.Name === 'X-Spam-Score')?.Value
    const spamStatus = spamHeaders.find(h => h.Name === 'X-Spam-Status')?.Value

    // Find the user based on the inbound email address
    const toEmail = payload.ToFull?.[0]?.Email || payload.To
    
    // Extract the base inbound hash (everything before the '@' and before any '+')
    const emailPart = toEmail.split('@')[0] // Get part before @
    const inboundHash = emailPart.split('+')[0] // Get part before + (base hash)

    console.log('🔍 Looking for user with inbound hash:', inboundHash)
    console.log('   Original email:', toEmail)
    console.log('   Email part:', emailPart)

    const { data: workspaceConfig, error: configError } = await supabase
      .from('workspace_configs')
      .select('user_id')
      .eq('postmark_inbound_hash', inboundHash)
      .single()

    if (configError || !workspaceConfig) {
      console.error('❌ Could not find workspace config for inbound hash:', inboundHash, configError)
      responseData.status = 'error'
      responseData.message = 'Inbound hash not found'
      responseData.errors.push(`No workspace configuration found for inbound hash: ${inboundHash}`)
      return new Response(JSON.stringify(responseData), { 
        status: 404, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log('✅ Found workspace config for user:', workspaceConfig.user_id)
    responseData.message = `Email processed for user: ${workspaceConfig.user_id}`

    // Check if this message_id already exists and handle upsert
    const { data: existingEmail, error: checkError } = await supabase
      .from('postmark_inbound_emails')
      .select('id, message_id')
      .eq('message_id', payload.MessageID)
      .eq('user_id', workspaceConfig.user_id)
      .single()

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('❌ Error checking for existing email:', checkError)
      responseData.errors.push(`Database error checking existing email: ${checkError.message}`)
    }

    let emailRecord
    if (existingEmail) {
      console.log('📝 Updating existing email record for message_id:', payload.MessageID)
      responseData.warnings.push(`Updated existing email record for message_id: ${payload.MessageID}`)
      
      // Update existing record
      const { data: updatedRecord, error: updateError } = await supabase
        .from('postmark_inbound_emails')
        .update({
          from_email: payload.From,
          from_name: payload.FromName,
          to_email: toEmail,
          cc_email: payload.Cc || null,
          bcc_email: payload.Bcc || null,
          subject: payload.Subject,
          text_body: payload.TextBody,
          html_body: payload.HtmlBody,
          stripped_text_reply: payload.StrippedTextReply,
          mailbox_hash: payload.MailboxHash,
          spam_score: spamScore ? parseFloat(spamScore) : null,
          spam_status: spamStatus,
          attachments: payload.Attachments,
          headers: payload.Headers,
          raw_webhook_data: payload,
          processed: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingEmail.id)
        .select()
        .single()

      if (updateError) {
        console.error('❌ Error updating inbound email:', updateError)
        responseData.errors.push(`Database error updating inbound email: ${updateError.message}`)
      }
      emailRecord = updatedRecord
      console.log('✅ Successfully updated existing inbound email')
    } else {
      console.log('💾 Creating new inbound email record...')
      responseData.warnings.push(`Created new email record for message_id: ${payload.MessageID}`)
      
      // Insert new record
      const { data: newRecord, error: insertError } = await supabase
        .from('postmark_inbound_emails')
        .insert({
          user_id: workspaceConfig.user_id,
          message_id: payload.MessageID,
          from_email: payload.From,
          from_name: payload.FromName,
          to_email: toEmail,
          cc_email: payload.Cc || null,
          bcc_email: payload.Bcc || null,
          subject: payload.Subject,
          text_body: payload.TextBody,
          html_body: payload.HtmlBody,
          stripped_text_reply: payload.StrippedTextReply,
          mailbox_hash: payload.MailboxHash,
          spam_score: spamScore ? parseFloat(spamScore) : null,
          spam_status: spamStatus,
          attachments: payload.Attachments,
          headers: payload.Headers,
          raw_webhook_data: payload,
          processed: false
        })
        .select()
        .single()

      if (insertError) {
        console.error('❌ Error inserting inbound email:', insertError)
        responseData.errors.push(`Database error inserting inbound email: ${insertError.message}`)
      }
      emailRecord = newRecord
      console.log('✅ Successfully stored new inbound email')
    }

    // Handle email interactions similarly - upsert based on message_id
    const { data: existingInteraction, error: interactionCheckError } = await supabase
      .from('email_interactions')
      .select('id')
      .eq('message_id', payload.MessageID)
      .eq('user_id', workspaceConfig.user_id)
      .single()

    let interactionRecordId
    if (existingInteraction) {
      console.log('📝 Updating existing email interaction for message_id:', payload.MessageID)
      
      // Update existing interaction
      const { data: updatedInteraction, error: updateInteractionError } = await supabase
        .from('email_interactions')
        .update({
          from_email: payload.From,
          to_email: toEmail,
          subject: payload.Subject,
          original_content: payload.TextBody || payload.HtmlBody,
          status: 'received',
          postmark_request: payload,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingInteraction.id)
        .select()
        .single()

      if (updateInteractionError) {
        console.error('⚠️ Error updating email interaction:', updateInteractionError)
      } else {
        interactionRecordId = existingInteraction.id
        console.log('✅ Successfully updated email interaction')
      }
    } else {
      console.log('📝 Creating new email interaction record...')
      
      // Insert new interaction
      const { data: newInteraction, error: interactionError } = await supabase
        .from('email_interactions')
        .insert({
          user_id: workspaceConfig.user_id,
          message_id: payload.MessageID,
          from_email: payload.From,
          to_email: toEmail,
          subject: payload.Subject,
          original_content: payload.TextBody || payload.HtmlBody,
          status: 'received',
          postmark_request: payload
        })
        .select()
        .single()

      if (interactionError) {
        console.error('⚠️ Error creating email interaction:', interactionError)
      } else {
        interactionRecordId = newInteraction.id
        console.log('✅ Successfully created email interaction with ID:', newInteraction.id)
      }
    }

    // Process the email with KnowReply and collect results
    if (interactionRecordId) {
      console.log('🤖 Starting KnowReply processing...')
      const knowReplyResult = await processEmailWithKnowReply(
        supabase,
        workspaceConfig.user_id,
        payload,
        interactionRecordId
      )

      // Add KnowReply results to response
      responseData.warnings.push(...knowReplyResult.warnings)
      responseData.errors.push(...knowReplyResult.errors)

      if (!knowReplyResult.success) {
        // If KnowReply processing failed, mark the overall response as error
        responseData.status = 'error'
        responseData.message = 'Email received but processing failed'
        
        if (knowReplyResult.errors.length === 0) {
          // This shouldn't happen now, but just in case
          responseData.errors.push('KnowReply processing failed for unknown reasons')
        }
      } else {
        responseData.warnings.push('KnowReply processing completed successfully')
      }
    }

    console.log('🎉 Successfully processed Postmark webhook for user:', workspaceConfig.user_id)

    // Return appropriate status code based on processing results
    const statusCode = responseData.status === 'error' ? 422 : 200

    return new Response(JSON.stringify(responseData), { 
      status: statusCode, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('💥 Error processing Postmark webhook:', error)
    console.error('💥 Error stack:', error.stack)
    
    responseData.status = 'error'
    responseData.message = 'Internal server error'
    responseData.errors.push(`Processing error: ${error.message}`)
    
    return new Response(JSON.stringify(responseData), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
