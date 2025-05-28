
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
    const inboundHash = toEmail.split('@')[0] // Extract hash from email

    console.log('🔍 Looking for user with inbound hash:', inboundHash)

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

    // Store the inbound email
    console.log('💾 Storing inbound email...')
    const { error: insertError } = await supabase
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

    if (insertError) {
      console.error('❌ Error inserting inbound email:', insertError)
      return new Response('Database error', { 
        status: 500, 
        headers: corsHeaders 
      })
    }

    console.log('✅ Successfully stored inbound email')

    // Create an email interaction record
    console.log('📝 Creating email interaction record...')
    const { error: interactionError } = await supabase
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

    if (interactionError) {
      console.error('⚠️ Error creating email interaction:', interactionError)
      // Don't fail the webhook if this fails, just log it
    } else {
      console.log('✅ Successfully created email interaction')
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
