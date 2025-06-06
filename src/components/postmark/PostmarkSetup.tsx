
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  Mail, 
  Server, 
  CheckCircle2, 
  AlertCircle, 
  Copy,
  ExternalLink,
  Loader2
} from 'lucide-react';

interface WorkspaceConfig {
  postmark_api_token: string | null;
  webhook_api_key?: string | null;
}

export function PostmarkSetup() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [config, setConfig] = useState<WorkspaceConfig>({
    postmark_api_token: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [regeneratingKey, setRegeneratingKey] = useState(false);

  useEffect(() => {
    if (user) {
      loadConfig();
    }
  }, [user]);

  const loadConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('workspace_configs')
        .select('postmark_api_token, webhook_api_key')
        .eq('user_id', user?.id)
        .single();

      if (error && error.code !== 'PGRST116' && error.code !== '42P01') { // 42P01: undefined_table (if column not yet there) - this might be too lenient.
        // A better check might be to see if the column exists via a different query or handle specific error messages if possible.
        // For now, let's assume the column might not be there yet in all environments.
        // If the column is guaranteed to exist, PGRST116 is the main one for "no row".
        throw error;
      }

      if (data && !data.webhook_api_key) {
        console.log('Webhook API key not found for user, attempting to generate one...');
        toast({ title: "Information", description: "Generating your unique webhook URL..." });
        try {
          const { data: keyData, error: keyError } = await supabase.functions.invoke('manage-webhook-key');
          if (keyError) throw keyError; // Errors from function invocation itself
          if (keyData.error) throw new Error(keyData.error); // Errors returned by function logic

          if (keyData.webhook_api_key) {
            const updatedConfig = { ...data, webhook_api_key: keyData.webhook_api_key };
            setConfig(updatedConfig);
            // The key is saved by the function, no need to call saveConfig here just for this.
            // However, if other parts of `data` were partially set, this ensures they are retained.
            toast({ title: "Information", description: "A unique webhook URL has been generated and saved for you." });
          } else {
            // Fallback to existing data if key generation didn't return a key, though it should throw an error.
            setConfig(data);
          }
        } catch (e: any) {
          console.error('Error generating webhook_api_key on load:', e);
          toast({
            title: "Webhook URL Generation Failed",
            description: `Could not automatically generate your unique webhook URL: ${e.message}. You can try regenerating it manually.`,
            variant: "destructive",
          });
          // Set config with existing data even if key generation failed, to show other loaded settings.
          setConfig(data);
        }
      } else if (data) {
        setConfig(data);
      }
      // If data is null (no row for user), config remains as initial state.
      // The manage-webhook-key function called via button will handle insert if needed.

    } catch (error) {
      console.error('Error loading config:', error);
      toast({
        title: "Error",
        description: "Failed to load Postmark configuration",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    if (!user) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('workspace_configs')
        .upsert({
          user_id: user.id,
          postmark_api_token: config.postmark_api_token,
          webhook_api_key: config.webhook_api_key, // Ensure webhook_api_key is preserved
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Postmark configuration saved successfully",
      });
    } catch (error) {
      console.error('Error saving config:', error);
      toast({
        title: "Error",
        description: "Failed to save Postmark configuration",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    if (!config.postmark_api_token) {
      toast({
        title: "Error",
        description: "Please enter your Postmark API token first",
        variant: "destructive",
      });
      return;
    }

    setTesting(true);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('test-postmark-connection', {
        body: { apiToken: config.postmark_api_token }
      });

      if (invokeError) {
        // This catches network errors or if the function crashes badly (doesn't return JSON)
        console.error('Supabase function invocation error:', invokeError);
        throw new Error(invokeError.message || 'Failed to invoke test connection function.');
      }

      // At this point, the function itself returned a response (HTTP 200)
      // 'data' should be the JSON payload from the Supabase function
      if (!data) {
        // Should not happen if invokeError is not set, but as a safeguard
        throw new Error('Received no data from test connection function.');
      }

      if (!data.success) {
        // The function executed but indicated a failure (e.g., bad token, Postmark API error)
        console.error('Test connection reported failure:', data.error);
        throw new Error(data.error || 'Test connection failed.');
      }

      // If we reach here, data.success is true
      console.log('Connection test successful:', data);
      toast({
        title: "Success",
        description: data.message || `Successfully connected to Postmark. Server: ${data.serverName} (ID: ${data.serverId})`,
      });

    } catch (error) { // Catches errors thrown from within the try block
      console.error('Error during testConnection:', error);
      toast({
        title: "Error",
        description: error.message || 'Failed to connect to Postmark API.', // error.message will now be more specific
        variant: "destructive",
      });
    } finally {
      setTesting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: "Copied to clipboard",
    });
  };

  // Use the correct Supabase webhook URL
  const generatedWebhookUrl = config.webhook_api_key
    ? `https://hub.knowreply.email/postmark-webhook/${config.webhook_api_key}` // Changed base URL
    : config.postmark_api_token // Only show generating if token exists, otherwise it's not relevant yet
    ? 'Generating your unique webhook URL...'
    : 'Please save API token to generate webhook URL.';


  const handleRegenerateKey = async () => {
    setRegeneratingKey(true);
    try {
      const { data: keyData, error: keyError } = await supabase.functions.invoke('manage-webhook-key');
      if (keyError) throw keyError;
      if (keyData.error) throw new Error(keyData.error); // Error from function logic

      if (keyData.webhook_api_key) {
        setConfig(prevConfig => ({ ...prevConfig, webhook_api_key: keyData.webhook_api_key }));
        toast({
          title: "Success",
          description: "New webhook URL generated and saved.",
        });
      } else {
        throw new Error("New API key was not returned by the function.");
      }
    } catch (e: any) {
      console.error('Error regenerating webhook_api_key:', e);
      toast({
        title: "Error",
        description: `Failed to regenerate webhook URL: ${e.message}`,
        variant: "destructive",
      });
    } finally {
      setRegeneratingKey(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Postmark Setup</h1>
        <p className="text-gray-600 mt-2">
          Configure Postmark to receive, process, and reply to inbound emails
        </p>
      </div>

      {/* API Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Postmark Server API Configuration
          </CardTitle>
          <CardDescription>
            Enter your Postmark Server API credentials to get started. This will be used for sending reply emails.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="api-token">Postmark Server API Token</Label>
            <Input
              id="api-token"
              type="password"
              placeholder="Enter your Postmark Server API token"
              value={config.postmark_api_token || ''}
              onChange={(e) => setConfig({ ...config, postmark_api_token: e.target.value })}
            />
            <p className="text-sm text-gray-500 mt-1">
              Found in your Postmark account in your Server's "API Tokens" tab under "Server API tokens"
            </p>
          </div>

          <div className="flex gap-2">
            <Button onClick={testConnection} disabled={testing} variant="outline">
              {testing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Test Connection
            </Button>
            <Button onClick={saveConfig} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Configuration
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Webhook Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Inbound Email Webhook Configuration
          </CardTitle>
          <CardDescription>
            Add this webhook URL in your Postmark Inbound Stream server "Settings" tab in the "Inbound webhook" field
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Your Unique Webhook URL</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input 
                value={generatedWebhookUrl}
                readOnly 
                className={`bg-gray-50 ${!config.webhook_api_key ? 'italic' : ''}`}
              />
              <Button 
                variant="outline" 
                size="icon"
                onClick={() => config.webhook_api_key && copyToClipboard(generatedWebhookUrl)}
                disabled={!config.webhook_api_key}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
             <p className="text-sm text-gray-500 mt-1">
              This URL is unique to your workspace. Use it in your Postmark server's inbound webhook settings.
            </p>
            <Button
              onClick={handleRegenerateKey}
              disabled={regeneratingKey || !config.postmark_api_token} // Also disable if no main API token
              variant="outline"
              size="sm"
              className="mt-2"
            >
              {regeneratingKey ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Regenerate Webhook URL
            </Button>
            {!config.postmark_api_token && (
                 <p className="text-xs text-orange-600 mt-1">
                    Save your Postmark API token to enable webhook URL generation/regeneration.
                 </p>
            )}
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-medium text-blue-900 mb-2">Setup Instructions:</h4>
            <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
              <li>Go to your Postmark server settings</li>
              <li>Navigate to the "Inbound" section</li>
              <li>Paste the webhook URL above in the "Webhook URL" field</li>
              <li>Save your Postmark server settings</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quick Links</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button variant="outline" className="w-full justify-between" asChild>
            <a href="https://postmarkapp.com/" target="_blank" rel="noopener noreferrer">
              Postmark Dashboard
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
          <Button variant="outline" className="w-full justify-between" asChild>
            <a href="https://postmarkapp.com/developer/user-guide/inbound" target="_blank" rel="noopener noreferrer">
              Inbound Email Documentation
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}
