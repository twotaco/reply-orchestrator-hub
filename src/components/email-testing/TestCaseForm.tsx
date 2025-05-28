
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface TestCase {
  id: string;
  title: string;
  description?: string;
  incoming_json: any;
}

interface TestCaseFormProps {
  testCase?: TestCase | null;
  onClose: () => void;
}

export function TestCaseForm({ testCase, onClose }: TestCaseFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [title, setTitle] = useState(testCase?.title || '');
  const [description, setDescription] = useState(testCase?.description || '');
  const [incomingJson, setIncomingJson] = useState(
    testCase?.incoming_json ? JSON.stringify(testCase.incoming_json, null, 2) : ''
  );

  const saveMutation = useMutation({
    mutationFn: async (data: { title: string; description: string; incoming_json: string }) => {
      let parsedJson;
      try {
        parsedJson = JSON.parse(data.incoming_json);
      } catch {
        parsedJson = data.incoming_json; // Store as-is if invalid JSON
      }

      if (testCase) {
        const { error } = await supabase
          .from('email_test_cases')
          .update({
            title: data.title,
            description: data.description,
            incoming_json: parsedJson,
            updated_at: new Date().toISOString()
          })
          .eq('id', testCase.id);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('email_test_cases')
          .insert({
            user_id: user?.id,
            title: data.title,
            description: data.description,
            incoming_json: parsedJson
          });
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: `Test case ${testCase ? 'updated' : 'created'} successfully`
      });
      onClose();
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: `Failed to ${testCase ? 'update' : 'create'} test case: ${error.message}`,
        variant: 'destructive'
      });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast({
        title: 'Error',
        description: 'Title is required',
        variant: 'destructive'
      });
      return;
    }
    
    saveMutation.mutate({
      title: title.trim(),
      description: description.trim(),
      incoming_json: incomingJson
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="title">Title *</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g., Customer Support Email Test"
          required
        />
      </div>

      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe what this test case is for..."
          rows={2}
        />
      </div>

      <div>
        <Label htmlFor="json">Incoming JSON</Label>
        <Textarea
          id="json"
          value={incomingJson}
          onChange={(e) => setIncomingJson(e.target.value)}
          placeholder="Paste your Postmark webhook JSON here..."
          className="font-mono text-sm"
          rows={12}
        />
        <p className="text-sm text-gray-600 mt-1">
          This should be the JSON payload that Postmark would send to your webhook
        </p>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={saveMutation.isPending}>
          {saveMutation.isPending ? 'Saving...' : (testCase ? 'Update' : 'Create')}
        </Button>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
