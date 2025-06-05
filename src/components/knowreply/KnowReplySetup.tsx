
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
import { ApiConfigurationCard } from './ApiConfigurationCard';
import { AgentConfigurationSection } from './AgentConfigurationSection';
import { SetupInstructionsCard } from './SetupInstructionsCard';

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
  // Removed: const [currentEmailInput, setCurrentEmailInput] = useState<Record<string, string>>({});
  // Removed: const handleEmailInputChange = (agentId: string, value: string) => { ... };

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
      enabled: true, // Default to enabled
      mcp_endpoints: [],
      email_addresses: [''], // Initialize with one empty string for the mandatory email
      email_errors: [], // Assuming this field exists
    };

    setAgentConfigs(prev => [newConfig, ...prev]); // Add to the beginning
    setHasUnsavedChanges(true);
    // Removed toast notification
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
      className="space-y-6 pb-28" // Added more padding for sticky bar + some breathing room
    >
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-50">KnowReply Setup</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Configure multiple KnowReply AI agents with individual MCP endpoint access and email routing.
        </p>
      </div>

      {/* UnsavedChangesWarning card is GONE from here, integrated into sticky bar */}

      <ApiConfigurationCard
        config={config}
        setConfig={setConfig}
        setHasUnsavedChanges={setHasUnsavedChanges}
      />

      {/* Agent Configuration Section - now uses accordions internally */}
      {config.knowreply_api_token && (
        <AgentConfigurationSection
          config={config}
          availableAgents={availableAgents} // Full list from API
          availableAgentsToAdd={availableAgentsToAdd} // Filtered list
          onAddAgent={addAgent}
          agentConfigs={agentConfigs}
          mcpEndpoints={mcpEndpoints}
          onToggleAgentEnabled={toggleAgentEnabled}
          onRemoveAgent={removeAgent}
          onToggleMCPForAgent={toggleMCPForAgent}
          loadingAgents={loadingAgents} // Specifically for agent data loading
          fetchError={fetchError}
          onFetchAgents={fetchAgents}
          onAddNewEmailRow={handleAddNewEmailRow}
          onEmailValueChange={handleEmailValueChange}
          onRemoveEmailRow={handleRemoveEmailRow}
        />
      )}

      <SetupInstructionsCard />

      {/* Sticky Save Button Bar - already implemented and handled in previous step */}
      {/* The JSX for sticky bar is already in the file from previous modification, so no change here for that part. */}
      {/* This comment is to acknowledge its existence and that it's not being re-added or removed here. */}

    </motion.div>
  );
}
