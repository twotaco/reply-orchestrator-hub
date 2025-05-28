
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

    console.log('🔍 Testing Postmark API connection...')
    
    // Test the Postmark API by getting servers list
    const response = await fetch('https://api.postmarkapp.com/servers', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Postmark-Account-Token': apiToken
      }
    })

    console.log('📡 Postmark API response status:', response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ Postmark API error:', errorText)
      throw new Error(`Postmark API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    console.log('✅ Postmark API connection successful, servers count:', data.TotalCount)

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Connection successful',
      serversCount: data.TotalCount 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    })

  } catch (error) {
    console.error('💥 Error testing Postmark connection:', error)
    return new Response(JSON.stringify({ 
      error: error.message || 'Failed to test connection' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    })
  }
})
