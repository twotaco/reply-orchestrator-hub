
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Bot, 
  Settings, 
  CheckCircle2, 
  Copy,
  ExternalLink,
  Loader2,
  Brain,
  AlertCircle
} from 'lucide-react';

interface KnowReplyConfig {
  knowreply_api_token: string | null;
  knowreply_agent_id: string | null;
}

interface Agent {
  id: string;
  name: string;
  description?: string;
}

interface MCPEndpoint {
  id: string;
  name: string;
  category: string;
  post_url: string;
  instructions?: string;
}

interface AgentMCPMapping {
  id: string;
  agent_id: string;
  mcp_endpoint_id: string;
  active: boolean;
}

const KNOWREPLY_BASE_URL = 'https://schhqmadbetntdrhowgg.supabase.co/functions/v1';
const KNOWREPLY_GET_AGENTS_URL = `${KNOWREPLY_BASE_URL}/knowreply-get-agents`;

export function KnowReplySetup() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [config, setConfig] = useState<KnowReplyConfig>({
    knowreply_api_token: '',
    knowreply_agent_id: ''
  });
  const [agents, setAgents] = useState<Agent[]>([]);
  const [mcpEndpoints, setMCPEndpoints] = useState<MCPEndpoint[]>([]);
  const [agentMappings, setAgentMappings] = useState<AgentMCPMapping[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      loadConfig();
      loadMCPEndpoints();
    }
  }, [user]);

  useEffect(() => {
    if (config.knowreply_api_token) {
      fetchAgents();
    }
  }, [config.knowreply_api_token]);

  useEffect(() => {
    if (selectedAgent) {
      loadAgentMappings();
    }
  }, [selectedAgent]);

  const loadConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('workspace_configs')
        .select('knowreply_api_token, knowreply_agent_id')
        .eq('user_id', user?.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setConfig(data);
        if (data.knowreply_agent_id) {
          setSelectedAgent(data.knowreply_agent_id);
        }
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

  const loadMCPEndpoints = async () => {
    try {
      const { data, error } = await supabase
        .from('mcp_endpoints')
        .select('*')
        .eq('user_id', user?.id)
        .eq('active', true);

      if (error) throw error;
      setMCPEndpoints(data || []);
    } catch (error) {
      console.error('Error loading MCP endpoints:', error);
    }
  };

  const loadAgentMappings = async () => {
    try {
      const { data, error } = await supabase
        .from('knowreply_agent_mcp_mappings')
        .select('*')
        .eq('user_id', user?.id)
        .eq('agent_id', selectedAgent);

      if (error) throw error;
      setAgentMappings(data || []);
    } catch (error) {
      console.error('Error loading agent mappings:', error);
    }
  };

  const fetchAgents = async () => {
    if (!config.knowreply_api_token) return;

    setLoadingAgents(true);
    setFetchError(null);
    
    console.log('Attempting to fetch agents from:', KNOWREPLY_GET_AGENTS_URL);
    console.log('Using API token:', config.knowreply_api_token?.substring(0, 10) + '...');

    try {
      const requestBody = {
        api_token: config.knowreply_api_token
      };
      
      console.log('Request body:', requestBody);

      const response = await fetch(KNOWREPLY_GET_AGENTS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      console.log('Response status:', response.status);
      console.log('Response headers:', response.headers);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Response error text:', errorText);
        throw new Error(`HTTP ${response.status}: ${errorText || 'Failed to fetch agents'}`);
      }

      const result = await response.json();
      console.log('Response data:', result);

      if (result.success && result.agents) {
        setAgents(result.agents);
        console.log('Successfully loaded agents:', result.agents);
      } else {
        throw new Error(result.error || 'No agents returned from API');
      }
    } catch (error) {
      console.error('Detailed fetch error:', error);
      
      let errorMessage = 'Failed to fetch agents';
      if (error instanceof TypeError && error.message === 'Failed to fetch') {
        errorMessage = 'Network error: Unable to connect to KnowReply API. This could be due to CORS, network issues, or the API being unavailable.';
        setFetchError('Network connection failed. Please check your internet connection and try again.');
      } else if (error instanceof Error) {
        errorMessage = error.message;
        setFetchError(error.message);
      }

      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
      setAgents([]);
    } finally {
      setLoadingAgents(false);
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
          knowreply_agent_id: selectedAgent,
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

  const toggleMCPMapping = async (mcpEndpointId: string, enabled: boolean) => {
    if (!user || !selectedAgent) return;

    try {
      if (enabled) {
        // Add mapping
        const { error } = await supabase
          .from('knowreply_agent_mcp_mappings')
          .upsert({
            user_id: user.id,
            agent_id: selectedAgent,
            mcp_endpoint_id: mcpEndpointId,
            active: true
          });

        if (error) throw error;
      } else {
        // Remove mapping
        const { error } = await supabase
          .from('knowreply_agent_mcp_mappings')
          .delete()
          .eq('user_id', user.id)
          .eq('agent_id', selectedAgent)
          .eq('mcp_endpoint_id', mcpEndpointId);

        if (error) throw error;
      }

      // Reload mappings
      await loadAgentMappings();

      toast({
        title: "Success",
        description: enabled ? "MCP endpoint enabled for agent" : "MCP endpoint disabled for agent",
      });
    } catch (error) {
      console.error('Error updating MCP mapping:', error);
      toast({
        title: "Error",
        description: "Failed to update MCP endpoint mapping",
        variant: "destructive",
      });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: "Copied to clipboard",
    });
  };

  const isMCPMapped = (mcpEndpointId: string) => {
    return agentMappings.some(mapping => 
      mapping.mcp_endpoint_id === mcpEndpointId && mapping.active
    );
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
          Configure KnowReply AI agents to handle intelligent email responses
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
            Enter your KnowReply API token to access your agents
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

          <Button onClick={saveConfig} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save Configuration
          </Button>
        </CardContent>
      </Card>

      {/* Agent Selection */}
      {config.knowreply_api_token && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              Agent Selection
            </CardTitle>
            <CardDescription>
              Choose which KnowReply agent will handle your email responses
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingAgents ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                <span>Loading agents...</span>
              </div>
            ) : fetchError ? (
              <div className="text-center py-8">
                <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
                <p className="text-red-600 mb-4">{fetchError}</p>
                <Button 
                  variant="outline" 
                  onClick={fetchAgents}
                  className="mt-2"
                >
                  Retry Connection
                </Button>
              </div>
            ) : agents.length > 0 ? (
              <div>
                <Label htmlFor="agent-select">Select Agent</Label>
                <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose an agent" />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.name}
                        {agent.description && (
                          <span className="text-gray-500 text-sm"> - {agent.description}</span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No agents found. Please check your API token.</p>
                <Button 
                  variant="outline" 
                  onClick={fetchAgents}
                  className="mt-2"
                >
                  Retry
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* MCP Endpoint Configuration */}
      {selectedAgent && mcpEndpoints.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              MCP Endpoint Configuration
            </CardTitle>
            <CardDescription>
              Configure which MCP endpoints this agent can use to interact with external systems
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {mcpEndpoints.map((endpoint) => (
              <div key={endpoint.id} className="flex items-center space-x-3 p-3 border rounded-lg">
                <Checkbox
                  checked={isMCPMapped(endpoint.id)}
                  onCheckedChange={(checked) => 
                    toggleMCPMapping(endpoint.id, checked as boolean)
                  }
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{endpoint.name}</span>
                    <Badge variant="outline">{endpoint.category}</Badge>
                  </div>
                  {endpoint.instructions && (
                    <p className="text-sm text-gray-500 mt-1">{endpoint.instructions}</p>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Selected Agent Status */}
      {selectedAgent && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Active Agent Configuration
            </CardTitle>
            <CardDescription>
              Your selected agent is ready to handle email responses
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-lg px-3 py-2">
                  <Brain className="h-4 w-4 mr-2" />
                  Agent ID: {selectedAgent}
                </Badge>
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={() => copyToClipboard(selectedAgent)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              
              {agentMappings.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Connected MCP Endpoints:</p>
                  <div className="flex flex-wrap gap-2">
                    {agentMappings.map((mapping) => {
                      const endpoint = mcpEndpoints.find(e => e.id === mapping.mcp_endpoint_id);
                      return endpoint ? (
                        <Badge key={mapping.id} variant="secondary">
                          {endpoint.name}
                        </Badge>
                      ) : null;
                    })}
                  </div>
                </div>
              )}
            </div>
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
              <li>Enter your KnowReply API token above</li>
              <li>Select the agent you want to use for email responses</li>
              <li>Configure which MCP endpoints the agent can access</li>
              <li>Set up your email routing with Postmark integration</li>
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
