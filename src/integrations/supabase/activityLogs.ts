import { SupabaseClient } from '@supabase/supabase-js';

interface EmailInteraction {
  id: string;
  created_at: string;
  from_email: string;
  subject: string;
  status: string;
}

interface EmailInteractionDetails extends EmailInteraction {
  postmark_request?: any;
  mcp_plan?: any;
  mcp_results?: any;
  knowreply_response?: any;
}

interface FetchEmailInteractionsParams {
  userId: string;
  page: number;
  pageSize: number;
  startDate?: string;
  endDate?: string;
}

interface FetchEmailInteractionsResponse {
  data: EmailInteraction[];
  count: number;
}

interface FetchEmailInteractionDetailsParams {
  userId: string;
  interactionId: string;
}

/**
 * Fetches a paginated list of email_interactions records.
 */
export const fetchEmailInteractions = async (
  supabase: SupabaseClient,
  { userId, page, pageSize, startDate, endDate }: FetchEmailInteractionsParams
): Promise<FetchEmailInteractionsResponse> => {
  try {
    const from = (page - 1) * pageSize;
    const to = page * pageSize - 1;

    let query = supabase
      .from('email_interactions')
      .select('id, created_at, from_email, subject, status', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (startDate) {
      query = query.gte('created_at', startDate);
    }
    if (endDate) {
      query = query.lte('created_at', endDate);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('Error fetching email interactions:', error);
      throw error;
    }

    return { data: data || [], count: count || 0 };
  } catch (error) {
    console.error('An unexpected error occurred in fetchEmailInteractions:', error);
    // Depending on how you want to handle errors, you might re-throw,
    // or return a specific error object.
    // For now, returning an empty state with count 0.
    return { data: [], count: 0 };
  }
};

/**
 * Fetches full details for a single email_interaction record by its id.
 */
export const fetchEmailInteractionDetails = async (
  supabase: SupabaseClient,
  { userId, interactionId }: FetchEmailInteractionDetailsParams
): Promise<EmailInteractionDetails | null> => {
  try {
    const { data, error } = await supabase
      .from('email_interactions')
      .select(
        'id, created_at, from_email, subject, status, postmark_request, mcp_plan, mcp_results, knowreply_response'
      )
      .eq('user_id', userId)
      .eq('id', interactionId)
      .single();

    if (error) {
      console.error('Error fetching email interaction details:', error);
      if (error.code === 'PGRST116') { // PostgREST error code for "Not Found"
        return null;
      }
      throw error;
    }

    return data as EmailInteractionDetails | null;
  } catch (error) {
    console.error('An unexpected error occurred in fetchEmailInteractionDetails:', error);
    // Similar to the above, decide on error handling strategy.
    // Returning null for now.
    return null;
  }
};
