
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
  }>
}

async function processEmailWithKnowReply(
  supabase: any,
  userId: string,
  payload: PostmarkWebhookPayload,
  emailInteractionId: string
) {
  console.log('🤖 Starting KnowReply processing for user:', userId)

  try {
    // Get user's KnowReply configuration
    const { data: workspaceConfig, error: configError } = await supabase
      .from('workspace_configs')
      .select('knowreply_api_token, knowreply_base_url')
      .eq('user_id', userId)
      .single()

    if (configError || !workspaceConfig?.knowreply_api_token) {
      console.log('⚠️ No KnowReply configuration found for user')
      return
    }

    console.log('✅ Found KnowReply config, checking for agent mappings...')

    // Get active agent mappings for the user (without JOIN first)
    const { data: agentMappings, error: mappingsError } = await supabase
      .from('knowreply_agent_mcp_mappings')
      .select('agent_id, mcp_endpoint_id')
      .eq('user_id', userId)
      .eq('active', true)

    if (mappingsError) {
      console.error('❌ Error fetching agent mappings:', mappingsError)
      return
    }

    if (!agentMappings || agentMappings.length === 0) {
      console.log('⚠️ No active agent configurations found for user:', userId)
      console.log('💡 Make sure you have configured agents in the KnowReply Setup page')
      return
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
        .select('id, name, post_url, auth_token')
        .in('id', mcpEndpointIds)
        .eq('active', true)

      if (endpointsError) {
        console.error('❌ Error fetching MCP endpoints:', endpointsError)
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
      } catch (error) {
        console.error(`❌ Error processing with agent ${agentId}:`, error)
        
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

  } catch (error) {
    console.error('💥 Error in KnowReply processing:', error)
    
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
  console.log(`📨 Processing email with agent ${agentConfig.agent_id}`)

  // Prepare the KnowReply request
  const knowReplyRequest = {
    agent_id: agentConfig.agent_id,
    message: payload.StrippedTextReply || payload.TextBody || payload.HtmlBody,
    context: {
      from: payload.From,
      subject: payload.Subject,
      message_id: payload.MessageID,
      mailbox_hash: payload.MailboxHash
    },
    mcp_endpoints: agentConfig.mcp_endpoints.map(endpoint => ({
      name: endpoint.name,
      url: endpoint.post_url,
      auth_token: endpoint.auth_token
    }))
  }

  console.log('📤 Sending request to KnowReply:', {
    agent_id: agentConfig.agent_id,
    mcp_count: agentConfig.mcp_endpoints.length,
    base_url: workspaceConfig.knowreply_base_url
  })

  // Make the KnowReply API call
  const knowReplyUrl = `${workspaceConfig.knowreply_base_url}/process-email`
  
  const response = await fetch(knowReplyUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${workspaceConfig.knowreply_api_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(knowReplyRequest)
  })

  const responseData = await response.json()

  if (!response.ok) {
    throw new Error(`KnowReply API error: ${response.status} - ${JSON.stringify(responseData)}`)
  }

  console.log('✅ KnowReply response received for agent:', agentConfig.agent_id)

  // Update the email interaction with KnowReply results
  await supabase
    .from('email_interactions')
    .update({
      knowreply_agent_used: agentConfig.agent_id,
      knowreply_request: knowReplyRequest,
      knowreply_response: responseData,
      knowreply_mcp_results: responseData.mcp_results || null,
      intent: responseData.intent || null,
      status: 'processed',
      updated_at: new Date().toISOString()
    })
    .eq('id', emailInteractionId)

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

  try {
    console.log('🔧 Creating Supabase client...')
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    if (req.method !== 'POST') {
      console.log('❌ Method not allowed:', req.method)
      return new Response('Method not allowed', { 
        status: 405, 
        headers: corsHeaders 
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
    // We'll match the To email with the postmark_inbound_hash in workspace_configs
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
      return new Response('Inbound hash not found', { 
        status: 404, 
        headers: corsHeaders 
      })
    }

    console.log('✅ Found workspace config for user:', workspaceConfig.user_id)

    // Check if this message_id already exists
    const { data: existingEmail, error: checkError } = await supabase
      .from('postmark_inbound_emails')
      .select('id, message_id')
      .eq('message_id', payload.MessageID)
      .eq('user_id', workspaceConfig.user_id)
      .single()

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('❌ Error checking for existing email:', checkError)
      return new Response('Database error', { 
        status: 500, 
        headers: corsHeaders 
      })
    }

    let emailRecord
    if (existingEmail) {
      console.log('📝 Updating existing email record for message_id:', payload.MessageID)
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
        return new Response('Database error', { 
          status: 500, 
          headers: corsHeaders 
        })
      }
      emailRecord = updatedRecord
      console.log('✅ Successfully updated existing inbound email')
    } else {
      console.log('💾 Creating new inbound email record...')
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
        return new Response('Database error', { 
          status: 500, 
          headers: corsHeaders 
        })
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

    let interactionRecord
    if (existingInteraction) {
      console.log('📝 Updating existing email interaction for message_id:', payload.MessageID)
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
        interactionRecord = updatedInteraction
        console.log('✅ Successfully updated email interaction')
      }
    } else {
      console.log('📝 Creating new email interaction record...')
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
        interactionRecord = newInteraction
        console.log('✅ Successfully created email interaction')
      }
    }

    // Process the email with KnowReply in the background if we have an interaction record
    if (interactionRecord) {
      console.log('🤖 Starting KnowReply processing...')
      processEmailWithKnowReply(
        supabase,
        workspaceConfig.user_id,
        payload,
        interactionRecord.id
      ).catch(error => {
        console.error('💥 Background KnowReply processing failed:', error)
      })
    }

    console.log('🎉 Successfully processed Postmark webhook for user:', workspaceConfig.user_id)

    return new Response('OK', { 
      status: 200, 
      headers: corsHeaders 
    })

  } catch (error) {
    console.error('💥 Error processing Postmark webhook:', error)
    console.error('💥 Error stack:', error.stack)
    return new Response('Internal server error', { 
      status: 500, 
      headers: corsHeaders 
    })
  }
})
