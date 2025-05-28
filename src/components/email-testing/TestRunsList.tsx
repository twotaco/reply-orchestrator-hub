
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Trash2, CheckCircle, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface TestRunsListProps {
  testCaseId: string;
}

export function TestRunsList({ testCaseId }: TestRunsListProps) {
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: testRuns, isLoading, refetch } = useQuery({
    queryKey: ['test-runs', testCaseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_test_runs')
        .select('*')
        .eq('test_case_id', testCaseId)
        .eq('user_id', user?.id)
        .order('executed_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!user?.id && !!testCaseId
  });

  const deleteMutation = useMutation({
    mutationFn: async (testRunId: string) => {
      const { error } = await supabase
        .from('email_test_runs')
        .delete()
        .eq('id', testRunId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Test run deleted successfully'
      });
      refetch();
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: `Failed to delete test run: ${error.message}`,
        variant: 'destructive'
      });
    }
  });

  const handleDelete = async (testRunId: string) => {
    if (confirm('Are you sure you want to delete this test run?')) {
      deleteMutation.mutate(testRunId);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!testRuns || testRuns.length === 0) {
    return (
      <div className="text-center py-4">
        <p className="text-gray-500 text-sm">No test runs yet. Click "Run" to execute this test case.</p>
      </div>
    );
  }

  return (
    <div>
      <h4 className="font-medium mb-3">Test Run History</h4>
      <div className="space-y-3">
        {testRuns.map((run) => (
          <div key={run.id} className="border rounded-lg p-3 bg-gray-50">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {run.success ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-600" />
                )}
                <Badge variant={run.success ? 'default' : 'destructive'}>
                  {run.success ? 'Success' : 'Failed'}
                </Badge>
                <span className="text-sm text-gray-600">
                  {new Date(run.executed_at).toLocaleString()}
                </span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleDelete(run.id)}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
            
            {run.error_message && (
              <div className="mb-2">
                <h5 className="text-sm font-medium text-red-600">Error:</h5>
                <p className="text-sm text-red-700 bg-red-50 p-2 rounded mt-1">
                  {run.error_message}
                </p>
              </div>
            )}
            
            {run.response_data && (
              <div>
                <h5 className="text-sm font-medium mb-1">Response:</h5>
                <pre className="text-xs bg-white p-2 rounded border overflow-x-auto">
                  {JSON.stringify(run.response_data, null, 2)}
                </pre>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
