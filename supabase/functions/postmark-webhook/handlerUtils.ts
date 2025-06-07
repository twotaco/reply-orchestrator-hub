// handlerUtils.ts for postmark-webhook function
import type { PostmarkWebhookPayload, WorkspaceConfigWithUser } from './types.ts';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export async function handlePostmarkRequest(
  supabase: any, // Admin client
  workspaceConfig: WorkspaceConfigWithUser,
  payload: PostmarkWebhookPayload,
  processEmailFn: (
    supabaseClient: any,
    userId: string,
    payload: PostmarkWebhookPayload,
    emailInteractionId: string
  ) => Promise<{ success: boolean; warnings: string[]; errors: string[] }>
): Promise<Response> {
  const userId = workspaceConfig.user_id;
  const responseData = {
    status: 'success',
    message: `Webhook call for MessageID ${payload.MessageID} acknowledged by handler.`,
    warnings: [] as string[],
    errors: [] as string[],
    processed_at: new Date().toISOString()
  };

  try {
    const toEmailForStorage = payload.ToFull?.[0]?.Email || payload.To;
    const spamHeaders = payload.Headers || [];
    const spamScoreHeader = spamHeaders.find(h => h.Name === 'X-Spam-Score')?.Value;
    const spamScore = spamScoreHeader ? parseFloat(spamScoreHeader) : null;
    const spamStatus = spamHeaders.find(h => h.Name === 'X-Spam-Status')?.Value;

    // --- Log to postmark_inbound_emails (raw email log) ---
    try {
      const { data: existingRawEmail, error: checkRawError } = await supabase
          .from('postmark_inbound_emails')
          .select('id')
          .eq('message_id', payload.MessageID)
          .eq('user_id', userId)
          .single();

      if (checkRawError && checkRawError.code !== 'PGRST116') { // PGRST116: Not Found
          console.warn(`DB Warning (raw log check for MessageID ${payload.MessageID}): ${checkRawError.message}`);
          responseData.warnings.push(`DB Warning (raw log check): ${checkRawError.message}`);
      }

      if (existingRawEmail) {
          const { error: updateRawError } = await supabase
              .from('postmark_inbound_emails')
              .update({
                  raw_webhook_data: payload,
                  updated_at: new Date().toISOString(),
                  headers: payload.Headers,
                  spam_score: spamScore,
                  spam_status: spamStatus
              })
              .eq('id', existingRawEmail.id);
          if (updateRawError) {
              console.warn(`DB Warning (raw log update for MessageID ${payload.MessageID}): ${updateRawError.message}`);
              responseData.warnings.push(`DB Warning (raw log update): ${updateRawError.message}`);
          }
      } else {
          const { error: insertRawError } = await supabase
              .from('postmark_inbound_emails')
              .insert({
                  user_id: userId, message_id: payload.MessageID, from_email: payload.From,
                  from_name: payload.FromName, to_email: toEmailForStorage, cc_email: payload.Cc || null,
                  bcc_email: payload.Bcc || null, subject: payload.Subject, text_body: payload.TextBody,
                  html_body: payload.HtmlBody, stripped_text_reply: payload.StrippedTextReply,
                  mailbox_hash: payload.MailboxHash, spam_score: spamScore,
                  spam_status: spamStatus, attachments: payload.Attachments, headers: payload.Headers,
                  raw_webhook_data: payload, processed: false // 'processed' here refers to raw log, not KR processing
              });
          if (insertRawError) {
              console.warn(`DB Warning (raw log insert for MessageID ${payload.MessageID}): ${insertRawError.message}`);
              responseData.warnings.push(`DB Warning (raw log insert): ${insertRawError.message}`);
          }
      }
    } catch (rawLogErr: any) {
        console.error(`Error during raw email logging for MessageID ${payload.MessageID}: ${rawLogErr.message}`);
        responseData.warnings.push(`Error during raw email logging: ${rawLogErr.message}`);
    }
    // --- END postmark_inbound_emails LOGIC ---

    let interactionRecordId: string | null = null;
    let callProcessEmailFunction = false;
    let originalInteractionStatusForLogging: string | null = null;

    const { data: existingInteraction, error: interactionCheckError } = await supabase
      .from('email_interactions')
      .select('id, status')
      .eq('message_id', payload.MessageID)
      .eq('user_id', userId)
      .single();

    if (interactionCheckError && interactionCheckError.code !== 'PGRST116') {
      console.error(`❌ DB error checking existing email_interaction for MessageID ${payload.MessageID}: ${interactionCheckError.message}`);
      responseData.status = 'error';
      responseData.message = 'Database error: Could not check for existing interaction.';
      responseData.errors.push(`DB error (interaction check): ${interactionCheckError.message}`);
      return new Response(JSON.stringify(responseData), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
    }

    // When using the UI testing feature, Postmark sends a header `X-KnowReply-Test: true`. Bypass blocking existing interactions for these test emails.
    let isTestEmail = false;
    if (payload.Headers && Array.isArray(payload.Headers)) {
      const testHeader = payload.Headers.find(h => h.Name.toLowerCase() === 'x-knowreply-test');
      if (testHeader && testHeader.Value.toLowerCase() === 'true') {
        isTestEmail = true;
      }
    }

    if (existingInteraction && !isTestEmail) {
      interactionRecordId = existingInteraction.id;
      originalInteractionStatusForLogging = existingInteraction.status;
      console.log(`Found existing interaction ${interactionRecordId} for MessageID ${payload.MessageID}. Current status: ${originalInteractionStatusForLogging}`);

      if (originalInteractionStatusForLogging === 'failed') {
        responseData.message = `Retrying previously failed interaction (ID: ${interactionRecordId}) for MessageID ${payload.MessageID}.`;
        console.log(responseData.message);
        const { error: updateStatusError } = await supabase
          .from('email_interactions')
          .update({ status: 'received', updated_at: new Date().toISOString(), postmark_request: payload })
          .eq('id', interactionRecordId);

        if (updateStatusError) {
          console.error(`❌ Failed to update status to 'received' for retrying failed interaction ${interactionRecordId}:`, updateStatusError.message);
          responseData.warnings.push(`DB Warning: Failed to reset status for retry of ${interactionRecordId}: ${updateStatusError.message}`);
          // Even if status update fails, we might still want to proceed if interactionRecordId is valid.
          // Or, decide this is critical and return. For now, proceeding.
        }
        callProcessEmailFunction = true;
      } else {
        // 'received', 'processing', 'replied', 'processed'
        responseData.message = `Webhook acknowledged. Interaction for MessageID ${payload.MessageID} already has status: ${originalInteractionStatusForLogging}.`;
        responseData.warnings.push(
          `Duplicate/concurrent call for MessageID: ${payload.MessageID}. Interaction status: ${originalInteractionStatusForLogging}. No new processing for this call.`
        );
        console.log(responseData.message);
        callProcessEmailFunction = false;
      }
    } else {
      // No existing interaction, this is a new email or test email
      responseData.message = `New interaction to be created for MessageID ${payload.MessageID}.`;
      console.log(responseData.message);
      const { data: newInteraction, error: insertError } = await supabase
        .from('email_interactions')
        .insert({
          user_id: userId, message_id: payload.MessageID, from_email: payload.From,
          to_email: toEmailForStorage, subject: payload.Subject,
          original_content: payload.TextBody || payload.HtmlBody, status: 'received',
          postmark_request: payload, source: 'postmark_webhook',
        })
        .select('id')
        .single();

      if (insertError || !newInteraction) {
        console.error(`❌ DB error inserting new email_interaction for MessageID ${payload.MessageID}:`, insertError?.message);
        responseData.status = 'error';
        responseData.message = 'Database error: Could not create new interaction.';
        responseData.errors.push(`DB error (interaction insert): ${insertError?.message || 'Unknown error during insert'}`);
        return new Response(JSON.stringify(responseData), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
      }
      interactionRecordId = newInteraction.id;
      console.log(`Created new interaction ${interactionRecordId} with status 'received'.`);
      callProcessEmailFunction = true;
    }

    if (callProcessEmailFunction && interactionRecordId) {
      console.log(`🤖 Proceeding to call processEmailFn for interaction ID: ${interactionRecordId} (MessageID: ${payload.MessageID})`);
      const knowReplyResult = await processEmailFn(
        supabase, userId, payload, interactionRecordId
      );

      responseData.warnings.push(...knowReplyResult.warnings);
      responseData.errors.push(...knowReplyResult.errors);
      if (!knowReplyResult.success) {
        responseData.status = 'error';
        if (responseData.message.includes('acknowledged') || responseData.message.startsWith('New') || responseData.message.startsWith('Retrying')) {
            responseData.message = `Processing by core logic for interaction ${interactionRecordId} reported issues.`;
        }
      } else {
        // Update message only if it was a retry or new, to reflect successful processing
        if (originalInteractionStatusForLogging === 'failed') {
            responseData.message = `Successfully retried and processed previously failed interaction ${interactionRecordId}.`;
        } else if (!existingInteraction) { // implies it was a new interaction
            responseData.message = `Successfully processed new interaction ${interactionRecordId}.`;
        }
        // If it was a duplicate of an already processed/replied item, the message remains as set earlier.
      }
    } else if (callProcessEmailFunction && !interactionRecordId) {
      // This case should ideally not be reached if logic above is correct
      console.error(`❌ CRITICAL: callProcessEmailFunction is true but interactionRecordId is null for MessageID ${payload.MessageID}.`);
      responseData.status = 'error';
      responseData.message = 'Internal error: Interaction ID missing before processing.';
      responseData.errors.push('Interaction ID was not available for processing.');
    }

    let httpStatusCode = 200;
    // If there were errors from processEmailFn, or critical errors in this handler before processEmailFn.
    if (responseData.status === 'error' && responseData.errors.length > 0) {
        httpStatusCode = 422; // Unprocessable Entity - request understood, but content issues or processing failed
    }

    console.log(`🎉 Finalizing Postmark webhook response for MessageID ${payload.MessageID}. HTTP Status: ${httpStatusCode}. Overall Status: ${responseData.status}.`);
    return new Response(JSON.stringify(responseData), {
      status: httpStatusCode,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error(`💥 Top-level error in handlePostmarkRequest for MessageID ${payload.MessageID || 'Unknown MessageID'}:`, error);
    // Ensure responseData reflects the top-level error if not already set
    if (responseData.status === 'success') { // Avoid overwriting specific error messages if already set
        responseData.status = 'error';
        responseData.message = 'Critical internal server error in webhook handler.';
    }
    if (!responseData.errors.some(e => e.includes((error as Error).message))) {
        responseData.errors.push(`Unhandled processing error: ${(error as Error).message}`);
    }
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
  if (!headers) return null;
  const match = headers.find(h => h.Name.toLowerCase() === name.toLowerCase());
  return match ? match.Value : null;
}

function extractDomain(email: string): string | null {
  if (!email) return null;
  const match = email.match(/@([^>]+)>?$/);
  return match ? match[1].toLowerCase() : null;
}

export function isSenderVerified(headers: PostmarkWebhookPayload['Headers'], fromEmail: string): boolean {
  if (!headers) {
    console.log(`Verification failed: Headers are null or undefined for email associated with ${fromEmail}.`);
    return false;
  }

  const spamStatus = getHeaderValue(headers, 'X-Spam-Status');
  if (spamStatus && spamStatus.toLowerCase().startsWith('yes')) {
    console.log(`Verification failed for ${fromEmail}: X-Spam-Status is "${spamStatus}".`);
    return false;
  }

  const spamTests = getHeaderValue(headers, 'X-Spam-Tests') || '';

  const dkimSigned = spamTests.includes('DKIM_SIGNED');
  const dkimValid = spamTests.includes('DKIM_VALID');
//  const dkimAligned = spamTests.includes('DKIM_VALID_AU');
  const spfPassInTests = spamTests.includes('SPF_PASS');

  if (!dkimSigned) console.log(`Verification failed for ${fromEmail}: DKIM_SIGNED not found in X-Spam-Tests ("${spamTests}").`);
  if (!dkimValid) console.log(`Verification failed for ${fromEmail}: DKIM_VALID not found in X-Spam-Tests ("${spamTests}").`);
//  if (!dkimAligned) console.log(`Verification failed for ${fromEmail}: DKIM_VALID_AU not found in X-Spam-Tests ("${spamTests}").`);
  if (!spfPassInTests) console.log(`Verification failed for ${fromEmail}: SPF_PASS not found in X-Spam-Tests ("${spamTests}").`);

  return dkimSigned && dkimValid && spfPassInTests; // && dkimAligned; 
}
