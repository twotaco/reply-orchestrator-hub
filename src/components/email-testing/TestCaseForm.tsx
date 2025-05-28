import { useState, useEffect } from 'react';
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
  const [inboundHash, setInboundHash] = useState<string>('');
  
  // Load user's inbound hash
  useEffect(() => {
    const loadInboundHash = async () => {
      if (!user) return;
      
      try {
        const { data, error } = await supabase
          .from('workspace_configs')
          .select('postmark_inbound_hash')
          .eq('user_id', user.id)
          .single();

        if (error && error.code !== 'PGRST116') {
          console.error('Error loading inbound hash:', error);
          return;
        }

        if (data?.postmark_inbound_hash) {
          setInboundHash(data.postmark_inbound_hash);
        }
      } catch (error) {
        console.error('Error loading workspace config:', error);
      }
    };

    loadInboundHash();
  }, [user]);

  const generateUniqueMessageId = () => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `${timestamp}-${random}`;
  };

  const generateExampleJson = (hash: string) => {
    const inboundEmail = hash ? `${hash}@inbound.postmarkapp.com` : 'yourhash@inbound.postmarkapp.com';
    const toEmailWithHash = hash ? `${hash}+SampleHash@inbound.postmarkapp.com` : 'yourhash+SampleHash@inbound.postmarkapp.com';
    const uniqueMessageId = generateUniqueMessageId();
    const currentDate = new Date().toUTCString();
    
    return `{
  "FromName": "John Doe",
  "MessageStream": "inbound",
  "From": "john@example.com",
  "FromFull": {
    "Email": "john@example.com",
    "Name": "John Doe",
    "MailboxHash": ""
  },
  "To": "${toEmailWithHash}",
  "ToFull": [
    {
      "Email": "${toEmailWithHash}",
      "Name": "Support Team",
      "MailboxHash": "SampleHash"
    }
  ],
  "Cc": "",
  "CcFull": [],
  "Bcc": "",
  "BccFull": [],
  "OriginalRecipient": "${toEmailWithHash}",
  "Subject": "Test Email Subject",
  "MessageID": "${uniqueMessageId}",
  "ReplyTo": "john@example.com",
  "MailboxHash": "SampleHash",
  "Date": "${currentDate}",
  "TextBody": "This is a test email body.",
  "HtmlBody": "<p>This is a test email body.</p>",
  "StrippedTextReply": "This is the reply text",
  "Tag": "",
  "Headers": [
    {
      "Name": "X-Spam-Status",
      "Value": "No"
    },
    {
      "Name": "X-Spam-Score",
      "Value": "-0.1"
    },
    {
      "Name": "X-Spam-Tests",
      "Value": "DKIM_SIGNED,DKIM_VALID,DKIM_VALID_AU,SPF_PASS"
    }
  ],
  "Attachments": []
}`;
  };

  const [title, setTitle] = useState(testCase?.title || '');
  const [description, setDescription] = useState(testCase?.description || '');
  const [incomingJson, setIncomingJson] = useState(
    testCase?.incoming_json ? JSON.stringify(testCase.incoming_json, null, 2) : ''
  );

  // Update the JSON when inbound hash is loaded or when creating a new test case
  useEffect(() => {
    if (!testCase && inboundHash) {
      setIncomingJson(generateExampleJson(inboundHash));
    }
  }, [inboundHash, testCase]);

  // Set default JSON for new test cases if no inbound hash is available yet
  useEffect(() => {
    if (!testCase && !incomingJson) {
      setIncomingJson(generateExampleJson(''));
    }
  }, [testCase, incomingJson]);

  const generateNewTestData = () => {
    const currentJson = incomingJson ? JSON.parse(incomingJson) : {};
    const newMessageId = generateUniqueMessageId();
    const currentDate = new Date().toUTCString();
    
    const updatedJson = {
      ...currentJson,
      MessageID: newMessageId,
      Date: currentDate
    };
    
    setIncomingJson(JSON.stringify(updatedJson, null, 2));
  };

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
        <div className="flex items-center justify-between mb-2">
          <Label htmlFor="json">Incoming JSON</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={generateNewTestData}
          >
            Generate New Test Data
          </Button>
        </div>
        <Textarea
          id="json"
          value={incomingJson}
          onChange={(e) => setIncomingJson(e.target.value)}
          className="font-mono text-sm"
          rows={20}
        />
        <p className="text-sm text-gray-600 mt-1">
          This is the JSON payload that Postmark would send to your webhook. 
          {inboundHash && (
            <span> The example uses your configured inbound hash: <code className="bg-gray-100 px-1 rounded">{inboundHash}</code></span>
          )}
          <br />
          <strong>Tip:</strong> Use "Generate New Test Data" to create unique Message IDs and timestamps for each test run.
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
