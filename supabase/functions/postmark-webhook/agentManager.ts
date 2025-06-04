// agentManager.ts for postmark-webhook function
import type { PostmarkWebhookPayload, KnowReplyAgentConfig } from './types.ts';
import { generateMCPToolPlan } from './llmPlanner.ts';
import { executeMCPPlan } from './mcpExecutor.ts';
import { isSenderVerified } from './handlerUtils.ts'; // Added import
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
  let mcpActionDigest = ""; // Initialize mcpActionDigest

  // Perform sender verification
  const senderIsVerified = isSenderVerified(payload.Headers, payload.FromFull.Email);

  let mcpPlan: object[] | null = null;
  let mcpResults: any[] | null = null;

  if (!senderIsVerified) {
    console.warn(`⚠️ Sender ${payload.FromFull.Email} NOT VERIFIED. Skipping MCP planning and execution.`);
    mcpActionDigest = "MCP actions skipped: Sender email could not be verified based on SPF/DKIM policies. No automated actions were taken.";

    await supabase.from('activity_logs').insert({
      user_id: userId,
      email_interaction_id: emailInteractionId,
      action: 'sender_verification_failed',
      status: 'warning',
      details: {
        agent_id: agentConfig.agent_id,
        from_email: payload.FromFull.Email,
        reason: 'SPF/DKIM checks failed or indicated potential spoofing.'
      }
    });
    // mcpPlan and mcpResults remain null as initialized

  } else { // Sender IS VERIFIED
    console.log(`✅ Sender ${payload.FromFull.Email} VERIFIED. Proceeding with MCP planning.`);
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');

    if (!geminiApiKey) {
      console.error('❌ GEMINI_API_KEY is not set. Skipping MCP planning.');
      mcpActionDigest = "MCP planning skipped: GEMINI_API_KEY not set.";
      await supabase.from('activity_logs').insert({
        user_id: userId, email_interaction_id: emailInteractionId,
        action: 'mcp_planning_skipped', status: 'warning',
        details: { agent_id: agentConfig.agent_id, reason: 'GEMINI_API_KEY not set' }
      });
      // mcpPlan remains null
    } else if (!agentConfig.mcp_endpoints || agentConfig.mcp_endpoints.length === 0) {
      console.log(`🤔 Agent ${agentConfig.agent_id} has no MCP endpoints. Skipping MCP planning.`);
      mcpActionDigest = "MCP planning skipped: Agent has no MCP endpoints configured.";
      // mcpPlan remains null
    } else {
      // Has API Key and Endpoints, proceed to generate plan
      const emailBodyContent = payload.TextBody || payload.HtmlBody || payload.StrippedTextReply || "";
      console.log(`🗺️ Agent ${agentConfig.agent_id} has ${agentConfig.mcp_endpoints.length} MCPs. Attempting to generate plan with Gemini.`);
      mcpPlan = await generateMCPToolPlan(
        emailBodyContent, payload.FromFull.Email, payload.FromName,
        agentConfig.mcp_endpoints, geminiApiKey, supabase, userId, emailInteractionId
      );

      if (mcpPlan && mcpPlan.length > 0) {
        console.log(`✅ MCP Plan generated for agent ${agentConfig.agent_id}:`, JSON.stringify(mcpPlan, null, 2));
        console.log(`▶️ Executing MCP Plan for agent ${agentConfig.agent_id}:`, mcpPlan);
        mcpResults = await executeMCPPlan(mcpPlan, agentConfig.mcp_endpoints, supabase, userId, emailInteractionId);
        console.log(`📝 MCP Results for agent ${agentConfig.agent_id}:`, mcpResults);

        // Store raw mcpResults in email_interactions (this is an intermediate update)
        const { error: updateError } = await supabase
          .from('email_interactions')
          .update({ mcp_results: mcpResults, updated_at: new Date().toISOString() })
          .eq('id', emailInteractionId);
        if (updateError) {
          console.error('❌ Failed to store MCP results in email_interactions:', updateError);
          await supabase.from('activity_logs').insert({
            user_id: userId, email_interaction_id: emailInteractionId,
            action: 'mcp_result_storage_error', status: 'error',
            details: { agent_id: agentConfig.agent_id, error: updateError.message },
          });
        } else {
          console.log('✅ Successfully stored MCP results in email_interactions.');
        }

        // Now, generate the detailed mcpActionDigest from mcpPlan and mcpResults
        if (mcpResults && mcpPlan.length === mcpResults.length) {
          console.log(`🛠️ Generating MCP Action Digest for agent ${agentConfig.agent_id}`);
          const digestParts: string[] = [];
          for (let i = 0; i < mcpPlan.length; i++) {
            const planStep = mcpPlan[i] as { tool: string; args: any };
            const resultStep = mcpResults[i] as { tool_name: string; status: string; response: any; error_message: string };
            const mcpConfigMatched = agentConfig.mcp_endpoints.find(mcp => mcp.name === planStep.tool);
            const toolDescription = mcpConfigMatched?.instructions || 'No description found.';
            const argsString = JSON.stringify(planStep.args);
            const status = resultStep.status;
            const outputString = status === 'success' ? JSON.stringify(resultStep.response) : resultStep.error_message;
            digestParts.push(
              `Action ${i + 1}: ${planStep.tool}\nDescription: ${toolDescription}\nArguments: ${argsString}\nStatus: ${status}\nOutput: ${outputString}\n---`
            );
          }
          mcpActionDigest = digestParts.join('\n');
          console.log(`📄 MCP Action Digest generated for agent ${agentConfig.agent_id}:\n${mcpActionDigest}`);
        } else {
          console.warn(`⚠️ MCP Plan and Results length mismatch for agent ${agentConfig.agent_id}. Cannot generate accurate digest.`);
          mcpActionDigest = 'Error: MCP Plan and Results length mismatch. Digest could not be generated.';
        }
      } else if (mcpPlan === null) {
        // Plan generation failed (e.g., Gemini error)
        console.warn(`⚠️ MCP Plan generation returned null for agent ${agentConfig.agent_id}.`);
        mcpActionDigest = "MCP plan generation failed.";
      } else { // mcpPlan is an empty array
        console.log(`ℹ️ MCP Plan is empty for agent ${agentConfig.agent_id}. No actions to execute.`);
        mcpActionDigest = "No MCP actions were deemed necessary based on the email content.";
      }
    }
  } // Closing the main 'else' for senderIsVerified

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
    mcp_results: mcpResults || [], // mcpResults will be null/empty if sender not verified
    mcp_action_digest: mcpActionDigest, // mcpActionDigest will have the appropriate message
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
