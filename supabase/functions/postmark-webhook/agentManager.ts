// agentManager.ts for postmark-webhook function
import type { PostmarkWebhookPayload, KnowReplyAgentConfig } from './types.ts';
import { generateMCPToolPlan } from './llmPlanner.ts';
import { executeMCPPlan } from './mcpExecutor.ts';
// Deno object is globally available in Deno runtime
// SupabaseClient type is not strictly needed as supabase is 'any'

async function processWithAgent(
  workspaceConfig: any,
  agentConfig: KnowReplyAgentConfig,
  payload: PostmarkWebhookPayload,
  supabase: any,
  userId: string,
  emailInteractionId: string
) {
  console.log(`📨 Processing email with agent ${agentConfig.agent_id}`);

  const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
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
        details: { agent_id: agentConfig.agent_id, reason: 'GEMINI_API_KEY not set' }
      });
  } else {
    const emailBodyContent = payload.TextBody || payload.HtmlBody || payload.StrippedTextReply || "";
    if (agentConfig.mcp_endpoints && agentConfig.mcp_endpoints.length > 0) {
      console.log(`🗺️ Agent ${agentConfig.agent_id} has ${agentConfig.mcp_endpoints.length} MCPs. Attempting to generate plan with Gemini.`);
      mcpPlan = await generateMCPToolPlan(
        emailBodyContent,
        payload.FromFull.Email,
        payload.FromName,
        agentConfig.mcp_endpoints,
        geminiApiKey,
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

  let mcpResults: any[] | null = null;
  if (mcpPlan && mcpPlan.length > 0) {
    console.log(`▶️ Executing MCP Plan for agent ${agentConfig.agent_id}:`, mcpPlan);
    mcpResults = await executeMCPPlan(mcpPlan, agentConfig.mcp_endpoints, supabase, userId, emailInteractionId);
    console.log(`📝 MCP Results for agent ${agentConfig.agent_id}:`, mcpResults);

    const { error: updateError } = await supabase
      .from('email_interactions')
      .update({ mcp_results: mcpResults, updated_at: new Date().toISOString() }) // This was the original line for mcp_results
      .eq('id', emailInteractionId);
    if (updateError) {
      console.error('❌ Failed to store MCP results in email_interactions:', updateError);
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
    mcp_results: mcpResults || []
  };

  const knowReplyUrl = workspaceConfig.knowreply_webhook_url;

  console.log('🔗 KnowReply URL being called:', knowReplyUrl);
  console.log('📤 Sending request to KnowReply with mcp_results:', {
    agent_id: agentConfig.agent_id,
    mcp_results_count: knowReplyRequest.mcp_results?.length || 0,
  });
  console.log('🔑 Using API token:', workspaceConfig.knowreply_api_token ? `${workspaceConfig.knowreply_api_token.substring(0, 10)}...` : 'MISSING');

  const response = await fetch(knowReplyUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${workspaceConfig.knowreply_api_token}`
    },
    body: JSON.stringify(knowReplyRequest)
  });

  console.log('📨 KnowReply response status:', response.status);
  console.log('📨 KnowReply response headers:', Object.fromEntries(response.headers.entries()));

  const responseData = await response.json();
  console.log('📥 KnowReply response:', responseData);
  if (!response.ok) {
    console.error('❌ KnowReply API error response:', responseData);
    throw new Error(`KnowReply API error: ${response.status} - ${JSON.stringify(responseData)}`);
  }

  console.log('✅ KnowReply response received for agent:', agentConfig.agent_id);
  console.log('📊 Updating email_interactions with id:', emailInteractionId);

  const { data: updateResult, error: updateError } = await supabase
    .from('email_interactions')
    .update({
      knowreply_agent_used: agentConfig.agent_id,
      knowreply_request: knowReplyRequest,
      knowreply_response: responseData,
      mcp_results: responseData.mcp_results || null, // Overwrites with KnowReply's version of MCP results
      mcp_plan: mcpPlan,
      intent: responseData.intent || null,
      status: 'processed',
      updated_at: new Date().toISOString()
    })
    .eq('id', emailInteractionId)
    .select();

  if (updateError) {
    console.error('❌ Error updating email_interactions:', updateError);
    console.error('❌ Update error details:', {
      message: updateError.message, details: updateError.details,
      hint: updateError.hint, code: updateError.code
    });
    throw new Error(`Failed to update email interaction: ${updateError.message}`);
  }

  if (!updateResult || updateResult.length === 0) {
    console.error('❌ No rows were updated - email interaction not found:', emailInteractionId);
    throw new Error(`Email interaction with ID ${emailInteractionId} not found for update`);
  }

  console.log('✅ Successfully updated email_interactions record:', updateResult[0]);

  if (responseData.warnings && responseData.warnings.length > 0) {
    console.warn('⚠️ KnowReply warnings:', responseData.warnings);
  }
  if (responseData.errors && responseData.errors.length > 0) {
    console.error('❌ KnowReply errors:', responseData.errors);
  }

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
    });

  console.log(`🎉 Successfully processed email with agent ${agentConfig.agent_id}`);
}

export async function processEmailWithKnowReply(
  supabase: any,
  userId: string,
  payload: PostmarkWebhookPayload,
  emailInteractionId: string
): Promise<{ success: boolean; warnings: string[]; errors: string[] }> {
  console.log('🤖 Starting KnowReply processing for user:', userId)

  const warnings: string[] = []
  const errors: string[] = []

  try {
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

    interface AgentMapping { // This interface can be moved to types.ts if used elsewhere or kept local
      agent_id: string;
      mcp_endpoint_id: string | null;
    }

    const { data: agentMappingsData, error: mappingsError } = await supabase
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

    const agentMappings: AgentMapping[] = agentMappingsData || [];

    if (!agentMappings || agentMappings.length === 0) {
      const error = 'No active agent configurations found for user.'
      console.log('❌', error)
      errors.push(error)
      return { success: false, warnings, errors }
    }

    console.log(`🎯 Found ${agentMappings.length} agent mapping(s)`)
    const uniqueAgentIds = [...new Set(agentMappings.map(mapping => mapping.agent_id))]
    console.log('🤖 Unique agents found:', uniqueAgentIds)

    const mcpEndpointIds = agentMappings.map(mapping => mapping.mcp_endpoint_id).filter(Boolean);
    let mcpEndpoints: KnowReplyAgentConfig['mcp_endpoints'] = []
    if (mcpEndpointIds.length > 0) {
      const { data: endpoints, error: endpointsError } = await supabase
        .from('mcp_endpoints')
        .select('id, name, provider_name, action_name, instructions, expected_format, active, output_schema')
        .in('id', mcpEndpointIds)
        .eq('active', true)

      if (endpointsError) {
        errors.push(`Error fetching MCP endpoints: ${endpointsError.message}`)
      } else {
        mcpEndpoints = endpoints || []
      }
    }
    console.log(`🔗 Found ${mcpEndpoints.length} MCP endpoint(s)`)

    const agentConfigs: Record<string, KnowReplyAgentConfig> = {}
    uniqueAgentIds.forEach(agentId => {
      agentConfigs[agentId] = { agent_id: agentId, mcp_endpoints: [] }
    })
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
    for (const [agentId, agentConfig] of Object.entries(agentConfigs)) {
      console.log(`🚀 Processing with agent: ${agentId} (${agentConfig.mcp_endpoints.length} MCP endpoints)`)
      try {
        await processWithAgent(workspaceConfig, agentConfig, payload, supabase, userId, emailInteractionId)
        processedSuccessfully++
      } catch (error: any) {
        const errorMsg = `Error processing with agent ${agentId}: ${error.message}`
        console.error('❌', errorMsg)
        processingErrors.push(errorMsg)
        await supabase.from('activity_logs').insert({
            user_id: userId, email_interaction_id: emailInteractionId,
            action: 'knowreply_processing_error', status: 'error',
            details: { agent_id: agentId, error: error.message }
          })
      }
    }

    if (processingErrors.length > 0) errors.push(...processingErrors)
    if (processedSuccessfully > 0) {
      warnings.push(`Successfully processed email with ${processedSuccessfully} agent(s)`)
      return { success: true, warnings, errors }
    } else {
      warnings.push('No agents processed the email successfully')
      return { success: false, warnings, errors }
    }

  } catch (error: any) {
    const errorMsg = `KnowReply processing failed: ${error.message}`
    console.error('💥', errorMsg)
    errors.push(errorMsg)
    await supabase.from('activity_logs').insert({
        user_id: userId, email_interaction_id: emailInteractionId,
        action: 'knowreply_processing_failed', status: 'error',
        details: { error: error.message }
      })
    return { success: false, warnings, errors }
  }
}
