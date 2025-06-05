
import { useState, useEffect, useCallback } from 'react'; // Added useCallback
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
  const [configuringAgentId, setConfiguringAgentId] = useState<string | null>(null);

  const handleAddNewEmailRow = (agentId: string) => {
    setAgentConfigs(prevAgentConfigs =>
      prevAgentConfigs.map(ac =>
        ac.agent_id === agentId
          ? { ...ac, email_addresses: [...(ac.email_addresses || []), ''] }
          : ac
      )
    );
    setHasUnsavedChanges(true);
  };

  const handleEmailValueChange = (agentId: string, emailIndex: number, newValue: string) => {
    setAgentConfigs(prevAgentConfigs =>
      prevAgentConfigs.map(ac => {
        if (ac.agent_id === agentId) {
          const updatedEmails = [...ac.email_addresses];
          updatedEmails[emailIndex] = newValue;
          return { ...ac, email_addresses: updatedEmails };
        }
        return ac;
      })
    );
    setHasUnsavedChanges(true);
  };

  const handleRemoveEmailRow = (agentId: string, emailIndex: number) => {
    setAgentConfigs(prevAgentConfigs =>
      prevAgentConfigs.map(ac => {
        if (ac.agent_id === agentId) {
          const updatedEmails = ac.email_addresses.filter((_, idx) => idx !== emailIndex);
          return { ...ac, email_addresses: updatedEmails };
        }
        return ac;
      })
    );
    setHasUnsavedChanges(true);
  };

  // Main data loading useEffect:
  useEffect(() => {
    if (user && !hasUnsavedChanges) {
      console.log('useEffect (main data load): Conditions met, calling loadConfig and loadMCPEndpoints.');
      loadConfig();
      loadMCPEndpoints();
    } else if (user && hasUnsavedChanges) {
      console.log('useEffect (main data load): User present, but skipping data load due to unsaved changes.');
    } else if (!user) {
      console.log('useEffect (main data load): No user, clearing data and resetting states.');
      setConfig({ knowreply_api_token: '' });
      setAgentConfigs([]);
      setAvailableAgents([]);
      setMCPEndpoints([]);
      setAgentEmailMappings([]);
      setHasUnsavedChanges(false);
      setLoading(false);
      setFetchError(null);
    }
  }, [user, hasUnsavedChanges, loadConfig, loadMCPEndpoints]);

  const loadAgentConfigs = useCallback(async () => {
    if (!user?.id) {
      console.log('loadAgentConfigs: No user, skipping.');
      setAgentConfigs([]);
      setAgentEmailMappings([]);
      return;
    }
    console.log('loadAgentConfigs: Fetching...');
    try {
      const { data: mcpMappingData, error: mcpError } = await supabase
        .from('knowreply_agent_mcp_mappings')
        .select('*')
        .eq('user_id', user.id);
      if (mcpError) throw mcpError;

      const { data: emailData, error: emailError } = await supabase
        .from('agent_email_mappings')
        .select('id, agent_id, email_address, agent_name') // agent_name is fetched
        .eq('user_id', user.id);
      if (emailError) throw emailError;
      setAgentEmailMappings(emailData || []);

      const configMap = new Map<string, AgentConfig>();

      (mcpMappingData || []).forEach(mapping => {
        if (!configMap.has(mapping.agent_id)) {
          const currentAgentEmails = (emailData || [])
            .filter(em => em.agent_id === mapping.agent_id)
            .map(em => em.email_address);
          const agentNameFromEmailMapping = (emailData || []).find(em => em.agent_id === mapping.agent_id)?.agent_name;

          configMap.set(mapping.agent_id, {
            agent_id: mapping.agent_id,
            agent_name: agentNameFromEmailMapping || '', // Use name from email_mapping or set to be filled by fetchAgents
            agent_role: '', // To be filled by fetchAgents
            enabled: mapping.enabled !== undefined ? mapping.enabled : true, // Default to true if not specified
            mcp_endpoints: [],
            email_addresses: currentAgentEmails,
            email_errors: [],
          });
        }
        // Assuming 'enabled' field on mcp_mapping row refers to the agent's enabled state for that MCP link,
        // or overall enabled state. The AgentConfig.enabled is the agent's general enabled state.
        // Let's assume mapping.enabled refers to the agent's enabled status for this configuration context.
        // If mcp_endpoint_id is present, add it.
        if (mapping.mcp_endpoint_id) { // The original code used mapping.active here. Assuming it's just mapping.mcp_endpoint_id existence.
             configMap.get(mapping.agent_id)!.mcp_endpoints.push(mapping.mcp_endpoint_id);
        }
      });

      (emailData || []).forEach(emailMapping => {
        if (!configMap.has(emailMapping.agent_id)) {
          configMap.set(emailMapping.agent_id, {
            agent_id: emailMapping.agent_id,
            agent_name: emailMapping.agent_name || '',
            agent_role: '',
            enabled: true,
            mcp_endpoints: [],
            email_addresses: [emailMapping.email_address],
            email_errors: [],
          });
        } else {
          const existingCfg = configMap.get(emailMapping.agent_id)!;
          if (!existingCfg.email_addresses.includes(emailMapping.email_address)) {
            existingCfg.email_addresses.push(emailMapping.email_address);
          }
          if (!existingCfg.agent_name && emailMapping.agent_name) {
            existingCfg.agent_name = emailMapping.agent_name;
          }
        }
      });

      // `fetchAgents` will be responsible for updating names based on API results.
      const finalConfigs = Array.from(configMap.values()).map(ac => ({
        ...ac,
        email_addresses: (ac.email_addresses && ac.email_addresses.length > 0) ? ac.email_addresses : [''],
      }));
      setAgentConfigs(finalConfigs);
      // setHasUnsavedChanges(false); // CRITICAL: loadAgentConfigs should NOT reset this.
    } catch (error) {
      console.error('Error loading agent configurations:', error);
      toast({ title: "Error", description: "Failed to load agent configurations.", variant: "destructive" });
    } // This is the correct closing brace for the try-catch block
  }, [user?.id, toast, setAgentConfigs, setAgentEmailMappings, availableAgents]); // availableAgents is used in name consolidation

  const loadMCPEndpoints = useCallback(async () => {
    if (!user?.id) {
      // console.log('loadMCPEndpoints: No user, skipping.'); // Already logged by loadConfig if that's the entry point
      setMCPEndpoints([]);
      return;
    }
    // console.log('loadMCPEndpoints: Fetching...'); // Can be verbose, loadConfig logs entry
    try {
      const { data, error } = await supabase
        .from('mcp_endpoints')
        .select('*')
        .eq('user_id', user.id)
        .eq('active', true);

      if (error) throw error;
      setMCPEndpoints(data || []);
    } catch (error) {
      console.error('Error loading MCP endpoints:', error);
      toast({ title: "Error", description: "Failed to load MCP endpoints.", variant: "destructive" });
    }
  }, [user?.id, toast, setMCPEndpoints]);


  const loadConfig = useCallback(async () => {
    console.log('loadConfig: Attempting to load main workspace configuration...');
    setLoading(true);
    try {
      if (!user?.id) {
        console.log('loadConfig: No user, skipping load.');
        setLoading(false);
        setConfig({ knowreply_api_token: '' });
        setAgentConfigs([]);
        setAvailableAgents([]);
        setAgentEmailMappings([]); // Clear email mappings too
        // setHasUnsavedChanges(false); // Should be done by the main useEffect when user is null
        return;
      }
      const { data, error } = await supabase
        .from('workspace_configs')
        .select('knowreply_api_token')
        .eq('user_id', user.id) // Use user.id directly as it's checked
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 means no row, which is fine.
        throw error;
      }

      if (data) {
        setConfig(data);
      } else {
        // No existing workspace_config row for this user. Reset to default.
        setConfig({ knowreply_api_token: '' });
      }

      // Load agent-specific configurations (MCP mappings, email mappings)
      await loadAgentConfigs();
    } catch (error) {
      console.error('Error loading config:', error);
      toast({
        title: "Error",
        description: "Failed to load KnowReply configuration",
        variant: "destructive",
      });
      // Reset to defaults on error to avoid partial inconsistent state
      setConfig({ knowreply_api_token: '' });
      setAgentConfigs([]);
      setAvailableAgents([]);
      setAgentEmailMappings([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id, toast, setConfig, setLoading, setAgentConfigs, setAvailableAgents, setAgentEmailMappings, loadAgentConfigs, setHasUnsavedChanges]);

  // Ensure the duplicate plain async functions for loadMCPEndpoints and loadAgentConfigs are removed.
  // The useCallback versions are defined above and are the correct ones to use.
  // The fetchAgents function below is already correctly wrapped in useCallback.

  const fetchAgents = useCallback(async () => {
    if (!config.knowreply_api_token) {
      setAvailableAgents([]); // Clear available agents if no token
      return;
    }
    // console.log('fetchAgents: Fetching agents...'); // Optional: for debugging
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
  }, [config.knowreply_api_token, toast, setAvailableAgents, setAgentConfigs, setLoadingAgents, setFetchError]); // Dependencies for fetchAgents

  // useEffect for fetching agents based on API token (from main config)
  useEffect(() => {
    if (config.knowreply_api_token) {
        fetchAgents();
    } else {
        // If token is removed, clear agents. fetchAgents itself also does this.
        setAvailableAgents([]);
    }
  }, [config.knowreply_api_token, fetchAgents]); // Corrected dependencies: fetchAgents is stable

  const handleConfigureAgent = (agentFromApi: Agent) => {
    setConfiguringAgentId(agentFromApi.id);
    const existingConfig = agentConfigs.find(ac => ac.agent_id === agentFromApi.id);
    if (!existingConfig) {
      const newConfigData: AgentConfig = {
        agent_id: agentFromApi.id,
        agent_name: agentFromApi.name,
        agent_role: agentFromApi.role,
        enabled: true, // Default to enabled
        mcp_endpoints: [],
        email_addresses: [''], // Default with one empty email input row
        email_errors: [],
      };
      setAgentConfigs(prev => {
        const filtered = prev.filter(ac => ac.agent_id !== agentFromApi.id);
        return [newConfigData, ...filtered];
      });
      setHasUnsavedChanges(true);
    }
  };

  const removeAgentFromConfig = (agentIdToRemove: string) => {
    setAgentConfigs(prev => prev.filter(config => config.agent_id !== agentIdToRemove));
    if (configuringAgentId === agentIdToRemove) {
      setConfiguringAgentId(null);
    }
    setHasUnsavedChanges(true);
  };
  // Old addAgent function is removed.

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
      // 1. Process and Filter Email Addresses from inputs
      let allEnabledAgentEmailsForUniquenessCheck: string[] = [];
      let formatValidationFailed = false;
      let agentMissingEmails = false;
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // Basic email format regex

      const processedAgentConfigs = agentConfigs.map(ac => {
        if (!ac.enabled) {
          return { ...ac, processed_email_addresses: [] }; // No emails to validate or save if not enabled
        }
        const filteredEmails = (ac.email_addresses || [])
          .map(email => email.trim())
          .filter(email => email !== '');

        return { ...ac, processed_email_addresses: filteredEmails };
      });

      // 2. Perform Validations
      for (const ac of processedAgentConfigs) {
        if (ac.enabled) {
          if (ac.processed_email_addresses.length === 0) {
            agentMissingEmails = true;
            // Update ac.email_errors here if UI needs to show error on specific agent.
            // For now, global toast is primary.
          }
          ac.processed_email_addresses.forEach(email => {
            if (!emailRegex.test(email)) {
              formatValidationFailed = true;
              // Update ac.email_errors for specific email if needed for UI.
            }
            // For uniqueness check, collect them all, then check.
            allEnabledAgentEmailsForUniquenessCheck.push(email.toLowerCase());
          });
        }
      }

      if (agentMissingEmails) {
        toast({ title: "Validation Error", description: "Each enabled agent must have at least one valid (non-empty) email address.", variant: "destructive" });
        setSaving(false);
        return;
      }

      if (formatValidationFailed) {
        toast({ title: "Validation Error", description: "One or more email addresses are not in a valid format. Please correct them.", variant: "destructive" });
        setSaving(false);
        return;
      }

      // Uniqueness Check (on lowercase, trimmed, non-empty emails)
      const emailCounts = allEnabledAgentEmailsForUniquenessCheck.reduce((acc, email) => {
        acc[email] = (acc[email] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const duplicateEmails = Object.entries(emailCounts).filter(([_, count]) => count > 1).map(([email]) => email);
      if (duplicateEmails.length > 0) {
        toast({
          title: "Validation Error",
          description: `Duplicate email addresses found: ${duplicateEmails.join(', ')}. Emails must be unique across all enabled agents.`,
          variant: "destructive",
        });
        setSaving(false);
        return;
      }

      // --- All email validations passed ---

      // Check if workspace config exists first (for knowreply_api_token)
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

      // Prepare and insert new email mappings using processedAgentConfigs
      const newEmailMappings = [];
      for (const agentConfig of processedAgentConfigs) { // Use processed configs
        if (agentConfig.enabled && agentConfig.processed_email_addresses) {
          for (const email of agentConfig.processed_email_addresses) { // Iterate over filtered, non-empty emails
            newEmailMappings.push({
              user_id: user.id,
              agent_id: agentConfig.agent_id,
              email_address: email.toLowerCase(), // Already trimmed, now lowercase
              agent_name: agentConfig.agent_name || null
            });
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

      toast({
        title: "Success",
        description: "KnowReply configuration saved successfully",
      });
      setHasUnsavedChanges(false); // This change will be picked up by the main data loading useEffect.
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

  // const availableAgentsToAdd = availableAgents.filter( // This will be removed from JSX
  //   agent => !agentConfigs.find(config => config.agent_id === agent.id)
  // );

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
              <div className="space-y-4">
                <Label className="text-base font-semibold mb-3 block">Manage Your KnowReply Agents</Label>
                {availableAgents.length === 0 && !loadingAgents && (
                   <p className="text-center text-gray-500 py-4">No agents available from KnowReply API. Check your API token or add agents in KnowReply.</p>
                )}
                {availableAgents.map((agentFromApi) => {
                  const agentConfig = agentConfigs.find(ac => ac.agent_id === agentFromApi.id);
                  const isCurrentlyConfiguring = configuringAgentId === agentFromApi.id;

                  return (
                    <Card key={agentFromApi.id} className={`p-4 transition-all duration-300 ease-in-out ${isCurrentlyConfiguring ? 'shadow-lg border-orange-500 ring-1 ring-orange-500' : 'border-gray-200'}`}>
                      {!isCurrentlyConfiguring ? (
                        // Summary View
                        <div className="flex items-center justify-between">
                           <div>
                            <h3 className="font-medium">{agentFromApi.name}</h3>
                            {agentFromApi.role && <p className="text-sm text-gray-500">{agentFromApi.role}</p>}
                            {agentConfig && (
                                <Badge variant={agentConfig.enabled ? "default" : "outline"} className={`mt-1 ${agentConfig.enabled ? 'bg-green-100 text-green-700 border-green-300' : 'text-gray-600 border-gray-300'}`}>
                                {agentConfig.enabled ? "Enabled" : "Disabled"}
                                </Badge>
                            )}
                             {!agentConfig && (
                                <Badge variant="outline" className="mt-1 text-gray-500 border-gray-300">Not Configured</Badge>
                             )}
                          </div>
                          <Button size="sm" variant="outline" onClick={() => handleConfigureAgent(agentFromApi)}>
                            {agentConfig ? "Edit Configuration" : "Configure Agent"}
                          </Button>
                        </div>
                      ) : (
                        // Expanded Configuration View (ensure agentConfig exists due to handleConfigureAgent logic)
                        agentConfig && (
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <h3 className="font-semibold text-lg text-orange-700">{agentConfig.agent_name}</h3>
                                {agentConfig.agent_role && <p className="text-sm text-gray-500">{agentConfig.agent_role}</p>}
                              </div>
                              <div className="flex items-center gap-2">
                                 <Button variant="outline" size="sm" onClick={() => setConfiguringAgentId(null)}>Done</Button>
                                 <Button variant="ghost" size="icon" title="Remove Agent from Configuration" onClick={() => removeAgentFromConfig(agentFromApi.id)}>
                                    <Trash2 className="h-4 w-4 text-red-500" />
                                 </Button>
                              </div>
                            </div>

                            <div className="flex items-center space-x-2 pt-2">
                              <Checkbox
                                id={`enable-${agentConfig.agent_id}`}
                                checked={agentConfig.enabled}
                                onCheckedChange={() => toggleAgentEnabled(agentConfig.agent_id)}
                              />
                              <Label htmlFor={`enable-${agentConfig.agent_id}`} className="text-sm font-medium">
                                Enable Agent for Email Processing
                              </Label>
                            </div>

                            {agentConfig.enabled && mcpEndpoints.length > 0 && (
                              <div className="pt-2">
                                <Label className="text-sm font-medium mb-2 block">MCP Endpoints</Label>
                                <div className="grid gap-2 max-h-48 overflow-y-auto pr-2"> {/* Added max-height and scroll */}
                                  {mcpEndpoints.map((endpoint) => (
                                    <div key={endpoint.id} className="flex items-center space-x-3 p-2 border rounded">
                                      <Checkbox
                                        id={`mcp-${agentConfig.agent_id}-${endpoint.id}`}
                                        checked={agentConfig.mcp_endpoints.includes(endpoint.id)}
                                        onCheckedChange={() => toggleMCPForAgent(agentConfig.agent_id, endpoint.id)}
                                      />
                                      <div className="flex-1">
                                        <Label htmlFor={`mcp-${agentConfig.agent_id}-${endpoint.id}`} className="text-sm font-medium">{endpoint.name}</Label>
                                        <Badge variant="outline" className="text-xs ml-2">{endpoint.category}</Badge>
                                        {endpoint.instructions && <p className="text-xs text-gray-500 mt-1">{endpoint.instructions}</p>}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {agentConfig.enabled && mcpEndpoints.length === 0 && (
                               <p className="text-xs text-gray-500 p-3 bg-gray-50 rounded">No MCP endpoints configured in this workspace yet.</p>
                            )}

                            {agentConfig.enabled && (
                              <div className="pt-4 mt-4 border-t">
                                <div className="flex justify-between items-center mb-2">
                                  <Label className="text-sm font-medium">Associated Email Addresses</Label>
                                  <Button size="xs" variant="outline" onClick={() => handleAddNewEmailRow(agentConfig.agent_id)} title="Add email field">
                                    <Plus className="h-3 w-3 mr-1" /> Add
                                  </Button>
                                </div>
                                <div className="space-y-2 max-h-40 overflow-y-auto pr-1"> {/* Scroll for emails */}
                                  {agentConfig.email_addresses.map((emailString, index) => (
                                    <div key={index} className="flex items-center gap-2">
                                      <Input
                                        type="email"
                                        placeholder="Enter email address"
                                        value={emailString}
                                        onChange={(e) => handleEmailValueChange(agentConfig.agent_id, index, e.target.value)}
                                        className="flex-grow h-8 text-sm"
                                      />
                                      <Button variant="ghost" size="icon" onClick={() => handleRemoveEmailRow(agentConfig.agent_id, index)} title="Remove email">
                                        <Trash2 className="h-4 w-4 text-gray-500 hover:text-red-500" />
                                      </Button>
                                    </div>
                                  ))}
                                  {agentConfig.email_addresses.length === 0 && (
                                    <p className="text-xs text-gray-500 text-center py-1">No email addresses yet. Click "Add" to assign one.</p>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      )}
                    </Card>
                  );
                })}
              </div>
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
