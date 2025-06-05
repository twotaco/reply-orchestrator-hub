
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  console.log('🚀 Test Postmark connection function called!')
  console.log('📝 Request method:', req.method)

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('✅ Handling CORS preflight request')
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    console.log('❌ Method not allowed:', req.method)
    return new Response('Method not allowed', { 
      status: 405, 
      headers: corsHeaders 
    })
  }

  try {
    console.log('📨 Parsing request body...')
    const { apiToken } = await req.json()

    if (!apiToken) {
      console.log('❌ Missing API token')
      return new Response(JSON.stringify({ error: 'API token is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      })
    }

    console.log('🔍 Testing Postmark Server API token connection...')
    
    // Test the Postmark Server API by getting current server details
    const response = await fetch('https://api.postmarkapp.com/server', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Postmark-Server-Token': apiToken // Changed header key
      }
    })

    console.log('📡 Postmark API response status:', response.status)
    const responseBody = await response.text(); // Read body once

    if (!response.ok) {
      let postmarkErrorData = null;
      try {
        postmarkErrorData = JSON.parse(responseBody);
        console.error('❌ Postmark API error response:', postmarkErrorData);
      } catch (e) {
        console.error('❌ Postmark API error response (not JSON):', responseBody);
      }
      // Throw an error that will be caught by the catch block below
      // This simplifies error response handling to one place
      const errorMessage = postmarkErrorData?.Message
        ? `Postmark API error: ${postmarkErrorData.Message} (Code: ${postmarkErrorData.ErrorCode || 'N/A'})`
        : `Postmark API error: ${response.status} - ${responseBody}`;
      throw new Error(errorMessage);
    }

    const data = JSON.parse(responseBody); // Parse successful response
    console.log(`✅ Postmark Server API connection successful. Server Name: ${data.Name}, ID: ${data.ID}`);

    return new Response(JSON.stringify({ 
      success: true, 
      message: `Connection successful. Server Name: ${data.Name}`,
      serverName: data.Name,
      serverId: data.ID,
      // serversCount: undefined // Removing this, as it's not relevant for /server endpoint
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    })

  } catch (error) {
    console.error('💥 Error testing Postmark connection:', error.message); // Log only message for cleaner logs
    // Extract details if it's a structured error from Postmark (parsed in the try block)
    const errorDetails = error.message.startsWith('Postmark API error:')
      ? error.message
      : 'Failed to test connection due to an unexpected error.';

    return new Response(JSON.stringify({ 
      error: errorDetails,
      // Optionally, you could add more structured details if the error object has them
      // For example, if you added a 'details' property to the thrown error.
    }), {
      // Determine status code based on error type if possible, otherwise 500
      status: error.message.includes("Invalid API token") || error.message.includes("401") ? 401 : 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    })
  }
})
