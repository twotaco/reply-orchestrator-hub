import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

console.log('Rerun Email Interaction function booting up...');

// Helper function to create Supabase client with user's auth context
const createSupabaseUserClient = (req: Request): SupabaseClient => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    throw new Error('Missing Authorization header');
  }
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } }
  );
};

// Helper function to create Supabase admin client
const createSupabaseAdminClient = (): SupabaseClient => {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { interactionId } = await req.json();
    if (!interactionId) {
      return new Response(JSON.stringify({ error: 'interactionId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUserClient = createSupabaseUserClient(req);
    const { data: { user }, error: userError } = await supabaseUserClient.auth.getUser();

    if (userError || !user) {
      console.error('User authentication error:', userError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdminClient = createSupabaseAdminClient();

    // 1. Retrieve the email_interaction record
    const { data: interaction, error: interactionError } = await supabaseAdminClient
      .from('email_interactions')
      .select('*') // Select all to get postmark_request and user_id
      .eq('id', interactionId)
      .single();

    if (interactionError) {
      console.error('Error fetching email_interaction:', interactionError);
      if (interactionError.code === 'PGRST116') { // Not found
        return new Response(JSON.stringify({ error: 'Email interaction not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: 'Failed to fetch email interaction' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Authorize: Check if the interaction belongs to the authenticated user
    if (interaction.user_id !== user.id) {
      console.warn(`User ${user.id} attempt to access interaction ${interactionId} owned by ${interaction.user_id}`);
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Fetch workspace_configs for webhook_api_key
    const { data: workspaceConfig, error: configError } = await supabaseAdminClient
      .from('workspace_configs')
      .select('webhook_api_key')
      .eq('user_id', user.id)
      .single();

    if (configError || !workspaceConfig || !workspaceConfig.webhook_api_key) {
      console.error('Error fetching workspace_config or webhook_api_key missing:', configError);
      return new Response(JSON.stringify({ error: 'Webhook configuration error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { webhook_api_key } = workspaceConfig;

    // 4. Update email_interaction status to 'failed'
    const { error: updateError } = await supabaseAdminClient
      .from('email_interactions')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', interactionId);

    if (updateError) {
      console.error('Error updating email_interaction status:', updateError);
      return new Response(JSON.stringify({ error: 'Failed to update interaction status' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 5. Extract original postmark_request
    const postmarkRequestPayload = interaction.postmark_request;
    if (!postmarkRequestPayload) {
        console.error(`postmark_request is missing for interactionId: ${interactionId}`);
        return new Response(JSON.stringify({ error: 'Original request payload missing from interaction' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    // 6. Construct Postmark webhook URL
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    if (!supabaseUrl) {
        console.error('SUPABASE_URL environment variable is not set.');
        return new Response(JSON.stringify({ error: 'Server configuration error: SUPABASE_URL missing' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
    const targetWebhookUrl = `${supabaseUrl}/functions/v1/postmark-webhook/${webhook_api_key}`;

    // 7. Make HTTP POST request to the webhook
    console.log(`Attempting to POST to webhook: ${targetWebhookUrl}`);
    const webhookResponse = await fetch(targetWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Potentially add other headers if your webhook expects them, e.g., an auth token for the webhook itself
      },
      body: JSON.stringify(postmarkRequestPayload),
    });

    if (!webhookResponse.ok) {
      const errorBody = await webhookResponse.text();
      console.error(`Webhook call failed with status ${webhookResponse.status}: ${errorBody}`);
      return new Response(JSON.stringify({ error: 'Failed to trigger Postmark webhook', details: errorBody }), {
        status: 500, // Or webhookResponse.status if you want to pass it through
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const responseData = await webhookResponse.json();
    console.log('Webhook call successful:', responseData);

    return new Response(JSON.stringify({ message: 'Email interaction rerun successfully', webhook_response: responseData }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (e) {
    console.error('Unexpected error in rerun-email-interaction:', e);
    let message = 'Internal Server Error';
    if (e instanceof Error) {
        message = e.message;
    }
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
