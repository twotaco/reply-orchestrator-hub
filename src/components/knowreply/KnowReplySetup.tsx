
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
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Bot, 
  Settings, 
  CheckCircle2, 
  ExternalLink,
  Loader2,
  Brain,
  AlertCircle,
  Trash2,
  Plus,
  Save
} from 'lucide-react';

interface KnowReplyConfig {
  knowreply_api_token: string | null;
}

interface Agent {
  id: string;
  name: string;
  persona?: string;
  role?: string;
}

interface MCPEndpoint {
  id: string;
  name: string;
  category: string;
  post_url: string;
  instructions?: string;
}

interface AgentEmailMapping {
  id: string;
  agent_id: string;
  email_address: string;
}

interface AgentConfig {
  agent_id: string;
  agent_name: string;
  agent_role?: string;
  enabled: boolean;
  mcp_endpoints: string[];
  email_addresses: string[];
  email_errors?: string[];
}

const KNOWREPLY_GET_AGENTS_URL = 'https://schhqmadbetntdrhowgg.supabase.co/functions/v1/get-agents';

export function KnowReplySetup() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [config, setConfig] = useState<KnowReplyConfig>({
    knowreply_api_token: ''
  });
  const [availableAgents, setAvailableAgents] = useState<Agent[]>([]);
  const [mcpEndpoints, setMCPEndpoints] = useState<MCPEndpoint[]>([]);
  const [agentConfigs, setAgentConfigs] = useState<AgentConfig[]>([]);
  const [agentEmailMappings, setAgentEmailMappings] = useState<AgentEmailMapping[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [currentEmailInput, setCurrentEmailInput] = useState<Record<string, string>>({});

  const handleEmailInputChange = (agentId: string, value: string) => {
    setCurrentEmailInput(prev => ({ ...prev, [agentId]: value }));
  };

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

  const loadConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('workspace_configs')
        .select('knowreply_api_token')
        .eq('user_id', user?.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setConfig(data);
      }

      // Load existing agent configurations
      await loadAgentConfigs();
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

  const loadAgentConfigs = async () => {
    try {
      const { data, error } = await supabase
        .from('knowreply_agent_mcp_mappings')
        .select('*')
        .eq('user_id', user?.id);

      if (error) throw error;

      // Fetch Agent Email Mappings
      const { data: emailData, error: emailError } = await supabase
        .from('agent_email_mappings')
        .select('id, agent_id, email_address')
        .eq('user_id', user?.id);
      if (emailError) throw emailError;
      setAgentEmailMappings(emailData || []);

      // Group mappings by agent_id
      const configMap = new Map<string, AgentConfig>();
      
      data?.forEach(mapping => {
        if (!configMap.has(mapping.agent_id)) {
          const currentAgentEmails = (emailData || [])
            .filter(emailMapping => emailMapping.agent_id === mapping.agent_id)
            .map(emailMapping => emailMapping.email_address);
          configMap.set(mapping.agent_id, {
            agent_id: mapping.agent_id,
            agent_name: '', // Will be filled when agents are loaded
            enabled: true,
            mcp_endpoints: [],
            email_addresses: currentAgentEmails,
            email_errors: [],
          });
        }
        
        if (mapping.active) {
          configMap.get(mapping.agent_id)!.mcp_endpoints.push(mapping.mcp_endpoint_id);
        }
      });

      // Ensure agents from emailData are also included even if they don't have MCP mappings
      (emailData || []).forEach(emailMapping => {
        if (!configMap.has(emailMapping.agent_id)) {
          const agent = availableAgents.find(a => a.id === emailMapping.agent_id) // availableAgents should be loaded before this or concurrently
          configMap.set(emailMapping.agent_id, {
            agent_id: emailMapping.agent_id,
            agent_name: agent?.name || 'Unknown Agent', // Attempt to get name
            enabled: true, // Or determine based on some logic if necessary
            mcp_endpoints: [],
            email_addresses: [emailMapping.email_address],
            email_errors: [],
          });
        } else {
          // If agent already in configMap (from MCP mappings), ensure email is added if not present
          const existingConfig = configMap.get(emailMapping.agent_id)!;
          if (!existingConfig.email_addresses.includes(emailMapping.email_address)) {
            existingConfig.email_addresses.push(emailMapping.email_address);
          }
        }
      });

      // Update agent names for configs that might have been created solely from emailData
      // This part might need adjustment based on when availableAgents are populated.
      // If availableAgents isn't populated yet, agent_name might remain 'Unknown Agent' until fetchAgents completes.
      // Consider moving the agent_name population logic to after fetchAgents if it's an issue.
      configMap.forEach((config) => {
        if (config.agent_name === 'Unknown Agent' || config.agent_name === '') {
           const agentDetails = availableAgents.find(a => a.id === config.agent_id);
           if (agentDetails) {
             config.agent_name = agentDetails.name;
             config.agent_role = agentDetails.role;
           }
        }
      });


      setAgentConfigs(Array.from(configMap.values()));
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error('Error loading agent configs:', error);
    }
  };

  const fetchAgents = async () => {
    if (!config.knowreply_api_token) return;

    setLoadingAgents(true);
    setFetchError(null);
    
    try {
      const response = await fetch(KNOWREPLY_GET_AGENTS_URL, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${config.knowreply_api_token}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `HTTP ${response.status}`;
        
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error || errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }
        
        throw new Error(errorMessage);
      }

      const agents = await response.json();
      
      if (Array.isArray(agents)) {
        setAvailableAgents(agents);
        
        // Update agent names in existing configs
        setAgentConfigs(prev => prev.map(config => {
          const agent = agents.find(a => a.id === config.agent_id);
          return {
            ...config,
            agent_name: agent?.name || config.agent_name,
            agent_role: agent?.role
          };
        }));
      } else {
        throw new Error('Invalid response format - expected array of agents');
      }
    } catch (error) {
      console.error('Detailed fetch error:', error);
      
      let errorMessage = 'Failed to fetch agents';
      if (error instanceof Error) {
        errorMessage = error.message;
        setFetchError(error.message);
      }

      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
      setAvailableAgents([]);
    } finally {
      setLoadingAgents(false);
    }
  };

  const addAgent = (agent: Agent) => {
    const exists = agentConfigs.find(config => config.agent_id === agent.id);
    if (exists) {
      toast({
        title: "Agent Already Added",
        description: `${agent.name} is already configured`,
        variant: "destructive",
      });
      return;
    }

    const newConfig: AgentConfig = {
      agent_id: agent.id,
      agent_name: agent.name,
      agent_role: agent.role,
      enabled: true,
      mcp_endpoints: [],
      email_addresses: [],
      email_errors: [],
    };

    setAgentConfigs(prev => [...prev, newConfig]);
    setHasUnsavedChanges(true);
    
    toast({
      title: "Agent Added",
      description: `${agent.name} has been added. Don't forget to save your configuration.`,
    });
  };

  const removeAgent = (agentId: string) => {
    setAgentConfigs(prev => prev.filter(config => config.agent_id !== agentId));
    setHasUnsavedChanges(true);
  };

  const toggleAgentEnabled = (agentId: string) => {
    setAgentConfigs(prev => prev.map(config => 
      config.agent_id === agentId 
        ? { ...config, enabled: !config.enabled }
        : config
    ));
    setHasUnsavedChanges(true);
  };

  const toggleMCPForAgent = (agentId: string, mcpEndpointId: string) => {
    setAgentConfigs(prev => prev.map(config => {
      if (config.agent_id !== agentId) return config;
      
      const endpoints = config.mcp_endpoints.includes(mcpEndpointId)
        ? config.mcp_endpoints.filter(id => id !== mcpEndpointId)
        : [...config.mcp_endpoints, mcpEndpointId];
      
      return { ...config, mcp_endpoints: endpoints };
    }));
    setHasUnsavedChanges(true);
  };

  const saveConfiguration = async () => {
    if (!user) return;

    setSaving(true);
    try {
      // Validate Email Addresses
      const allEmailsFromEnabledAgents: string[] = [];
      for (const agentConfig of agentConfigs) {
        if (agentConfig.enabled) {
          if (!agentConfig.email_addresses || agentConfig.email_addresses.length === 0) {
            toast({
              title: "Validation Error",
              description: `Agent "${agentConfig.agent_name}" is enabled but has no email addresses assigned. Please add at least one email or disable the agent.`,
              variant: "destructive",
            });
            setSaving(false);
            return;
          }
          agentConfig.email_addresses.forEach(email => {
            if (allEmailsFromEnabledAgents.includes(email.toLowerCase())) {
              toast({
                title: "Validation Error",
                description: `Email address "${email}" is used by multiple enabled agents. Each email must be unique across all enabled agents.`,
                variant: "destructive",
              });
              setSaving(false);
              return;
            }
            allEmailsFromEnabledAgents.push(email.toLowerCase());
          });
        }
      }
      // Re-check for duplicates after collecting all emails, in case an agent has the same email twice (UI should prevent this though)
      const emailCounts = allEmailsFromEnabledAgents.reduce((acc, email) => {
        acc[email] = (acc[email] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const duplicateEmails = Object.entries(emailCounts).filter(([_, count]) => count > 1).map(([email]) => email);
      if (duplicateEmails.length > 0) {
        toast({
          title: "Validation Error",
          description: `The following email addresses are duplicated: ${duplicateEmails.join(', ')}. Each email must be unique.`,
          variant: "destructive",
        });
        setSaving(false);
        return;
      }


      // Check if workspace config exists first
      const { data: existingConfig } = await supabase
        .from('workspace_configs')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (existingConfig) {
        // Update existing record
        const { error: configError } = await supabase
          .from('workspace_configs')
          .update({
            knowreply_api_token: config.knowreply_api_token,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', user.id);

        if (configError) throw configError;
      } else {
        // Insert new record
        const { error: configError } = await supabase
          .from('workspace_configs')
          .insert({
            user_id: user.id,
            knowreply_api_token: config.knowreply_api_token,
            updated_at: new Date().toISOString()
          });

        if (configError) throw configError;
      }

      // Clear existing mappings
      const { error: deleteError } = await supabase
        .from('knowreply_agent_mcp_mappings')
        .delete()
        .eq('user_id', user.id);

      if (deleteError) throw deleteError;

      // Insert new mappings
      const mappings = [];
      for (const agentConfig of agentConfigs) {
        if (!agentConfig.enabled) continue;
        
        if (agentConfig.mcp_endpoints.length === 0) {
          // Create mapping for agent with no MCP endpoints
          mappings.push({
            user_id: user.id,
            agent_id: agentConfig.agent_id,
            mcp_endpoint_id: null,
            active: true
          });
        } else {
          // Create mappings for each MCP endpoint
          for (const mcpEndpointId of agentConfig.mcp_endpoints) {
            mappings.push({
              user_id: user.id,
              agent_id: agentConfig.agent_id,
              mcp_endpoint_id: mcpEndpointId,
              active: true
            });
          }
        }
      }

      if (mappings.length > 0) {
        const { error: insertError } = await supabase
          .from('knowreply_agent_mcp_mappings')
          .insert(mappings);

        if (insertError) throw insertError;
      }

      // --- Manage Agent Email Mappings ---
      // Delete all existing email mappings for the user
      const { error: deleteEmailError } = await supabase
        .from('agent_email_mappings')
        .delete()
        .eq('user_id', user.id);

      if (deleteEmailError) throw deleteEmailError;

      // Prepare and insert new email mappings
      const newEmailMappings = [];
      for (const agentConfig of agentConfigs) {
        if (agentConfig.enabled && agentConfig.email_addresses) {
          for (const email of agentConfig.email_addresses) {
            if (email && email.trim() !== "") { // Ensure email is not empty
              newEmailMappings.push({
                user_id: user.id,
                agent_id: agentConfig.agent_id,
                email_address: email.toLowerCase(),
              });
            }
          }
        }
      }

      if (newEmailMappings.length > 0) {
        const { error: insertEmailError } = await supabase
          .from('agent_email_mappings')
          .insert(newEmailMappings);
        if (insertEmailError) throw insertEmailError;
      }
      // --- End Manage Agent Email Mappings ---

      setHasUnsavedChanges(false);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const availableAgentsToAdd = availableAgents.filter(
    agent => !agentConfigs.find(config => config.agent_id === agent.id)
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-3xl font-bold text-gray-900">KnowReply Setup</h1>
        <p className="text-gray-600 mt-2">
          Configure multiple KnowReply AI agents with individual MCP endpoint access
        </p>
      </div>

      {/* Unsaved Changes Warning */}
      {hasUnsavedChanges && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-orange-700">
              <AlertCircle className="h-5 w-5" />
              <span className="font-medium">You have unsaved changes</span>
              <Button 
                onClick={saveConfiguration} 
                disabled={saving}
                size="sm"
                className="ml-auto"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Save Now
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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
              onChange={(e) => {
                setConfig({ ...config, knowreply_api_token: e.target.value });
                setHasUnsavedChanges(true);
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Agent Configuration */}
      {config.knowreply_api_token && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              Agent Configuration
            </CardTitle>
            <CardDescription>
              Add agents and configure which MCP endpoints each can access
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {loadingAgents ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                <span>Loading agents...</span>
              </div>
            ) : fetchError ? (
              <div className="text-center py-8">
                <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
                <p className="text-red-600 mb-4">{fetchError}</p>
                <Button variant="outline" onClick={fetchAgents}>
                  Retry Connection
                </Button>
              </div>
            ) : (
              <>
                {/* Add New Agent */}
                {availableAgentsToAdd.length > 0 && (
                  <div>
                    <Label className="text-sm font-medium mb-3 block">Add Agents</Label>
                    <div className="grid gap-3">
                      {availableAgentsToAdd.map((agent) => (
                        <div key={agent.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div>
                            <div className="font-medium">{agent.name}</div>
                            {agent.role && (
                              <div className="text-sm text-gray-500">{agent.role}</div>
                            )}
                          </div>
                          <Button size="sm" onClick={() => addAgent(agent)}>
                            <Plus className="h-4 w-4 mr-1" />
                            Add Agent
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Configured Agents */}
                {agentConfigs.length > 0 && (
                  <div>
                    <Label className="text-sm font-medium mb-3 block">Configured Agents</Label>
                    <div className="space-y-4">
                      {agentConfigs.map((agentConfig) => (
                        <Card key={agentConfig.agent_id} className="p-4">
                          <div className="space-y-4">
                            {/* Agent Header */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <Checkbox
                                  checked={agentConfig.enabled}
                                  onCheckedChange={() => toggleAgentEnabled(agentConfig.agent_id)}
                                />
                                <div>
                                  <div className="font-medium">{agentConfig.agent_name}</div>
                                  {agentConfig.agent_role && (
                                    <div className="text-sm text-gray-500">{agentConfig.agent_role}</div>
                                  )}
                                </div>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => removeAgent(agentConfig.agent_id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>

                            {/* MCP Endpoints */}
                            {agentConfig.enabled && mcpEndpoints.length > 0 && (
                              <div>
                                <Label className="text-sm font-medium mb-2 block">MCP Endpoints</Label>
                                <div className="grid gap-2">
                                  {mcpEndpoints.map((endpoint) => (
                                    <div key={endpoint.id} className="flex items-center space-x-3 p-2 border rounded">
                                      <Checkbox
                                        checked={agentConfig.mcp_endpoints.includes(endpoint.id)}
                                        onCheckedChange={() => toggleMCPForAgent(agentConfig.agent_id, endpoint.id)}
                                      />
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                          <span className="text-sm font-medium">{endpoint.name}</span>
                                          <Badge variant="outline" className="text-xs">{endpoint.category}</Badge>
                                        </div>
                                        {endpoint.instructions && (
                                          <p className="text-xs text-gray-500 mt-1">{endpoint.instructions}</p>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {agentConfig.enabled && mcpEndpoints.length === 0 && (
                              <div className="text-sm text-gray-500 p-3 bg-gray-50 rounded">
                                No MCP endpoints configured. Set up MCP endpoints first to connect them to agents.
                              </div>
                            )}

                            {/* Email Addresses Configuration */}
                            {agentConfig.enabled && (
                              <div className="pt-4 mt-4 border-t">
                                <Label className="text-sm font-medium mb-2 block">Associated Email Addresses</Label>
                                <div className="flex items-center gap-2 mb-2">
                                  <Input
                                    type="email"
                                    placeholder="Enter email address"
                                    value={currentEmailInput[agentConfig.agent_id] || ''}
                                    onChange={(e) => handleEmailInputChange(agentConfig.agent_id, e.target.value)}
                                    className="flex-grow"
                                  />
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      const emailToAdd = (currentEmailInput[agentConfig.agent_id] || '').trim().toLowerCase();
                                      if (!emailToAdd) return;

                                      // Basic email validation
                                      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                                      if (!emailRegex.test(emailToAdd)) {
                                        toast({ title: "Invalid Email", description: "Please enter a valid email address.", variant: "destructive" });
                                        return;
                                      }

                                      if (agentConfig.email_addresses.includes(emailToAdd)) {
                                        toast({ title: "Duplicate Email", description: "This email address is already added for this agent.", variant: "destructive" });
                                        return;
                                      }

                                      setAgentConfigs(prev => prev.map(ac =>
                                        ac.agent_id === agentConfig.agent_id
                                          ? { ...ac, email_addresses: [...ac.email_addresses, emailToAdd] }
                                          : ac
                                      ));
                                      handleEmailInputChange(agentConfig.agent_id, '');
                                      setHasUnsavedChanges(true);
                                    }}
                                  >
                                    Add Email
                                  </Button>
                                </div>
                                <div className="space-y-2">
                                  {agentConfig.email_addresses.map((email) => (
                                    <div key={email} className="flex items-center justify-between p-2 border rounded-md bg-gray-50">
                                      <span className="text-sm text-gray-700">{email}</span>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => {
                                          setAgentConfigs(prev => prev.map(ac =>
                                            ac.agent_id === agentConfig.agent_id
                                              ? { ...ac, email_addresses: ac.email_addresses.filter(e => e !== email) }
                                              : ac
                                          ));
                                          setHasUnsavedChanges(true);
                                        }}
                                        className="text-gray-500 hover:text-red-500"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  ))}
                                  {agentConfig.email_addresses.length === 0 && (
                                    <p className="text-xs text-gray-500 text-center py-2">No email addresses associated with this agent yet.</p>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {agentConfigs.length === 0 && availableAgents.length > 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <Brain className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No agents configured yet. Add agents above to get started.</p>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Save Configuration */}
      <div className="flex justify-end">
        <Button 
          onClick={saveConfiguration} 
          disabled={saving || !hasUnsavedChanges} 
          size="lg"
          className={hasUnsavedChanges ? 'bg-orange-600 hover:bg-orange-700' : ''}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          {hasUnsavedChanges ? 'Save Configuration' : 'Configuration Saved'}
        </Button>
      </div>

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
            <h4 className="font-medium text-blue-900 mb-2">Multi-Agent Configuration:</h4>
            <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
              <li>Enter your KnowReply API token</li>
              <li>Add the agents you want to use for email processing</li>
              <li>Configure which MCP endpoints each agent can access (optional)</li>
              <li>Enable/disable agents as needed</li>
              <li><strong>Click "Save Configuration" to apply your changes</strong></li>
            </ol>
          </div>

          <div className="space-y-2">
            <Button variant="outline" className="w-full justify-between" asChild>
              <a href="https://knowreply.com/dashboard" target="_blank" rel="noopener noreferrer">
                KnowReply Dashboard
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
