
import { useState, useEffect, useCallback } from 'react'; // Added useCallback just in case, though not strictly needed by plan
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Copy, Loader2 } from 'lucide-react'; // Added Copy and Loader2

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
  // Removed inboundHash state and its useEffect

  const [mappedAgentEmails, setMappedAgentEmails] = useState<Array<{ agent_id: string; email_address: string; agent_name: string | null }>>([]);
  const [loadingMappings, setLoadingMappings] = useState<boolean>(true);

  useEffect(() => {
    if (!user?.id) {
      setLoadingMappings(false);
      setMappedAgentEmails([]);
      return;
    }
    setLoadingMappings(true);
    supabase
      .from('agent_email_mappings')
      .select('agent_id, email_address, agent_name')
      .eq('user_id', user.id)
      .then(({ data, error }) => {
        if (error) {
          console.error('Error fetching agent email mappings:', error);
          toast({ title: "Error", description: "Could not load agent email mappings.", variant: "destructive" });
          setMappedAgentEmails([]);
        } else {
          setMappedAgentEmails(data || []);
        }
        setLoadingMappings(false);
      });
  }, [user, toast]);

  const generateExampleJson = (currentMappedEmails: typeof mappedAgentEmails) => {
    const recipientEmail = currentMappedEmails.length > 0
      ? currentMappedEmails[0].email_address
      : 'agent_email@example.com'; // Default if no mappings
    const mailboxHash = recipientEmail.startsWith('agent_email@')
      ? 'TestHash'
      : (recipientEmail.split('@')[0].split('+').pop() || 'GeneratedHashFromEmail');
    const messageId = `test-message-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    
    return JSON.stringify({
      "FromName": "Test User",
      "MessageStream": "inbound",
      "From": "testuser@example.com",
      "FromFull": { "Email": "testuser@example.com", "Name": "Test User", "MailboxHash": "" },
      "To": recipientEmail,
      "ToFull": [{ "Email": recipientEmail, "Name": "Test Agent/Recipient", "MailboxHash": mailboxHash }],
      "Cc": "", "CcFull": [], "Bcc": "", "BccFull": [],
      "OriginalRecipient": recipientEmail,
      "Subject": "Sample Test Email Subject",
      "MessageID": messageId,
      "ReplyTo": "testuser@example.com",
      "MailboxHash": mailboxHash, // This is the hash part of the ToFull email if present
      "Date": new Date().toUTCString(), // Using toUTCString for a common format
      "TextBody": "This is a sample email body for testing purposes.",
      "HtmlBody": "<p>This is a sample email body for testing purposes.</p>",
      "StrippedTextReply": "This is the reply text.",
      "Tag": "test-case",
      "Headers": [
        { "Name": "X-Spam-Status", "Value": "No" },
        { "Name": "X-Spam-Score", "Value": "-0.1" },
        { "Name": "X-Spam-Tests", "Value": "DKIM_SIGNED,DKIM_VALID,DKIM_VALID_AU,SPF_PASS" }
      ],
      "Attachments": []
    }, null, 2);
  };
/* OLD JSON Structure for reference, to be removed by the new one above
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
  "MessageID": "12345-abcde-67890",
  "ReplyTo": "john@example.com",
  "MailboxHash": "SampleHash",
  "Date": "Mon, 28 May 2025 10:00:00 +0000",
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
*/ // End of old JSON structure reference

  const [title, setTitle] = useState(testCase?.title || '');
  const [description, setDescription] = useState(testCase?.description || '');
  const [incomingJson, setIncomingJson] = useState(
    testCase?.incoming_json ? JSON.stringify(testCase.incoming_json, null, 2) : ''
  );

  // This useEffect will now primarily handle setting JSON from an existing testCase
  useEffect(() => {
    if (testCase?.incoming_json) {
      setIncomingJson(JSON.stringify(testCase.incoming_json, null, 2));
    } else if (testCase) { // Editing an existing test case that might not have JSON yet
      // Generate example JSON if mappedAgentEmails are available, otherwise wait.
      // This ensures that if mappings are still loading, we don't generate with defaults prematurely.
      if (!loadingMappings) {
         setIncomingJson(generateExampleJson(mappedAgentEmails));
      }
    }
    // Initial setting for new test cases will be handled by the effect below
  }, [testCase, loadingMappings, mappedAgentEmails]); // Added loadingMappings and mappedAgentEmails here

  // New/updated useEffect to set default JSON for new test cases AFTER mappings are loaded
  useEffect(() => {
    if (!testCase && !loadingMappings) { // Only if not editing, and mappings have been loaded/attempted
      setIncomingJson(generateExampleJson(mappedAgentEmails));
    }
  }, [testCase, loadingMappings, mappedAgentEmails]);

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
          className="font-mono text-sm"
          rows={15} // Adjusted rows slightly
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={() => setIncomingJson(generateExampleJson(mappedAgentEmails))}
          disabled={loadingMappings}
        >
          {loadingMappings ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          Generate Example JSON
        </Button>
        <p className="text-xs text-gray-600 mt-1">
          The <code>To</code> and <code>ToFull[0].Email</code> fields in the JSON determine which agent(s) are triggered based on your KnowReply Setup. Use a mapped email for success tests, or any other email to test different routing scenarios. The list below provides your currently mapped emails for easy copying.
        </p>
      </div>

      {/* Display Mapped Emails */}
      <div className="mt-4 space-y-2">
        <Label className="font-medium">Your Mapped Agent Emails (for reference):</Label>
        {loadingMappings ? (
          <div className="flex items-center text-sm text-gray-500">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Loading mapped emails...
          </div>
        ) : mappedAgentEmails.length > 0 ? (
          <div className="max-h-32 overflow-y-auto rounded-md border p-2 space-y-1">
            {mappedAgentEmails.map((mapping) => (
              <div key={mapping.email_address + mapping.agent_id} className="flex items-center justify-between text-sm p-1 bg-gray-50 rounded">
                <span>
                  {mapping.email_address}
                  {mapping.agent_name && <span className="text-gray-500 ml-1">({mapping.agent_name})</span>}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(mapping.email_address);
                    toast({ title: "Copied!", description: `${mapping.email_address} copied to clipboard.` });
                  }}
                  title={`Copy ${mapping.email_address}`}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            No agent email mappings found. Configure them in "KnowReply Setup" to see them here.
          </p>
        )}
      </div>

      <div className="flex gap-2 mt-6"> {/* Added mt-6 for spacing before main action buttons */}
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
