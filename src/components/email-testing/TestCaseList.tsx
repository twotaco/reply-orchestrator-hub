
import { useState, useEffect } from 'react'; // Added useEffect
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem, // To be removed
  AccordionTrigger, // To be removed
} from '@/components/ui/accordion'; // Accordion itself to be removed
import { Badge } from '@/components/ui/badge';
import { Play, Edit, Trash2, History, X, Loader2 } from 'lucide-react'; // Added History and Loader2
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { TestRunsList } from './TestRunsList';

interface TestCaseListProps {
  testCases: any[];
  onEdit: (testCase: any) => void;
  onRefresh: () => void;
}

export function TestCaseList({ testCases, onEdit, onRefresh }: TestCaseListProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedRunHistory, setExpandedRunHistory] = useState<Record<string, boolean>>({});
  const [webhookApiKey, setWebhookApiKey] = useState<string | null>(null);
  const [loadingApiKey, setLoadingApiKey] = useState<boolean>(true);

  const toggleRunHistory = (testCaseId: string) => {
    setExpandedRunHistory(prev => ({
      ...prev,
      [testCaseId]: !prev[testCaseId]
    }));
  };

  useEffect(() => {
    const fetchApiKey = async () => {
      if (!user?.id) {
        setLoadingApiKey(false);
        return;
      }
      setLoadingApiKey(true);
      try {
        const { data, error } = await supabase
          .from('workspace_configs')
          .select('webhook_api_key')
          .eq('user_id', user.id)
          .single();

        if (error && error.code !== 'PGRST116') {
          throw error;
        }

        if (data?.webhook_api_key) {
          setWebhookApiKey(data.webhook_api_key);
        } else {
          console.warn('Webhook API key not found for user. Email tests may not run correctly.');
          toast({
            title: "Webhook URL Not Configured",
            description: "Your unique webhook URL for email testing is not yet configured. Please visit Postmark Setup in KnowReply settings.",
            variant: "destructive",
            duration: 10000,
          });
        }
      } catch (error) {
        console.error('Error fetching webhook_api_key:', error);
        toast({
          title: 'Error Fetching Configuration',
          description: 'Could not fetch webhook configuration for email testing.',
          variant: 'destructive',
        });
      } finally {
        setLoadingApiKey(false);
      }
    };

    if (user?.id) { // Only fetch if user is available
      fetchApiKey();
    } else {
      setLoadingApiKey(false); // Not loading if no user
    }
  }, [user, toast]);

  const deleteMutation = useMutation({
    mutationFn: async (testCaseId: string) => {
      const { error } = await supabase
        .from('email_test_cases')
        .delete()
        .eq('id', testCaseId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Test case deleted successfully'
      });
      onRefresh();
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: `Failed to delete test case: ${error.message}`,
        variant: 'destructive'
      });
    }
  });

  const runTestMutation = useMutation({
    mutationFn: async (testCase: any) => {
      if (!webhookApiKey) {
        toast({
          title: 'Cannot Run Test',
          description: 'Webhook API key is missing. Please configure it in Postmark Setup (KnowReply settings).',
          variant: 'destructive',
        });
        throw new Error('Webhook API key is missing.');
      }
      const dynamicWebhookUrl = `https://hub.knowreply.email/postmark-webhook/${webhookApiKey}`;

      let parsedPayload;
      if (typeof testCase.incoming_json === 'string') {
        try {
          parsedPayload = JSON.parse(testCase.incoming_json);
        } catch (e) {
          console.error("Failed to parse testCase.incoming_json:", e);
          toast({ title: "Test Case Error", description: "Incoming JSON is not valid.", variant: "destructive" });
          throw new Error("Invalid incoming JSON in test case.");
        }
      } else if (typeof testCase.incoming_json === 'object' && testCase.incoming_json !== null) {
        // Assuming it's already an object, deep clone to avoid modifying original testCase object in state/cache
        // A simple stringify/parse is a common way for deep cloning plain JSON-compatible objects
        parsedPayload = JSON.parse(JSON.stringify(testCase.incoming_json));
      } else {
        console.error("testCase.incoming_json is not a string or a valid object:", testCase.incoming_json);
        toast({ title: "Test Case Error", description: "Incoming JSON is not in a recognizable format.", variant: "destructive" });
        throw new Error("Invalid format for incoming_json in test case.");
      }

      if (!parsedPayload.Headers || !Array.isArray(parsedPayload.Headers)) {
        parsedPayload.Headers = [];
      }

      // Remove existing X-KnowReply-Test header if present to avoid duplicates
      parsedPayload.Headers = parsedPayload.Headers.filter(
        (header: { Name: string; Value: string }) => header.Name && header.Name.toLowerCase() !== 'x-knowreply-test'
      );
      // Add the new header
      parsedPayload.Headers.push({ Name: "X-KnowReply-Test", Value: "true" });

      console.log("Injecting X-KnowReply-Test: true header for test run. Current Headers:", parsedPayload.Headers);
      const bodyPayload = JSON.stringify(parsedPayload);

      // Send the test data to the webhook
      const response = await fetch(dynamicWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: bodyPayload
      });

      const responseText = await response.text();
      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = responseText;
      }

      // Wait a moment for KnowReply processing to complete
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Fetch the KnowReply processing results from email_interactions
      let knowReplyResults = null;
      if (response.ok && testCase.incoming_json?.MessageID) {
        const { data: emailInteraction } = await supabase
          .from('email_interactions')
          .select('knowreply_response, knowreply_request, knowreply_agent_used, intent, status')
          .eq('message_id', testCase.incoming_json.MessageID)
          .eq('user_id', user?.id)
          .order('updated_at', { ascending: false })
          .limit(1)
          .single();

        if (emailInteraction) {
          knowReplyResults = emailInteraction;
        }
      }

      // Combine webhook response with KnowReply results
      const combinedResponseData = {
        webhook_response: responseData,
        knowreply_results: knowReplyResults
      };

      // Record the test run with combined results
      const { error } = await supabase
        .from('email_test_runs')
        .insert({
          user_id: user?.id,
          test_case_id: testCase.id,
          success: response.ok,
          response_data: combinedResponseData,
          error_message: response.ok ? null : `HTTP ${response.status}: ${responseText}`
        });

      if (error) throw error;

      return { success: response.ok, responseData: combinedResponseData, status: response.status };
    },
    onSuccess: (result, testCase) => {
      toast({
        title: result.success ? 'Test Passed' : 'Test Failed',
        description: result.success 
          ? 'Test case executed successfully' 
          : `Test failed with status ${result.status}`,
        variant: result.success ? 'default' : 'destructive'
      });
      onRefresh(); // Keep for now, might refresh other aspects of the test case list
      // Invalidate the query for the specific test case's runs
      queryClient.invalidateQueries({ queryKey: ['test-runs', testCase.id] });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: `Failed to run test: ${error.message}`,
        variant: 'destructive'
      });
    }
  });

  const handleDelete = async (testCaseId: string) => {
    if (confirm('Are you sure you want to delete this test case? This will also delete all test runs.')) {
      deleteMutation.mutate(testCaseId);
    }
  };

  if (testCases.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-8">
          <p className="text-gray-500">No test cases created yet. Create your first test case to get started.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Test Cases</CardTitle>
        <CardDescription>
          View your configured test cases. Click the history icon to see run history. Test results now include KnowReply processing outcomes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {testCases.map((testCase) => (
            <div key={testCase.id} className="border rounded-lg p-4">
              <div className="flex items-center justify-between w-full">
                <div className="text-left">
                  <h3 className="font-medium">{testCase.title}</h3>
                  {testCase.description && (
                    <p className="text-sm text-gray-600 mt-1">{testCase.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant={expandedRunHistory[testCase.id] ? "secondary" : "outline"}
                    onClick={() => toggleRunHistory(testCase.id)}
                    title="Show/Hide Run History"
                  >
                    <History className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => runTestMutation.mutate(testCase)}
                    disabled={runTestMutation.isPending || loadingApiKey || !webhookApiKey}
                    title={
                      loadingApiKey ? "Loading webhook config..." :
                      !webhookApiKey ? "Webhook not configured. Please visit Postmark Setup in KnowReply settings." :
                      "Run Test"
                    }
                  >
                    {(runTestMutation.isPending && runTestMutation.variables?.id === testCase.id) || (loadingApiKey && !webhookApiKey) ? ( // Show loader if mutating this test case OR if still loading API key and it's not yet available
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <Play className="h-3 w-3 mr-1" />
                    )}
                    Run
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onEdit(testCase)}
                    title="Edit Test Case"
                  >
                    <Edit className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDelete(testCase.id)}
                    disabled={deleteMutation.isPending}
                    title="Delete Test Case"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              {expandedRunHistory[testCase.id] && (
                <div className="mt-4 pt-4 border-t"> {/* Added border-t for visual separation */}
                  <TestRunsList testCaseId={testCase.id} />
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
