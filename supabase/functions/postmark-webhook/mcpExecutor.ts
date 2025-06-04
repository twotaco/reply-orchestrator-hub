// mcpExecutor.ts for postmark-webhook function
import type { KnowReplyAgentConfig } from './types.ts';
// Deno object is globally available in Deno runtime

const MCP_SERVER_BASE_URL = "https://mcp.knowreply.email";

export async function executeMCPPlan(
  mcpPlan: any[],
  availableMcps: KnowReplyAgentConfig['mcp_endpoints'],
  supabaseClient: any, // Keeping as 'any' as per current signature
  userId: string,
  emailInteractionId: string
): Promise<any[]> {
  console.log('🚀 Starting MCP Plan Execution (Fixed Base URL)...');
  const results: any[] = [];
  const executionOutputs: any[] = []; // Stores outputs of successfully executed actions

  if (!mcpPlan || mcpPlan.length === 0) {
    console.log('ℹ️ No MCP plan provided or plan is empty. Skipping execution.');
    return results;
  }

  const mcpServerInternalApiKey = Deno.env.get('MCP_SERVER_INTERNAL_API_KEY');
  const placeholderRegex = /^{{steps\[(\d+)]\.outputs\.([\w.-]+)}}$/;

  for (let i = 0; i < mcpPlan.length; i++) {
    const actionToExecute = mcpPlan[i];
    let currentActionFailed = false; // Flag to track if current action fails

    if (!mcpServerInternalApiKey || mcpServerInternalApiKey.trim() === '') {
      const errorMsg = 'MCP_SERVER_INTERNAL_API_KEY is not configured. Cannot make call to MCP server.';
      console.error(`❌ ${errorMsg}`);
      results.push({
        tool_name: actionToExecute.tool || 'unknown_tool',
        status: 'error',
        response: null,
        raw_response: '',
        error_message: errorMsg,
      });
      executionOutputs[i] = { error: errorMsg };
      if (!results.find(r => r.error_message === errorMsg && r.tool_name !== (actionToExecute.tool || 'unknown_tool'))) {
         await supabaseClient.from('activity_logs').insert({
            user_id: userId,
            email_interaction_id: emailInteractionId,
            action: 'mcp_execution_system_error',
            status: 'error',
            details: { error: errorMsg },
        });
      }
      continue;
    }

    if (!actionToExecute.tool || typeof actionToExecute.tool !== 'string') {
      const errorMsg = 'Invalid action: tool name missing or not a string.';
      console.warn('⚠️ Skipping invalid action in plan (missing or invalid tool name):', actionToExecute);
      results.push({
        tool_name: actionToExecute.tool || 'unknown_tool',
        status: 'error',
        response: null,
        raw_response: '',
        error_message: errorMsg,
      });
      executionOutputs[i] = { error: errorMsg };
      continue;
    }

    console.log(`🔎 [Step ${i}] Looking for MCP configuration for tool: ${actionToExecute.tool}`);
    const mcpConfig = availableMcps.find(mcp => mcp.name === actionToExecute.tool);

    if (!mcpConfig || !mcpConfig.provider_name || !mcpConfig.action_name) {
      const errorMsg = `MCP configuration incomplete or not found for tool: ${actionToExecute.tool}. Required fields from DB: provider_name, action_name.`;
      console.error(`❌ [Step ${i}] ${errorMsg}`);
      results.push({
        tool_name: actionToExecute.tool,
        status: 'error',
        response: null,
        raw_response: '',
        error_message: errorMsg,
      });
      executionOutputs[i] = { error: errorMsg };
      await supabaseClient.from('activity_logs').insert({
        user_id: userId,
        email_interaction_id: emailInteractionId,
        action: 'mcp_execution_error',
        status: 'error',
        details: { step: i, tool_name: actionToExecute.tool, error: errorMsg, request_args: actionToExecute.args },
      });
      continue;
    }

    let tempBaseUrl = MCP_SERVER_BASE_URL;
    if (tempBaseUrl.endsWith('/')) {
      tempBaseUrl = tempBaseUrl.slice(0, -1);
    }
    const targetUrl = `${tempBaseUrl}/mcp/${mcpConfig.provider_name}/${mcpConfig.action_name}`;

    console.log(`⚙️ [Step ${i}] Executing MCP: ${mcpConfig.name} via URL: ${targetUrl}`);

    const { data: connParamsResult, error: connParamsError } = await supabaseClient
      .from('mcp_connection_params')
      .select('connection_values')
      .eq('user_id', userId)
      .eq('provider_name', mcpConfig.provider_name)
      .single();

    if (connParamsError || !connParamsResult || !connParamsResult.connection_values || Object.keys(connParamsResult.connection_values).length === 0) {
      let errorDetail = `Connection parameters not found or empty for provider: ${mcpConfig.provider_name}.`;
      if (connParamsError && connParamsError.code !== 'PGRST116') {
        console.error(`❌ [Step ${i}] Error fetching connection params for ${mcpConfig.provider_name}:`, connParamsError);
        errorDetail = `Error fetching connection params for ${mcpConfig.provider_name}: ${connParamsError.message}`;
      } else {
        console.warn(`⚠️ [Step ${i}] ${errorDetail}`);
      }
      results.push({
        tool_name: actionToExecute.tool, status: 'error', response: null, raw_response: '', error_message: errorDetail,
      });
      executionOutputs[i] = { error: errorDetail };
      await supabaseClient.from('activity_logs').insert({
        user_id: userId, email_interaction_id: emailInteractionId, action: 'mcp_execution_error', status: 'error',
        details: { step: i, tool_name: actionToExecute.tool, error: errorDetail, request_args: actionToExecute.args },
      });
      continue;
    }

    const actualConnectionParams = connParamsResult.connection_values;
    console.log(`🔐 [Step ${i}] Using connection parameters for provider: ${mcpConfig.provider_name}`);

    const resolvedArgs: { [key: string]: any } = {};
    let placeholderError = null;

    for (const key in actionToExecute.args) {
      const value = actionToExecute.args[key];
      if (typeof value === 'string') {
        const match = value.match(placeholderRegex);
        if (match) {
          console.log(`[Step ${i}] Found placeholder for arg '${key}': ${value}`);
          const refStepIndex = parseInt(match[1], 10);
          const refFieldName = match[2];

          if (refStepIndex < 0 || refStepIndex >= i) {
            placeholderError = `Invalid placeholder: step index ${refStepIndex} is out of bounds for current step ${i}.`;
            console.error(`❌ [Step ${i}] ${placeholderError}`);
            break;
          }
          const referencedOutput = executionOutputs[refStepIndex];
          if (!referencedOutput || referencedOutput.error) {
            placeholderError = `Invalid placeholder: step ${refStepIndex} for '${value}' failed or produced no output.`;
            console.error(`❌ [Step ${i}] ${placeholderError} Output was:`, referencedOutput);
            break;
          }
          if (referencedOutput.hasOwnProperty(refFieldName)) {
            resolvedArgs[key] = referencedOutput[refFieldName];
            console.log(`[Step ${i}] Resolved placeholder '${value}' to:`, resolvedArgs[key]);
          } else {
            placeholderError = `Invalid placeholder: field '${refFieldName}' not found in output of step ${refStepIndex} for '${value}'. Available fields: ${Object.keys(referencedOutput || {}).join(', ')}`;
            console.error(`❌ [Step ${i}] ${placeholderError}`);
            break;
          }
        } else {
          resolvedArgs[key] = value;
        }
      } else {
        resolvedArgs[key] = value;
      }
    }

    if (placeholderError) {
      results.push({
        tool_name: actionToExecute.tool, status: 'error', response: null, raw_response: '', error_message: placeholderError,
      });
      executionOutputs[i] = { error: placeholderError };
      await supabaseClient.from('activity_logs').insert({
        user_id: userId, email_interaction_id: emailInteractionId, action: 'mcp_execution_error', status: 'error',
        details: { step: i, tool_name: actionToExecute.tool, error: placeholderError, request_args: actionToExecute.args },
      });
      continue;
    }

    const requestPayload = { args: resolvedArgs, auth: actualConnectionParams };
    let responseData: any = null;
    let rawResponseText = '';
    let status: 'success' | 'error' = 'error';
    let errorMessage: string | null = null;

    if (!currentActionFailed) {
        try {
          const headers: HeadersInit = { 'Content-Type': 'application/json', 'x-internal-api-key': mcpServerInternalApiKey!, }; // Added ! as it's checked above
          console.log(`📤 [Step ${i}] Making POST request to ${targetUrl} for tool ${actionToExecute.tool}`);
          const response = await fetch(targetUrl, { method: 'POST', headers: headers, body: JSON.stringify(requestPayload), });
          rawResponseText = await response.text();

          if (response.ok) {
            status = 'success';
            try {
              responseData = JSON.parse(rawResponseText);
              executionOutputs[i] = responseData;
              console.log(`✅ [Step ${i}] MCP call successful for ${actionToExecute.tool}. Response:`, responseData);
            } catch (e: any) {
              errorMessage = `MCP call for ${actionToExecute.tool} was successful (status ${response.status}) but response was not valid JSON. Raw: ${rawResponseText.substring(0,100)}...`;
              console.warn(`⚠️ [Step ${i}] ${errorMessage}`);
              responseData = null;
              executionOutputs[i] = { error: errorMessage, raw_response: rawResponseText };
            }
          } else {
            errorMessage = `MCP call failed for ${actionToExecute.tool} to ${targetUrl}: ${response.status} - ${response.statusText}. Raw: ${rawResponseText.substring(0, 200)}`;
            console.error(`❌ [Step ${i}] ${errorMessage}`);
            executionOutputs[i] = { error: errorMessage, raw_response: rawResponseText };
          }
        } catch (e: any) {
          errorMessage = `Network or fetch error for MCP ${actionToExecute.tool} to ${targetUrl}: ${e.message}`;
          console.error(`❌ [Step ${i}] ${errorMessage}`, e);
          rawResponseText = e.message;
          executionOutputs[i] = { error: errorMessage, raw_response: rawResponseText };
        }
    }

    results.push({
      tool_name: actionToExecute.tool, status: status, response: responseData, raw_response: rawResponseText, error_message: errorMessage,
    });

    await supabaseClient.from('activity_logs').insert({
      user_id: userId, email_interaction_id: emailInteractionId, action: 'mcp_execution_attempt', status: status,
      details: {
        step: i, tool_name: actionToExecute.tool, target_url: targetUrl, request_args: resolvedArgs,
        response_status_code: status === 'success' && !errorMessage ? 200 : (errorMessage ? 'N/A' : 500),
        error: errorMessage,
      },
    });
  }

  console.log('🏁 MCP Plan Execution Finished. Results:', results.length > 0 ? results : "No results");
  console.log('📦 Execution Outputs (for placeholder resolution):', executionOutputs);
  return results;
}
