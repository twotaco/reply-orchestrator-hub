import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { v4 as uuidv4 } from 'https://deno.land/std@0.83.0/uuid/mod.ts'; // For generating UUIDs

const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // Adjust as needed for production
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function generateAndStoreWebhookApiKey(supabase: SupabaseClient, userId: string): Promise<string> {
  let newApiKey = '';
  let attempts = 0;
  const maxAttempts = 5; // Max attempts to find a unique key

  while (attempts < maxAttempts) {
    newApiKey = uuidv4.generate(); // Generate a v4 UUID

    // Check if this key already exists (highly unlikely, but good practice)
    const { data: existing, error: checkError } = await supabase
      .from('workspace_configs')
      .select('user_id')
      .eq('webhook_api_key', newApiKey)
      .maybeSingle(); // Use maybeSingle to avoid error if not found

    if (checkError) {
      console.error('Error checking for existing API key:', checkError);
      throw new Error('Database error while checking API key uniqueness.');
    }

    if (!existing) {
      // Key is unique, proceed to update
      break;
    }

    attempts++;
    if (attempts >= maxAttempts) {
      throw new Error('Failed to generate a unique API key after multiple attempts.');
    }
    console.warn(`API key collision detected (attempt ${attempts}), generating a new one.`);
  }

  // Update the workspace_configs for the user
  const { error: updateError } = await supabase
    .from('workspace_configs')
    .update({ webhook_api_key: newApiKey, updated_at: new Date().toISOString() })
    .eq('user_id', userId);

  if (updateError) {
    console.error('Error updating webhook_api_key:', updateError);
    // Check if the row exists, if not, insert it.
    if (updateError.code === 'PGRST116' || updateError.details?.includes?.('0 rows')) { // PGRST116: "Not found"
        console.log(`No existing workspace_config for user ${userId}, inserting new one.`);
        const { error: insertError } = await supabase
            .from('workspace_configs')
            .insert({ user_id: userId, webhook_api_key: newApiKey, updated_at: new Date().toISOString() });
        if (insertError) {
            console.error('Error inserting new workspace_config with webhook_api_key:', insertError);
            throw new Error('Failed to store new webhook API key after insert attempt.');
        }
    } else {
        throw new Error('Failed to store new webhook API key.');
    }
  }

  return newApiKey;
}

serve(async (req: Request) => {
  console.log('🚀 manage-webhook-key function called');

  if (req.method === 'OPTIONS') {
    console.log('✅ Handling CORS preflight request for manage-webhook-key');
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create Supabase client with auth context
    const userSupabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '', // Use anon key, user context comes from Authorization header
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    // Get user from JWT
    const { data: { user }, error: userError } = await userSupabaseClient.auth.getUser();
    if (userError || !user) {
      console.error('🚫 User not authenticated:', userError?.message);
      return new Response(JSON.stringify({ error: 'User not authenticated' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    console.log('👤 Authenticated user:', user.id);

    const newApiKey = await generateAndStoreWebhookApiKey(userSupabaseClient, user.id);

    console.log(`✅ Successfully generated and stored new webhook API key for user ${user.id}`);
    return new Response(JSON.stringify({ webhook_api_key: newApiKey }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (e) {
    console.error('💥 Top-level error in manage-webhook-key:', e);
    return new Response(JSON.stringify({ error: e.message || 'Internal server error' }), {
      status: (e.message === 'User not authenticated' || e.message.includes('uniqueness') || e.message.includes('Failed to store')) ? 400 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
