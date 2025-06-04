// handlerUtils.ts for postmark-webhook function
import type { PostmarkWebhookPayload } from './types.ts';
// Deno object is globally available in Deno runtime
// SupabaseClient type is not strictly needed as supabase is 'any'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export async function handlePostmarkRequest(
  req: Request,
  supabase: any, // Keeping as 'any' as per current signature in index.ts
  processEmailFn: ( // Type for processEmailWithKnowReply
    supabase: any,
    userId: string,
    payload: PostmarkWebhookPayload,
    emailInteractionId: string
  ) => Promise<{ success: boolean; warnings: string[]; errors: string[] }>
): Promise<Response> {
  const responseData = {
    status: 'success',
    message: 'Email processed successfully',
    warnings: [] as string[],
    errors: [] as string[],
    processed_at: new Date().toISOString()
  };

  try {
    // Note: Supabase client creation is now expected to be done in index.ts before calling this handler.
    // The console.log for client creation can be removed or adapted if needed.

    if (req.method !== 'POST') {
      console.log('❌ Method not allowed:', req.method);
      responseData.status = 'error';
      responseData.message = 'Method not allowed';
      responseData.errors.push('Only POST method is allowed');
      return new Response(JSON.stringify(responseData), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('📨 Parsing request body...');
    const payload: PostmarkWebhookPayload = await req.json();
    console.log('📧 Received Postmark webhook payload:');
    console.log('   From:', payload.From);
    console.log('   To:', payload.To);
    console.log('   Subject:', payload.Subject);
    console.log('   MessageID:', payload.MessageID);

    const spamHeaders = payload.Headers || [];
    const spamScore = spamHeaders.find(h => h.Name === 'X-Spam-Score')?.Value;
    const spamStatus = spamHeaders.find(h => h.Name === 'X-Spam-Status')?.Value;

    const toEmail = payload.ToFull?.[0]?.Email || payload.To;
    const emailPart = toEmail.split('@')[0];
    const inboundHash = emailPart.split('+')[0];

    console.log('🔍 Looking for user with inbound hash:', inboundHash);

    const { data: workspaceConfig, error: configError } = await supabase
      .from('workspace_configs')
      .select('user_id')
      .eq('postmark_inbound_hash', inboundHash)
      .single();

    if (configError || !workspaceConfig) {
      console.error('❌ Could not find workspace config for inbound hash:', inboundHash, configError);
      responseData.status = 'error';
      responseData.message = 'Inbound hash not found';
      responseData.errors.push(`No workspace configuration found for inbound hash: ${inboundHash}`);
      return new Response(JSON.stringify(responseData), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('✅ Found workspace config for user:', workspaceConfig.user_id);
    responseData.message = `Email processed for user: ${workspaceConfig.user_id}`;

    const { data: existingEmail, error: checkError } = await supabase
      .from('postmark_inbound_emails')
      .select('id, message_id')
      .eq('message_id', payload.MessageID)
      .eq('user_id', workspaceConfig.user_id)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('❌ Error checking for existing email:', checkError);
      responseData.errors.push(`Database error checking existing email: ${checkError.message}`);
    }

    // let emailRecord; // Not strictly needed if not used later in this function
    if (existingEmail) {
      console.log('📝 Updating existing email record for message_id:', payload.MessageID);
      responseData.warnings.push(`Updated existing email record for message_id: ${payload.MessageID}`);
      const { error: updateError } = await supabase
        .from('postmark_inbound_emails')
        .update({
          from_email: payload.From, from_name: payload.FromName, to_email: toEmail,
          cc_email: payload.Cc || null, bcc_email: payload.Bcc || null, subject: payload.Subject,
          text_body: payload.TextBody, html_body: payload.HtmlBody, stripped_text_reply: payload.StrippedTextReply,
          mailbox_hash: payload.MailboxHash, spam_score: spamScore ? parseFloat(spamScore) : null, spam_status: spamStatus,
          attachments: payload.Attachments, headers: payload.Headers, raw_webhook_data: payload,
          processed: false, updated_at: new Date().toISOString()
        })
        .eq('id', existingEmail.id);
      if (updateError) {
        console.error('❌ Error updating inbound email:', updateError);
        responseData.errors.push(`Database error updating inbound email: ${updateError.message}`);
      } else {
        console.log('✅ Successfully updated existing inbound email');
      }
    } else {
      console.log('💾 Creating new inbound email record...');
      responseData.warnings.push(`Created new email record for message_id: ${payload.MessageID}`);
      const { error: insertError } = await supabase
        .from('postmark_inbound_emails')
        .insert({
          user_id: workspaceConfig.user_id, message_id: payload.MessageID, from_email: payload.From,
          from_name: payload.FromName, to_email: toEmail, cc_email: payload.Cc || null, bcc_email: payload.Bcc || null,
          subject: payload.Subject, text_body: payload.TextBody, html_body: payload.HtmlBody,
          stripped_text_reply: payload.StrippedTextReply, mailbox_hash: payload.MailboxHash,
          spam_score: spamScore ? parseFloat(spamScore) : null, spam_status: spamStatus,
          attachments: payload.Attachments, headers: payload.Headers, raw_webhook_data: payload, processed: false
        });
      if (insertError) {
        console.error('❌ Error inserting inbound email:', insertError);
        responseData.errors.push(`Database error inserting inbound email: ${insertError.message}`);
      } else {
        console.log('✅ Successfully stored new inbound email');
      }
    }

    const { data: existingInteraction, error: interactionCheckError } = await supabase
      .from('email_interactions')
      .select('id')
      .eq('message_id', payload.MessageID)
      .eq('user_id', workspaceConfig.user_id)
      .single();

    let interactionRecordId;
    if (existingInteraction) {
      console.log('📝 Updating existing email interaction for message_id:', payload.MessageID);
      const { error: updateInteractionError } = await supabase
        .from('email_interactions')
        .update({
          from_email: payload.From, to_email: toEmail, subject: payload.Subject,
          original_content: payload.TextBody || payload.HtmlBody, status: 'received',
          postmark_request: payload, updated_at: new Date().toISOString()
        })
        .eq('id', existingInteraction.id);
      if (updateInteractionError) console.error('⚠️ Error updating email interaction:', updateInteractionError);
      else interactionRecordId = existingInteraction.id;
    } else {
      console.log('📝 Creating new email interaction record...');
      const { data: newInteraction, error: interactionError } = await supabase
        .from('email_interactions')
        .insert({
          user_id: workspaceConfig.user_id, message_id: payload.MessageID, from_email: payload.From,
          to_email: toEmail, subject: payload.Subject, original_content: payload.TextBody || payload.HtmlBody,
          status: 'received', postmark_request: payload
        })
        .select('id').single(); // Ensure 'id' is selected
      if (interactionError) console.error('⚠️ Error creating email interaction:', interactionError);
      else if (newInteraction) interactionRecordId = newInteraction.id;
    }
     if (!interactionRecordId) { // If ID couldn't be obtained either from existing or new
        console.error('❌ Failed to obtain interactionRecordId. Cannot proceed with KnowReply processing.');
        responseData.status = 'error';
        responseData.message = 'Failed to create or update email interaction record.';
        responseData.errors.push('Internal error: Could not obtain email interaction ID.');
    }


    if (interactionRecordId) {
      console.log('🤖 Starting KnowReply processing for interaction ID:', interactionRecordId);
      const knowReplyResult = await processEmailFn( // Using processEmailFn parameter
        supabase,
        workspaceConfig.user_id,
        payload,
        interactionRecordId
      );
      responseData.warnings.push(...knowReplyResult.warnings);
      responseData.errors.push(...knowReplyResult.errors);
      if (!knowReplyResult.success) {
        responseData.status = 'error';
        responseData.message = 'Email received but processing failed';
        if (knowReplyResult.errors.length === 0) {
          responseData.errors.push('Processing failed for unknown reasons');
        }
      } else {
        responseData.warnings.push('Processing completed successfully by processEmailFn');
      }
    }

    console.log('🎉 Successfully processed Postmark webhook for user:', workspaceConfig.user_id);
    const statusCode = responseData.status === 'error' ? 422 : 200;
    return new Response(JSON.stringify(responseData), {
      status: statusCode,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('💥 Error processing Postmark webhook in handlePostmarkRequest:', error);
    console.error('💥 Error stack:', (error as Error).stack);
    // Ensure responseData reflects the error for the final response
    responseData.status = 'error';
    responseData.message = 'Internal server error in handler';
    responseData.errors.push(`Processing error: ${(error as Error).message}`);
    return new Response(JSON.stringify(responseData), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}


// --- Sender Verification Utilities ---

// Type for headers parameter using indexed access type
type PostmarkHeaderArray = PostmarkWebhookPayload['Headers'];

function getHeaderValue(headers: PostmarkHeaderArray, name: string): string | null {
  if (!headers) return null; // Add a guard for undefined headers array
  const match = headers.find(h => h.Name.toLowerCase() === name.toLowerCase());
  return match ? match.Value : null;
}

function extractDomain(email: string): string | null {
  if (!email) return null;
  // Regex to capture domain from typical email format, including those with display names
  // e.g., "Name <user@example.com>" or just "user@example.com"
  const match = email.match(/@([^>]+)>?$/);
  return match ? match[1].toLowerCase() : null;
}

export function isSenderVerified(headers: PostmarkWebhookPayload['Headers'], fromEmail: string): boolean {
  // fromEmail is kept for potential future use or if a very detailed Authentication-Results header becomes available
  if (!headers || !fromEmail) return false;

  const receivedSpf = getHeaderValue(headers, 'Received-SPF') || '';
  const spamTests = getHeaderValue(headers, 'X-Spam-Tests') || '';
  const spamStatus = getHeaderValue(headers, 'X-Spam-Status');

  if (spamStatus && spamStatus.toLowerCase().startsWith('yes')) {
    console.log(`Sender ${fromEmail} marked as spam by X-Spam-Status. Verification failed.`);
    return false;
  }

  const spfPass = receivedSpf.toLowerCase().includes('pass');
  if (!spfPass) {
    console.log(`Sender ${fromEmail} SPF check did not pass. Received-SPF: "${receivedSpf}". Verification failed.`);
    // Not returning false immediately, as DKIM might still pass and be aligned,
    // but the final condition will fail. This log helps debug SPF part.
  }

  const dkimSigned = spamTests.includes('DKIM_SIGNED');
  const dkimValid = spamTests.includes('DKIM_VALID');
  // DKIM_VALID_AU (Author Domain Alignment) means the domain in the DKIM signature (d= field)
  // aligns with the domain in the From: header. This is crucial.
  const dkimAligned = spamTests.includes('DKIM_VALID_AU');

  if (!(dkimSigned && dkimValid && dkimAligned)) {
    console.log(`Sender ${fromEmail} DKIM checks did not pass or align. SpamTests: "${spamTests}". Verification failed.`);
    // Not returning false immediately, final condition handles it. This log helps debug DKIM part.
  }

  // For verification to pass:
  // 1. SPF for the envelope sender must pass.
  // 2. DKIM signature must exist, be valid, AND be aligned with the From: header domain.
  return spfPass && dkimSigned && dkimValid && dkimAligned;
}
