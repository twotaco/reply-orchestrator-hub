import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface LLMResponse {
  email_response: {
    include_manager: string;
    signoff: string;
    response_text: string;
    confidence_score: number;
    response_type: string;
  };
  analysis?: {
    funnel_stage: string;
    sentiment: string;
    priority_level: string;
  };
  customer_data?: {
    name: string | null;
    language: string | null;
    product_service_interest: string[] | null;
    geographic_information: string | null;
  };
  summary?: {
    email_summary: string;
    key_questions: { question: string; confidence_score: number }[];
  };
  llm_stats?: {
    llm_response_id: string;
    llm_model: string;
    llm_prompt_tokens: number;
    llm_completion_tokens: number;
  };
}

/**
 * Stores the LLM-generated output in the database
 */
export async function storeLLMOutput(
  parsedContent: LLMResponse,
  inquiryEmailId: string,
  customerEmail: string | null,
  subject: string | null,
  userId: string,
  agentId: string,
  agentEmailAddress: string,
): Promise<any> {

  // Log the incoming data for debugging
  console.log('Storing LLM output:', {
    inquiryEmailId,
    customerEmail,
    subject,
    agent: agentId,
    parsedContent,
  });  

  // Access specific parts of the structured response
  const { email_response, analysis, customer_data, summary, llm_stats } = parsedContent;

  try {

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '' // Use Service Role Key for admin operations
    );

    // Step 0: Get the agent_email_mappings for this agentId and emailAccountId combination
    const { data: agentEmailMapping, error: mappingError } = await supabase
      .from('agent_email_mappings')
      .select('id')
      .eq('agent_id', agentId)
      .eq('email_address', agentEmailAddress)
      .single();
    if (mappingError || !agentEmailMapping) {
      console.error('Error fetching agent email mapping:', mappingError);
      throw new Error(`Failed to fetch agent email mapping: ${mappingError.message}`);
    }
    const agentEmailId = agentEmailMapping.agent_email_id;


    // Step 1: Insert or update the customer record
    let customerId: string | null = null;
    if (customer_data) {
      const { data: customerData, error: customerError } = await supabase
        .from('inq_customers')
        .upsert(
          [
            {
              ...(customer_data?.name && { name: decodeMimeEncodedWord(customer_data.name) }),
              email: customerEmail || null,
              user_id: userId,
            },
          ],
          {
            onConflict: 'email,user_id'  // Updated to use composite unique constraint
          }
        )
        .select('customer_id');

      if (customerError) {
        console.error('Error upserting customer:', customerError);
        throw new Error(`Failed to upsert customer: ${customerError.message}`);
      }

      customerId = customerData?.[0]?.customer_id || null;
    }

    // Normalize the email subject for storage
    let normalizedSubject = '';
    if (subject) {
      normalizedSubject = stripEmailPrefixes(subject);
    }

    // Step 2: Upsert the email record
    const { data: emailData, error: emailError } = await supabase
      .from('inq_emails')
      .upsert(
        [
          {
            inquiry_email_id: inquiryEmailId, // Use IMAP UID
            customer_id: customerId,
            email_summary: summary?.email_summary || null,
            include_manager: email_response?.include_manager ?? 'no_manager_needed', // ENUM
            priority_level: analysis?.priority_level || 'medium', // ENUM
            sentiment_overall: analysis?.sentiment?.overall || 'neutral', // ENUM
            funnel_stage: analysis?.funnel_stage || 'unrelated', // ENUM
            received_at: new Date(),
            language: customer_data?.language || null,
            email_subject: normalizedSubject,
            email_account_id: agentEmailId,
          },
        ],
        { onConflict: 'inquiry_email_id,email_account_id' } //inq_emails_inquiry_email_id_account_unique
      )
      .select('email_id');

    if (emailError) {
      console.error('Error upserting email:', emailError);
      throw new Error(`Failed to upsert email: ${emailError.message}`);
    }

    const emailId = emailData?.[0]?.email_id;

    let inqResponseData = null; // Declare variable outside IF block

    // Step 3: Insert response if it exists
    if (email_response) {
      const { data, error: responseError } = await supabase
        .from('inq_responses')
        .insert([
          {
            email_id: emailId,
            response_text: email_response?.response_text || null,
            confidence_score: email_response?.confidence_score || null,
            response_type: email_response?.response_type || 'informative', // ENUM
            agent_id: agentId
          },
        ])
        .select(); // Ensure we get the inserted data

      if (responseError) {
        console.error('Error inserting response:', responseError);
        throw new Error(`Failed to insert response: ${responseError.message}`);
      }
      inqResponseData = data?.[0]; // Assign inserted record to the variable
    }

    // Step 4: Update inq_key_questions table with extracted key questions
    if (summary?.key_questions && Array.isArray(summary.key_questions)) {
      const keyQuestionsData = summary.key_questions.map((question: any) => ({
        email_id: emailId,
        question_text: decodeMimeEncodedWord(question?.question || ''),
        confidence_score: question?.confidence_score || null,
      }));

      const { error: keyQuestionsError } = await supabase
        .from('inq_key_questions')
        .upsert(keyQuestionsData, { onConflict: ['email_id', 'question_text'] });

      if (keyQuestionsError) {
        console.error('Error updating key questions:', keyQuestionsError);
        throw new Error(`Failed to update key questions: ${keyQuestionsError.message}`);
      }
    }

    // Step 5: Update inq_products table with extracted mentions
    if (customer_data?.product_service_interest && Array.isArray(customer_data.product_service_interest)) {
      const mentionsData = customer_data.product_service_interest.map((mention: any) => ({
        email_id: emailId,
        product_name: decodeMimeEncodedWord(mention || ''),
      }));

      const { error: keyMentionsError } = await supabase
        .from('inq_products')
        .upsert(mentionsData, { onConflict: ['email_id', 'product_name'] });

      if (keyMentionsError) {
        console.error('Error updating inq_products:', keyMentionsError);
        throw new Error(`Failed to update inq_products: ${keyMentionsError.message}`);
      }
    }

    console.log('LLM response successfully stored in the database.');
    return inqResponseData;
  } catch (error) {
    console.error('Error storing LLM output:', error);
    throw new Error(`Database storage failed: ${error.message}`);
  }
}

/**
 * Helper function to decode MIME-encoded headers or strings
 */
export function decodeMimeEncodedWord(encodedWord: string): string {
  const mimeEncodedWordRegex = /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g;
  return encodedWord.replace(mimeEncodedWordRegex, (match, charset, encoding, text) => {
    if (encoding.toUpperCase() === 'B') {
      // Base64 decoding using atob()
      try {
        return new TextDecoder(charset).decode(Uint8Array.from(atob(text), c => c.charCodeAt(0)));
      } catch {
        return text; // Fallback to raw text if decoding fails
      }
    } else if (encoding.toUpperCase() === 'Q') {
      // Quoted-printable decoding
      return text
        .replace(/_/g, ' ')
        .replace(/=([A-Fa-f0-9]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    }
    return text; // Return as-is if the encoding type is unknown
  });
}

/**
 * Helper function to extract email addresses
 */
export function extractEmailAddress(emailAddress: string): string | null {
  try {
    const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/;
    const match = emailAddress.match(emailRegex);
    return match ? match[1] : null;
  } catch (error) {
    return emailAddress;
  }
}

/**
 * Helper function to strip multiple prefixes like "Re:", "Fwd:" and decode MIME subjects
 */
export function stripEmailPrefixes(subject: string): string {
  const decodedSubject = decodeMimeEncodedWord(subject);
  return decodedSubject.replace(/^((Re|Fw|RE|FW|Fwd|FWD)[:\s]*)+/i, '').trim();
}