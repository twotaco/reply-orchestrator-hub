
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus } from 'lucide-react';
import { TestCaseForm } from './TestCaseForm';
import { TestCaseList } from './TestCaseList';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export function EmailTesting() {
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [editingTestCase, setEditingTestCase] = useState(null);

  const { data: testCases, isLoading, refetch } = useQuery({
    queryKey: ['email-test-cases'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_test_cases')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!user?.id
  });

  const handleCreateTestCase = () => {
    setEditingTestCase(null);
    setShowForm(true);
  };

  const handleEditTestCase = (testCase) => {
    setEditingTestCase(testCase);
    setShowForm(true);
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingTestCase(null);
    refetch();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Email Testing</h1>
          <p className="text-gray-600 mt-1">
            Simulate and test incoming email processing through your Postmark webhook
          </p>
        </div>
        <Button onClick={handleCreateTestCase}>
          <Plus className="h-4 w-4 mr-2" />
          New Test Case
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>
              {editingTestCase ? 'Edit Test Case' : 'Create New Test Case'}
            </CardTitle>
            <CardDescription>
              Define the email data you want to test with your webhook processing
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TestCaseForm
              testCase={editingTestCase}
              onClose={handleFormClose}
            />
          </CardContent>
        </Card>
      )}

      <TestCaseList
        testCases={testCases || []}
        onEdit={handleEditTestCase}
        onRefresh={refetch}
      />
    </div>
  );
}
