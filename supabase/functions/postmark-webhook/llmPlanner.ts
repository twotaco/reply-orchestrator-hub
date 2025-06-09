// llmPlanner.ts for postmark-webhook function
import type { KnowReplyAgentConfig } from './types.ts';
import { generateExamplePayloadFromSchema } from './utils.ts'; 
// Deno object is globally available in Deno runtime
// SupabaseClient type is not strictly needed as supabaseClient is 'any'

export async function generateMCPToolPlan(
  emailBody: string,
  senderEmail: string, // New parameter
  senderName: string,   // New parameter
  availableMcps: KnowReplyAgentConfig['mcp_endpoints'],
  geminiApiKey: string,
  supabaseClient: any, // Keeping as 'any' as per current signature in index.ts
  userId: string | null,
  emailInteractionId: string | null
): Promise<object[] | null> {
  const envModel = Deno.env.get('GEMINI_MODEL');
  const modelName = (envModel && envModel.trim() !== '') ? envModel.trim() : 'gemini-1.5-pro';
  console.log(`🤖 Generating MCP Tool Plan using Google Gemini model: ${modelName}...`);

  if (!emailBody || emailBody.trim() === '') {
    console.warn('✉️ Email body is empty. Skipping MCP plan generation.');
    return [];
  }

  if (!availableMcps || availableMcps.length === 0) {
    console.log('🛠️ No available MCPs for planning. Returning empty plan.');
    return [];
  }

  // Construct the prompt for Gemini
  const geminiPrompt = `You are an intent and action planner. Based on the email sender information and customer email content below, determine which external tools (MCPs) are needed to help answer or fulfill the request.

Email Sender Information:
---
Sender Name: ${senderName}
Sender Email: ${senderEmail}
---

Customer Email Content:
---
${emailBody.substring(0, 8000)}
---

Available Tools:
---
${JSON.stringify(
  availableMcps.map(mcp => {
    let argsSchemaKeys: string[] = [];
    let example: any = null;
    try {
      example = generateExamplePayloadFromSchema(mcp.expected_format);
      if (example && typeof example === 'object' && !Array.isArray(example)) {
        argsSchemaKeys = Object.keys(example);
      }
      console.log(`🛠️ Generated example for tool ${mcp.name}:`, example,` ; `, argsSchemaKeys);
    } catch (err) {
      console.warn(`⚠️ Failed to generate example for tool ${mcp.name}:`, err);
    }
    return {
      name: mcp.name,
      description: mcp.instructions || 'No specific instructions provided.',
      args_schema_keys: argsSchemaKeys,
      args_schema_example: example,
      output_schema: mcp.output_schema || null, // Include output_schema
    };
  }),
  null,
  2
)}
---

Planning Sequences and Using Outputs:
If the user's request requires multiple actions, you can plan a sequence of tool calls.
To use an output from a previous step (e.g., 'steps[0]', 'steps[1]') as an argument for a subsequent step, use the placeholder syntax: '{{steps[INDEX].outputs.FIELD_NAME}}'.
- 'INDEX' is the 0-based index of the step in the plan array whose output you want to use.
- 'FIELD_NAME' is the specific field name from that step's 'output_schema'. This field name must exactly match a key present in the 'output_schema' of the tool at 'steps[INDEX]'.
The 'output_schema' provided for each tool in the "Available Tools" list shows what 'FIELD_NAME's it will return.

IMPORTANT: When constructing the "args" object for any tool:
- Only include arguments that are listed in the tool's 'args_schema_keys' for which you have a value.
- You must use the exact argument names listed in its args_schema_keys.
- You must not invent, rename, or assume alternative argument names like order_id when the schema says orderId.
- When referencing previous outputs, map the exact args_schema_keys name to a compatible field in a previous step's output_schema, even if they differ (e.g., orderId ← steps[0].outputs.id).
- Do not rename keys. Do not use snake_case instead of camelCase. Do not change anything about the argument name.

When referencing data from previous MCP calls, use the exact JSON path that matches the output structure and retain the square brackets for arrays and dot notation for objects:
- If the response is an object with a field like 'orders: Order[]', use: 'steps[0].outputs.orders[0].id'
- If the response is a plain array, use: 'steps[0].outputs[0].id'

Important Instructions for Using Sender Information:
- When planning actions, especially the first action in a sequence or any action that requires identifying the customer (e.g., fetching orders, customer details), you **must** consider using the details from the 'Email Sender Information' section (like 'Sender Email' or 'Sender Name') as arguments if the tool accepts them. For example, if a tool like 'getOrders' or 'getCustomerDetails' accepts an 'email' argument, use the 'Sender Email' provided.
- Even if a tool argument (like 'email' or 'customerId') is marked as optional (e.g., in 'args_schema_keys' or its description implies it's optional), if the 'Email Sender Information' provides relevant data for that argument, you **should** include it in the plan to ensure the action is specific and effective.
- Do not leave critical identifying arguments (like 'email' for a customer-specific lookup) as null or unprovided if the sender's information is available and directly applicable to fulfilling the user's request based on the email content.

Output format constraints:
Respond ONLY with a valid JSON array. Do not add any other text before or after the array.
If no tools are needed, or if the email content does not require any actionable steps, please return an empty array [].
Only use tools from the 'Available Tools' list. Ensure the tool name in your output matches exactly a name from the 'Available Tools' list.

Your entire response must be only the JSON array.
JSON schema:
[
  {
    "tool": "string", // The exact name of the tool from the 'Available Tools' list
    "args": { // The arguments object for the tool, using exact keys from args_schema_keys
      "argName1": "value1", // Use exact argument names as per args_schema_keys
      "argName2": "value2" // Use exact argument names as per args_schema_keys
    },
    "reasoning": "string" // A brief explanation of why this tool is needed and what you want to accomplish by calling it
  }
  // Additional steps can be added in the same format
  // If no tools are needed, return an empty array []
] 

Example of a multi-step plan using tool outputs as input values for subsequent steps:
[
  {
    "tool": "user.getCustomerByEmail",
    "args": { "email": "customer@example.com" },
    "reasoning": "To identify the customer based on the email sender information."
  },
  {
    "tool": "orders.getOrders",
    "args": { "customerId": "{{steps[0].outputs.id}}" },
    "reasoning": "To fetch the latest order for the identified customer."
  },
  {
    "tool": "shipping.getTrackingInfo",
    "args": { "orderId": "{{steps[1].outputs.id}}" },
    "reasoning": "To retrieve the tracking information for the latest order so the support staff can identify where the package is and reply accordingly."
  }
]

`;

  console.log('📝 Constructed Prompt for Gemini:', geminiPrompt);

  // Gemini API expects contents.parts.text format
  const requestPayloadForGemini = {
    contents: [{
      parts: [{
        text: geminiPrompt
      }]
    }],
    generationConfig: {
      response_mime_type: "application/json", // Request JSON output directly
      temperature: 0.2, // Lower temperature for more deterministic JSON
      // maxOutputTokens: 2048, // Optional: adjust as needed
    }
  };

  let llmApiResponse: any = null;
  let parsedPlan: object[] | null = null;
  let llmError: Error | null = null;

  try {
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiApiKey}`;
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestPayloadForGemini),
    });

    llmApiResponse = await response.json(); // Store the full API response

    if (!response.ok) {
      const errorDetail = llmApiResponse?.error?.message || JSON.stringify(llmApiResponse);
      console.error(`❌ Gemini API error: ${response.status} - ${response.statusText}`, errorDetail);
      llmError = new Error(`Gemini API error: ${response.status} - ${errorDetail}`);
    } else {
      console.log('✅ Gemini API call successful.');
      const candidate = llmApiResponse?.candidates?.[0];
      if (!candidate) {
        llmError = new Error('No candidates found in Gemini response.');
        console.warn(`⚠️ ${llmError.message}`, llmApiResponse);
      } else if (candidate.finishReason !== 'STOP' && candidate.finishReason !== 'MAX_TOKENS') {
        // MAX_TOKENS can sometimes be acceptable if JSON is complete
        llmError = new Error(`Gemini generation finished with reason: ${candidate.finishReason}`);
        console.warn(`⚠️ ${llmError.message}`, llmApiResponse);
         if (candidate.finishReason === "SAFETY") {
          console.error("❌ Gemini response blocked due to safety settings. Response details:", candidate.safetyRatings);
          llmError = new Error(`Gemini response blocked due to safety settings: ${JSON.stringify(candidate.safetyRatings)}`);
        }
      } else {
        const messageContent = candidate.content?.parts?.[0]?.text;
        if (!messageContent) {
          llmError = new Error('No text content in Gemini response candidate part.');
          console.warn(`⚠️ ${llmError.message}`, llmApiResponse);
        } else {
          console.log('🛠️ Attempting to parse LLM response from Gemini:', messageContent);
          try {
            // Gemini with response_mime_type: "application/json" should return valid JSON directly.
            // However, the actual *content* of that JSON (the plan) needs to be an array as per prompt.
            const jsonFromTheLLM = JSON.parse(messageContent);

            // Check if the parsed JSON is itself the array (our desired plan format)
            if (Array.isArray(jsonFromTheLLM)) {
                parsedPlan = jsonFromTheLLM;
            }
            // Or if the LLM wrapped it, e.g. { "plan": [...] } (less likely with strong prompting for direct array)
            else if (jsonFromTheLLM && Array.isArray((jsonFromTheLLM as any).plan)) {
                console.warn("⚠️ Gemini returned JSON object with a 'plan' key instead of direct array. Adapting.");
                parsedPlan = (jsonFromTheLLM as any).plan;
            }
            else {
              llmError = new Error('LLM response JSON is not an array or a {plan: []} object.');
              console.warn(`⚠️ ${llmError.message}`, jsonFromTheLLM);
              parsedPlan = []; // Default to empty if structure is unexpected but valid JSON
            }
          } catch (e: any) {
            console.error('❌ Error parsing JSON from Gemini response:', e.message);
            console.error('Raw response content that failed parsing:', messageContent);
            llmError = e as Error;
          }
        }
      }
    }

    if (!llmError && !Array.isArray(parsedPlan)) {
      console.warn('⚠️ Parsed plan is not an array:', parsedPlan);
      llmError = new Error('Parsed plan is not an array.');
      parsedPlan = null; // Ensure it's null if not a valid array
    }

    // Further validation: check if tool names in the plan are valid
    const validToolNames = new Set(availableMcps.map(mcp => mcp.name));
    if (!llmError && parsedPlan) {
      parsedPlan = parsedPlan.filter((step: any) => {
        if (step && typeof step.tool === 'string' && validToolNames.has(step.tool)) {
          return true;
        }
        console.warn(`⚠️ Invalid or unknown tool in plan from Gemini: '${step?.tool || "N/A"}'. It will be filtered out.`);
        return false;
      });
      console.log('✅ MCP Tool Plan from Gemini generated and validated:', parsedPlan);
    } else if (!llmError && !parsedPlan) {
        console.warn("⚠️ Parsed plan is null or empty after Gemini call, despite no direct API or parsing error. This might indicate the LLM did not follow content instructions.");
        if (!parsedPlan) parsedPlan = [];
    }

  } catch (error: any) {
    console.error('❌ Exception during Gemini API call or initial response processing:', error.message);
    llmError = error as Error;
    if (!llmApiResponse) llmApiResponse = { error: { message: error.message } };
    parsedPlan = null;
  }

  // Log LLM interaction to Supabase
  const logData = {
    user_id: userId,
    email_interaction_id: emailInteractionId,
    prompt_messages: requestPayloadForGemini.contents,
    llm_response: llmApiResponse,
    tool_plan_generated: parsedPlan,
    model_used: modelName,
    error_message: llmError ? llmError.message : null,
  };

  try {
    const { error: logError } = await supabaseClient.from('llm_logs').insert([logData]);
    if (logError) {
      console.error('Failed to log LLM (Gemini) interaction to llm_logs:', logError.message);
    } else {
      console.log('📝 LLM interaction logged successfully to llm_logs.');
    }
  } catch (e: any) {
    console.error('Exception during LLM log insertion to Supabase:', e.message);
  }

  if (llmError) {
    return null;
  }
  return parsedPlan;
}
