
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
  postmark_webhook_url: string | null;
  postmark_active: boolean | null;
  postmark_inbound_hash: string | null;
  postmark_server_id: string | null;
}

export function PostmarkSetup() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [config, setConfig] = useState<WorkspaceConfig>({
    postmark_api_token: '',
    postmark_webhook_url: '',
    postmark_active: false,
    postmark_inbound_hash: '',
    postmark_server_id: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (user) {
      loadConfig();
    }
  }, [user]);

  const loadConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('workspace_configs')
        .select('postmark_api_token, postmark_webhook_url, postmark_active, postmark_inbound_hash, postmark_server_id')
        .eq('user_id', user?.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setConfig(data);
      }
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
          postmark_webhook_url: config.postmark_webhook_url,
          postmark_active: config.postmark_active,
          postmark_inbound_hash: config.postmark_inbound_hash,
          postmark_server_id: config.postmark_server_id,
          updated_at: new Date().toISOString()
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
      // Test the Postmark API by getting server details
      const response = await fetch(`https://api.postmarkapp.com/servers`, {
        headers: {
          'Accept': 'application/json',
          'X-Postmark-Account-Token': config.postmark_api_token
        }
      });

      if (!response.ok) {
        throw new Error('Invalid API token or server error');
      }

      const data = await response.json();
      console.log('Postmark servers:', data);

      toast({
        title: "Success",
        description: "Postmark API connection successful!",
      });
    } catch (error) {
      console.error('Error testing connection:', error);
      toast({
        title: "Error",
        description: "Failed to connect to Postmark API. Please check your API token.",
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
  const webhookUrl = `https://gfabrnzppzorywipiwcm.supabase.co/functions/v1/postmark-webhook`;

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
          Configure Postmark to receive and process inbound emails
        </p>
      </div>

      {/* API Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            API Configuration
          </CardTitle>
          <CardDescription>
            Enter your Postmark API credentials to get started
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="api-token">Postmark Account API Token</Label>
            <Input
              id="api-token"
              type="password"
              placeholder="Enter your Postmark Account API token"
              value={config.postmark_api_token || ''}
              onChange={(e) => setConfig({ ...config, postmark_api_token: e.target.value })}
            />
            <p className="text-sm text-gray-500 mt-1">
              Found in your Postmark account under API Tokens
            </p>
          </div>

          <div>
            <Label htmlFor="server-id">Server ID (Optional)</Label>
            <Input
              id="server-id"
              placeholder="Enter your Postmark Server ID"
              value={config.postmark_server_id || ''}
              onChange={(e) => setConfig({ ...config, postmark_server_id: e.target.value })}
            />
          </div>

          <div>
            <Label htmlFor="inbound-hash">Inbound Hash</Label>
            <Input
              id="inbound-hash"
              placeholder="Enter your inbound hash (from Postmark server settings)"
              value={config.postmark_inbound_hash || ''}
              onChange={(e) => setConfig({ ...config, postmark_inbound_hash: e.target.value })}
            />
            <p className="text-sm text-gray-500 mt-1">
              This is the unique identifier before @inbound.postmarkapp.com
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
            Webhook Configuration
          </CardTitle>
          <CardDescription>
            Set up the webhook URL in your Postmark server settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Webhook URL</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input 
                value={webhookUrl} 
                readOnly 
                className="bg-gray-50"
              />
              <Button 
                variant="outline" 
                size="icon"
                onClick={() => copyToClipboard(webhookUrl)}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Copy this URL and paste it in your Postmark server's inbound webhook settings
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-medium text-blue-900 mb-2">Setup Instructions:</h4>
            <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
              <li>Go to your Postmark server settings</li>
              <li>Navigate to the "Inbound" section</li>
              <li>Paste the webhook URL above in the "Webhook URL" field</li>
              <li>Save your Postmark server settings</li>
              <li>Test by sending an email to your inbound address</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      {/* Inbound Email Address */}
      {config.postmark_inbound_hash && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Your Inbound Email Address
            </CardTitle>
            <CardDescription>
              This is where people can send emails to your system
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-lg px-3 py-2">
                {config.postmark_inbound_hash}@inbound.postmarkapp.com
              </Badge>
              <Button 
                variant="outline" 
                size="icon"
                onClick={() => copyToClipboard(`${config.postmark_inbound_hash}@inbound.postmarkapp.com`)}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-sm text-gray-500 mt-2">
              Emails sent to this address will be processed by your system
            </p>
          </CardContent>
        </Card>
      )}

      {/* Quick Links */}
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
