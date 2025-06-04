import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// PostmarkWebhookPayload is used in handlerUtils, KnowReplyAgentConfig is not directly used here.
// import type { PostmarkWebhookPayload, KnowReplyAgentConfig } from './types.ts';
// generateMCPToolPlan and executeMCPPlan are not directly used here.
// import { generateMCPToolPlan } from './llmPlanner.ts';
// import { executeMCPPlan } from './mcpExecutor.ts';
import { processEmailWithKnowReply } from './agentManager.ts';
import { handlePostmarkRequest, corsHeaders } from './handlerUtils.ts';

// MCP_SERVER_BASE_URL is now in mcpExecutor.ts
// corsHeaders is now in handlerUtils.ts

serve(async (req: Request) => {
  console.log('🚀 Postmark webhook function called!');
  console.log('📝 Request method:', req.method);

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('✅ Handling CORS preflight request');
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    // Pass processEmailWithKnowReply to handlePostmarkRequest
    return await handlePostmarkRequest(req, supabase, processEmailWithKnowReply);
  } catch (e) {
    // Fallback error handling, though handlePostmarkRequest should catch its own errors.
    console.error('💥 Top-level error in serve:', e);
    return new Response(JSON.stringify({ status: 'error', message: 'Critical internal server error', errors: [(e as Error).message] }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Removed duplicate if (import.meta.main) block and its serve function.
