
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  Bot, 
  Settings, 
  CheckCircle2, 
  Copy,
  ExternalLink,
  Loader2,
  Brain
} from 'lucide-react';

interface KnowReplyConfig {
  knowreply_api_token: string | null;
  knowreply_agent_id: string | null;
  knowreply_base_url: string | null;
  knowreply_persona: string | null;
}

export function KnowReplySetup() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [config, setConfig] = useState<KnowReplyConfig>({
    knowreply_api_token: '',
    knowreply_agent_id: '',
    knowreply_base_url: 'https://schhqmadbetntdrhowgg.supabase.co/functions/v1',
    knowreply_persona: 'professional'
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
        .select('knowreply_api_token, knowreply_agent_id, knowreply_base_url, knowreply_persona')
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
        description: "Failed to load KnowReply configuration",
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
          knowreply_api_token: config.knowreply_api_token,
          knowreply_agent_id: config.knowreply_agent_id,
          knowreply_base_url: config.knowreply_base_url,
          knowreply_persona: config.knowreply_persona,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: "KnowReply configuration saved successfully",
      });
    } catch (error) {
      console.error('Error saving config:', error);
      toast({
        title: "Error",
        description: "Failed to save KnowReply configuration",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    if (!config.knowreply_api_token || !config.knowreply_base_url) {
      toast({
        title: "Error",
        description: "Please enter your KnowReply API token and base URL first",
        variant: "destructive",
      });
      return;
    }

    setTesting(true);
    try {
      // Test the KnowReply API by making a health check or simple request
      const response = await fetch(`${config.knowreply_base_url}/health`, {
        headers: {
          'Authorization': `Bearer ${config.knowreply_api_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: "KnowReply API connection successful!",
        });
      } else {
        throw new Error(`API returned ${response.status}`);
      }
    } catch (error) {
      console.error('Error testing connection:', error);
      toast({
        title: "Warning",
        description: "Could not verify KnowReply connection. The API might still work correctly.",
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
        <h1 className="text-3xl font-bold text-gray-900">KnowReply Setup</h1>
        <p className="text-gray-600 mt-2">
          Configure KnowReply AI agent to handle intelligent email responses
        </p>
      </div>

      {/* API Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            API Configuration
          </CardTitle>
          <CardDescription>
            Enter your KnowReply API credentials and agent settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="api-token">KnowReply API Token</Label>
            <Input
              id="api-token"
              type="password"
              placeholder="Enter your KnowReply API token"
              value={config.knowreply_api_token || ''}
              onChange={(e) => setConfig({ ...config, knowreply_api_token: e.target.value })}
            />
            <p className="text-sm text-gray-500 mt-1">
              Your API token from the KnowReply dashboard
            </p>
          </div>

          <div>
            <Label htmlFor="agent-id">Agent ID</Label>
            <Input
              id="agent-id"
              placeholder="Enter your KnowReply Agent ID"
              value={config.knowreply_agent_id || ''}
              onChange={(e) => setConfig({ ...config, knowreply_agent_id: e.target.value })}
            />
            <p className="text-sm text-gray-500 mt-1">
              The ID of the agent that will handle email responses
            </p>
          </div>

          <div>
            <Label htmlFor="base-url">Base URL</Label>
            <Input
              id="base-url"
              placeholder="KnowReply API base URL"
              value={config.knowreply_base_url || ''}
              onChange={(e) => setConfig({ ...config, knowreply_base_url: e.target.value })}
            />
            <p className="text-sm text-gray-500 mt-1">
              The base URL for the KnowReply API
            </p>
          </div>

          <div>
            <Label htmlFor="persona">AI Persona</Label>
            <Textarea
              id="persona"
              placeholder="professional"
              value={config.knowreply_persona || ''}
              onChange={(e) => setConfig({ ...config, knowreply_persona: e.target.value })}
              rows={3}
            />
            <p className="text-sm text-gray-500 mt-1">
              Define the personality and tone for AI responses
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

      {/* Agent Status */}
      {config.knowreply_agent_id && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Agent Configuration
            </CardTitle>
            <CardDescription>
              Your KnowReply agent is configured and ready to respond
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-lg px-3 py-2">
                <Brain className="h-4 w-4 mr-2" />
                Agent ID: {config.knowreply_agent_id}
              </Badge>
              <Button 
                variant="outline" 
                size="icon"
                onClick={() => copyToClipboard(config.knowreply_agent_id || '')}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-sm text-gray-500 mt-2">
              This agent will handle intelligent responses to incoming emails
            </p>
          </CardContent>
        </Card>
      )}

      {/* Setup Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Setup Instructions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-medium text-blue-900 mb-2">Getting Started:</h4>
            <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
              <li>Obtain your API token from the KnowReply dashboard</li>
              <li>Create or identify your agent ID in KnowReply</li>
              <li>Configure your agent's persona and response style</li>
              <li>Set up MCP endpoints for external system integration</li>
              <li>Test the configuration with sample emails</li>
            </ol>
          </div>

          <div className="space-y-2">
            <Button variant="outline" className="w-full justify-between" asChild>
              <a href="https://knowreply.com/dashboard" target="_blank" rel="noopener noreferrer">
                KnowReply Dashboard
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
            <Button variant="outline" className="w-full justify-between" asChild>
              <a href="https://docs.knowreply.com" target="_blank" rel="noopener noreferrer">
                KnowReply Documentation
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
