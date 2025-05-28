
import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Play, Edit, Trash2, X } from 'lucide-react';
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
      // Get the webhook URL from workspace config
      const { data: config } = await supabase
        .from('workspace_configs')
        .select('postmark_webhook_url')
        .eq('user_id', user?.id)
        .single();

      if (!config?.postmark_webhook_url) {
        throw new Error('No Postmark webhook URL configured');
      }

      // Send the test data to the webhook
      const response = await fetch(config.postmark_webhook_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: typeof testCase.incoming_json === 'string' 
          ? testCase.incoming_json 
          : JSON.stringify(testCase.incoming_json)
      });

      const responseText = await response.text();
      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = responseText;
      }

      // Record the test run
      const { error } = await supabase
        .from('email_test_runs')
        .insert({
          user_id: user?.id,
          test_case_id: testCase.id,
          success: response.ok,
          response_data: responseData,
          error_message: response.ok ? null : `HTTP ${response.status}: ${responseText}`
        });

      if (error) throw error;

      return { success: response.ok, responseData, status: response.status };
    },
    onSuccess: (result, testCase) => {
      toast({
        title: result.success ? 'Test Passed' : 'Test Failed',
        description: result.success 
          ? 'Test case executed successfully' 
          : `Test failed with status ${result.status}`,
        variant: result.success ? 'default' : 'destructive'
      });
      onRefresh();
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
          Click on a test case to view its details and run history
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Accordion type="single" collapsible className="space-y-4">
          {testCases.map((testCase) => (
            <AccordionItem key={testCase.id} value={testCase.id} className="border rounded-lg">
              <AccordionTrigger className="px-4 py-3 hover:no-underline">
                <div className="flex items-center justify-between w-full">
                  <div className="text-left">
                    <h3 className="font-medium">{testCase.title}</h3>
                    {testCase.description && (
                      <p className="text-sm text-gray-600 mt-1">{testCase.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mr-4">
                    <Button
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        runTestMutation.mutate(testCase);
                      }}
                      disabled={runTestMutation.isPending}
                    >
                      <Play className="h-3 w-3 mr-1" />
                      Run
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(testCase);
                      }}
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(testCase.id);
                      }}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-2">Incoming JSON:</h4>
                    <pre className="bg-gray-50 p-3 rounded text-sm overflow-x-auto">
                      {JSON.stringify(testCase.incoming_json, null, 2)}
                    </pre>
                  </div>
                  
                  <TestRunsList testCaseId={testCase.id} />
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
}
