import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Fetches all email_account_id's (which are agent_email_mappings.id) associated with a given user.
 * These IDs can then be used to filter inq_emails.email_account_id.
 *
 * @param userId The ID of the user.
 * @param supabaseClient The Supabase client instance.
 * @returns A promise that resolves to an array of email_account_id strings, or null if an error occurs or no IDs are found.
 */
export async function fetchUserEmailAccountIds(
  userId: string,
  supabaseClient: SupabaseClient
): Promise<string[] | null> {
  if (!userId) {
    console.warn('fetchUserEmailAccountIds called without a userId.');
    return null;
  }

  try {
    const { data, error } = await supabaseClient
      .from('agent_email_mappings')
      .select('id') // This 'id' is the email_account_id for inq_emails
      .eq('user_id', userId);

    if (error) {
      console.error('Error fetching user email account IDs:', error);
      return null;
    }

    if (!data) {
        console.warn(`No agent_email_mappings found for user_id: ${userId}`);
        return []; // Return empty array if no mappings found
    }

    return data.map(mapping => mapping.id);
  } catch (e) {
    console.error('Unexpected error in fetchUserEmailAccountIds:', e);
    return null;
  }
}
