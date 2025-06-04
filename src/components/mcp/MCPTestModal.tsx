import React, { useState, useEffect } from 'react';
import type { User } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { MCPEndpoint } from './types';
import { categoryMapUtil } from './utils'; // Needed for DialogDescription

interface MCPTestModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  endpointToTest: MCPEndpoint | null;
  user: User | null;
}

export function MCPTestModal({ isOpen, onOpenChange, endpointToTest, user }: MCPTestModalProps) {
  const [currentTestPayload, setCurrentTestPayload] = useState<string>('');
  const [testResponse, setTestResponse] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState<boolean>(false);

  useEffect(() => {
    if (endpointToTest) {
      setCurrentTestPayload(JSON.stringify(endpointToTest.expected_format || {}, null, 2));
      setTestResponse(null); // Clear previous response when endpoint changes
    }
  }, [endpointToTest]);

  const handleTest = async () => {
    if (!endpointToTest || !user) {
      toast({ title: "Test Error", description: "Endpoint or user not available.", variant: "destructive" });
      return;
    }

    setIsTesting(true);
    setTestResponse(null);

    if (!endpointToTest.mcp_server_base_url || !endpointToTest.provider_name || !endpointToTest.action_name) {
      const errorMsg = "Endpoint configuration is incomplete (missing URL, provider, or action).";
      toast({ title: "Test Error", description: errorMsg, variant: "destructive" });
      setTestResponse(errorMsg);
      setIsTesting(false);
      return;
    }

    const mcpServerInternalApiKey = import.meta.env.VITE_MCP_SERVER_INTERNAL_API_KEY;
    if (!mcpServerInternalApiKey) {
      toast({
        title: "Test Error",
        description: "MCP Server Internal API Key is not configured. Please set VITE_MCP_SERVER_INTERNAL_API_KEY.",
        variant: "destructive",
      });
      setIsTesting(false);
      return;
    }

    let payloadForArgs: any;
    try {
      payloadForArgs = JSON.parse(currentTestPayload);
    } catch (e: any) {
      const errorMessage = `Invalid JSON format in payload: ${e.message}`;
      toast({
        title: "Test Error",
        description: errorMessage,
        variant: "destructive",
        duration: 10000
      });
      setTestResponse(errorMessage);
      setIsTesting(false);
      return;
    }

    try {
      const providerNameForTest = endpointToTest.provider_name;
      const { data: connParamsRecord, error: connParamsError } = await supabase
        .from('mcp_connection_params')
        .select('connection_values')
        .eq('user_id', user.id)
        .eq('provider_name', providerNameForTest)
        .single();

      if (connParamsError || !connParamsRecord || !connParamsRecord.connection_values || Object.keys(connParamsRecord.connection_values).length === 0) {
        let errorMsg = `Connection parameters not configured for provider: ${providerNameForTest}.`;
        if(connParamsError && connParamsError.code !== 'PGRST116'){
          console.error("Error fetching connection params for test:", connParamsError);
          errorMsg = `Error fetching connection parameters: ${connParamsError.message}`;
        }
        toast({ title: "Test Error", description: errorMsg, variant: "destructive" });
        setTestResponse(errorMsg);
        setIsTesting(false);
        return;
      }

      const testUrl = `${endpointToTest.mcp_server_base_url}/mcp/${providerNameForTest}/${endpointToTest.action_name}`;
      const newTestPayload = {
        args: payloadForArgs,
        auth: connParamsRecord.connection_values
      };

      const headers: any = {
        'Content-Type': 'application/json',
        'x-internal-api-key': mcpServerInternalApiKey,
      };

      const response = await fetch(testUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(newTestPayload),
      });

      const responseText = await response.text();
      let responseData: any = responseText;
      try {
          if (response.headers.get("content-type")?.includes("application/json")) {
              responseData = JSON.parse(responseText);
          }
      } catch (e) {
          // console.warn("Response was not valid JSON, using raw text.");
      }

      const formattedResponseForState = typeof responseData === 'string'
                                       ? responseData
                                       : JSON.stringify(responseData, null, 2);
      setTestResponse(formattedResponseForState);

      toast({
        title: response.ok ? "Test Successful" : "Test Failed",
        description: `Status: ${response.status} - ${response.statusText}. Full response in modal.`,
        variant: response.ok ? "default" : "destructive",
        duration: response.ok ? 5000 : 10000
      });

    } catch (error: any) {
      console.error('Error testing endpoint:', error);
      const errorMessage = `Network error or other issue: ${error.message}`;
      setTestResponse(errorMessage);
      toast({
        title: "Test Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsTesting(false);
    }
  };

  if (!endpointToTest) return null; // Don't render if no endpoint is selected

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>
            Test Action: {endpointToTest.action_display_name || endpointToTest.name}
          </DialogTitle>
          <DialogDescription>
            Modify the JSON payload below to test with different inputs.
            The 'args' will be taken from this payload. Connection parameters for {categoryMapUtil[endpointToTest.provider_name?.toLowerCase() || 'custom'] || endpointToTest.provider_name} will be used.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <Label htmlFor="test-payload-textarea">Payload for "args" (JSON format)</Label>
          <Textarea
            id="test-payload-textarea"
            value={currentTestPayload}
            onChange={(e) => setCurrentTestPayload(e.target.value)}
            placeholder='Enter JSON payload for "args"'
            className="h-40 font-mono text-xs"
          />
        </div>
        {testResponse !== null && (
          <div className="mt-4">
            <Label htmlFor="test-response-area">Test Response</Label>
            <pre
              id="test-response-area"
              className="mt-1 p-2 text-xs bg-gray-100 rounded-md h-40 border whitespace-pre-wrap break-words overflow-y-auto"
            >
              {testResponse}
            </pre>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => { onOpenChange(false); setTestResponse(null); } }>
            Cancel
          </Button>
          <Button
            onClick={handleTest}
            disabled={isTesting}
          >
            {isTesting ? 'Testing...' : 'Run Test'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
