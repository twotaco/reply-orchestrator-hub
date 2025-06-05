// handlerUtils.ts for postmark-webhook function
import type { PostmarkWebhookPayload } from './types.ts';
// Deno object is globally available in Deno runtime
// SupabaseClient type is not strictly needed as supabase is 'any'
import type { WorkspaceConfigWithUser } from './types.ts'; // Import WorkspaceConfigWithUser

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  // Removed 'Access-Control-Allow-Methods' as OPTIONS is handled in index.ts
};

export async function handlePostmarkRequest(
  supabase: any, // This is the admin client from index.ts
  workspaceConfig: WorkspaceConfigWithUser, // Authenticated workspace config (includes user_id)
  payload: PostmarkWebhookPayload, // Parsed payload from index.ts
  processEmailFn: (
    supabase: any,
    userId: string,
    payload: PostmarkWebhookPayload,
    emailInteractionId: string
  ) => Promise<{ success: boolean; warnings: string[]; errors: string[] }>
): Promise<Response> {
  const responseData = {
    status: 'success',
    message: `Email processed for user: ${workspaceConfig.user_id}`, // Updated message
    warnings: [] as string[],
    errors: [] as string[],
    processed_at: new Date().toISOString()
  };

  try {
    // User is already authenticated by API key in index.ts (via workspaceConfig)
    // The payload is already parsed in index.ts
    // Method check (POST) is already done in index.ts

    console.log('📨 Processing payload in handlePostmarkRequest for user:', workspaceConfig.user_id);
    console.log('   From:', payload.From);
    console.log('   To:', payload.To);
    console.log('   Subject:', payload.Subject);
    console.log('   MessageID:', payload.MessageID);

    const spamHeaders = payload.Headers || [];
    const spamScore = spamHeaders.find(h => h.Name === 'X-Spam-Score')?.Value;
    const spamStatus = spamHeaders.find(h => h.Name === 'X-Spam-Status')?.Value;

    // Use the authenticated user_id from workspaceConfig
    const userId = workspaceConfig.user_id;
    const toEmailForStorage = payload.ToFull?.[0]?.Email || payload.To; // For storage purposes

    // REMOVED: Old inbound hash logic for user identification

    console.log(`✅ User authenticated via API key: ${userId}`);
    // responseData.message is already set with user_id

    const { data: existingEmail, error: checkError } = await supabase
      .from('postmark_inbound_emails')
      .select('id, message_id')
      .eq('message_id', payload.MessageID)
      .eq('user_id', userId) // Use authenticated userId
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('❌ Error checking for existing email:', checkError);
      responseData.errors.push(`Database error checking existing email: ${checkError.message}`);
    }

    if (existingEmail) {
      console.log('📝 Updating existing email record for message_id:', payload.MessageID);
      // responseData.warnings.push(`Updated existing email record for message_id: ${payload.MessageID}`); // This can be noisy
      const { error: updateError } = await supabase
        .from('postmark_inbound_emails')
        .update({
          from_email: payload.From, from_name: payload.FromName, to_email: toEmailForStorage,
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
      console.log('💾 Creating new inbound email record for user:', userId);
      // responseData.warnings.push(`Created new email record for message_id: ${payload.MessageID}`); // Can be noisy
      const { error: insertError } = await supabase
        .from('postmark_inbound_emails')
        .insert({
          user_id: userId, // Use authenticated userId
          message_id: payload.MessageID, from_email: payload.From,
          from_name: payload.FromName, to_email: toEmailForStorage, cc_email: payload.Cc || null, bcc_email: payload.Bcc || null,
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
      .eq('user_id', userId) // Use authenticated userId
      .single();

    let interactionRecordId;
    // Refined logic for creating/updating interaction record
    if (interactionCheckError && interactionCheckError.code === 'PGRST116') { // Not found, create new
        console.log('📝 Creating new email interaction record for user:', userId);
        const { data: newInteraction, error: interactionError } = await supabase
        .from('email_interactions')
        .insert({
          user_id: userId, // Use authenticated userId
          message_id: payload.MessageID,
          from_email: payload.From,
          to_email: toEmailForStorage,
          subject: payload.Subject,
          original_content: payload.TextBody || payload.HtmlBody,
          status: 'received', // Changed from 'pending'
          postmark_request: payload,
          source: 'postmark_webhook',
        })
        .select('id').single();
      if (interactionError) {
        console.error('⚠️ Error creating email interaction:', interactionError);
        responseData.errors.push(`Database error creating email interaction: ${interactionError.message}`);
      } else if (newInteraction) {
        interactionRecordId = newInteraction.id;
        console.log(`✅ New email interaction created with ID: ${interactionRecordId} for user ${userId}.`);
      }
    } else if (interactionCheckError) { // Some other DB error
        console.error('⚠️ Database error checking for existing email interaction:', interactionCheckError);
        responseData.errors.push(`Database error checking existing email interaction: ${interactionCheckError.message}`);
    }
     else if (existingInteraction) { // Found existing, update it
      console.log('📝 Updating existing email interaction for message_id:', payload.MessageID, 'ID:', existingInteraction.id);
      const { error: updateInteractionError } = await supabase
        .from('email_interactions')
        .update({
          from_email: payload.From, to_email: toEmailForStorage, subject: payload.Subject,
          original_content: payload.TextBody || payload.HtmlBody,
          status: 'received', // Also ensure existing interactions are reset to 'received' for reprocessing
          postmark_request: payload,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingInteraction.id);
      if (updateInteractionError) {
        console.error('⚠️ Error updating email interaction:', updateInteractionError);
        // Not pushing to responseData.errors for now, as it might not be fatal for KnowReply call
      }
      interactionRecordId = existingInteraction.id;
    }

    if (!interactionRecordId) {
        console.error(`❌ Failed to obtain interactionRecordId for user ${userId}. Cannot proceed with KnowReply processing.`);
        responseData.status = 'error';
        responseData.message = 'Failed to create or update email interaction record.';
        responseData.errors.push('Internal error: Could not obtain email interaction ID.');
    }

    if (interactionRecordId) {
      console.log(`🤖 Starting KnowReply processing for user ${userId}, interaction ID: ${interactionRecordId}`);
      const knowReplyResult = await processEmailFn(
        supabase, // Pass the admin client from index.ts
        userId, // Pass the authenticated userId
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
  // fromEmail is kept for potential future use in logging or more advanced heuristics, though not central to this logic.
  if (!headers) { // fromEmail check removed as it's not used in core logic, only logs
    console.log(`Verification failed: Headers are null or undefined for email associated with ${fromEmail}.`); // fromEmail still useful for context here
    return false;
  }

  const spamStatus = getHeaderValue(headers, 'X-Spam-Status');
  if (spamStatus && spamStatus.toLowerCase().startsWith('yes')) {
    console.log(`Verification failed for ${fromEmail}: X-Spam-Status is "${spamStatus}".`);
    return false;
  }

  const spamTests = getHeaderValue(headers, 'X-Spam-Tests') || ''; // Default to empty string if header is null

  const dkimSigned = spamTests.includes('DKIM_SIGNED');
  const dkimValid = spamTests.includes('DKIM_VALID');
  const dkimAligned = spamTests.includes('DKIM_VALID_AU');
  const spfPassInTests = spamTests.includes('SPF_PASS');

  if (!dkimSigned) console.log(`Verification failed for ${fromEmail}: DKIM_SIGNED not found in X-Spam-Tests ("${spamTests}").`);
  if (!dkimValid) console.log(`Verification failed for ${fromEmail}: DKIM_VALID not found in X-Spam-Tests ("${spamTests}").`);
  if (!dkimAligned) console.log(`Verification failed for ${fromEmail}: DKIM_VALID_AU not found in X-Spam-Tests ("${spamTests}").`);
  if (!spfPassInTests) console.log(`Verification failed for ${fromEmail}: SPF_PASS not found in X-Spam-Tests ("${spamTests}").`);

  return dkimSigned && dkimValid && dkimAligned && spfPassInTests;
}
