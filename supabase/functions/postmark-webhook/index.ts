import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { processEmailWithKnowReply } from './agentManager.ts';
import { handlePostmarkRequest, corsHeaders } from './handlerUtils.ts';
import type { PostmarkWebhookPayload, WorkspaceConfigWithUser } from './types.ts';

// Define a simple router or URL pattern matching
// Not using REGEX from prompt directly, simple split is fine for this structure.
// const WEBHOOK_PATH_REGEX = /^\/functions\/v1\/postmark-webhook\/([a-zA-Z0-9-]+)$/;

serve(async (req: Request) => {
  console.log('🚀 Postmark webhook function called!');
  console.log('📝 Request method:', req.method);
  console.log('🔗 Request URL:', req.url);

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('✅ Handling CORS preflight request');
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/');
  // Expected URL structure: /functions/v1/postmark-webhook/<customer_api_key>
  // Split parts: ["", "functions", "v1", "postmark-webhook", "<customer_api_key>"]
  const customerApiKey = pathParts.length === 5 && pathParts[3] === 'postmark-webhook' ? pathParts[4] : null;

  if (!customerApiKey) {
    console.error('❌ Invalid URL path or API key missing:', url.pathname);
    return new Response(JSON.stringify({ status: 'error', message: 'Invalid webhook URL format or API key missing.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  console.log('🔑 Extracted Customer API Key:', customerApiKey);

  try {
    const supabaseAdminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '' // Use Service Role Key for admin operations
    );

    // Authenticate user based on customerApiKey
    const { data: workspaceConfig, error: apiKeyError } = await supabaseAdminClient
      .from('workspace_configs')
      .select('*') // Select all necessary fields for later use
      .eq('webhook_api_key', customerApiKey)
      .single();

    if (apiKeyError || !workspaceConfig) {
      console.error('🚫 Authentication failed: API key not found or db error.', apiKeyError?.message);
      return new Response(JSON.stringify({ status: 'error', message: 'Authentication failed: Invalid API key.' }), {
        status: 401, // Unauthorized
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`✅ User authenticated: ${workspaceConfig.user_id} via API key.`);

    if (req.method !== 'POST') {
      console.log('❌ Method not allowed:', req.method);
      return new Response(JSON.stringify({ status: 'error', message: 'Method not allowed. Only POST is accepted.' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const payload: PostmarkWebhookPayload = await req.json();

    // Pass the authenticated workspaceConfig and parsed payload to handlePostmarkRequest
    // Ensure WorkspaceConfigWithUser type matches the structure of workspaceConfig selected by '*'
    return await handlePostmarkRequest(
      supabaseAdminClient, // Pass the admin client
      workspaceConfig as WorkspaceConfigWithUser, // Pass the fetched workspace config (includes user_id)
      payload,             // Pass the parsed payload
      processEmailWithKnowReply
    );

  } catch (e) {
    console.error('💥 Top-level error in serve (postmark-webhook/index.ts):', e);
    const errorMessage = e instanceof Error ? e.message : 'Critical internal server error';
    return new Response(JSON.stringify({ status: 'error', message: errorMessage, errors: [errorMessage] }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
