import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface AgentEmailMapping {
  agent_id: string;
}

/**
 * Fetches unique agent IDs associated with a list of email addresses for a specific user.
 * @param supabase The Supabase client instance.
 * @param userId The ID of the user.
 * @param emailAddresses An array of email addresses (should be lowercase).
 * @returns A Promise that resolves to an array of unique agent IDs.
 * @throws Throws an error if the query fails.
 */
export async function getAgentIdsByEmails(
  supabase: SupabaseClient,
  userId: string,
  emailAddresses: string[]
): Promise<string[]> {
  if (!userId || emailAddresses.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('agent_email_mappings')
    .select('agent_id')
    .eq('user_id', userId)
    .in('email_address', emailAddresses);

  if (error) {
    console.error('Error fetching agent IDs by email:', error);
    throw new Error(`Failed to fetch agent email mappings: ${error.message}`);
  }

  if (!data) {
    return [];
  }

  const uniqueAgentIds = [...new Set(data.map((mapping: AgentEmailMapping) => mapping.agent_id))];
  return uniqueAgentIds;
}
