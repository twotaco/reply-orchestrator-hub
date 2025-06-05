import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button'; // For Retry button
import { Loader2, Brain, AlertCircle } from 'lucide-react';
import { AgentList } from './AgentList';
import { ConfiguredAgentsSection } from './ConfiguredAgentsSection';

// Assuming these interfaces are defined or imported from a common types file
interface KnowReplyConfig { // Needed to check if API token exists
  knowreply_api_token: string | null;
}

interface Agent {
  id: string;
  name: string;
  persona?: string;
  role?: string;
}

interface AgentConfig {
  agent_id: string;
  agent_name: string;
  agent_role?: string;
  enabled: boolean;
  mcp_endpoints: string[];
  email_addresses: string[];
}

interface MCPEndpoint {
  id: string;
  name: string;
  category: string;
  post_url: string;
  instructions?: string;
}

interface AgentConfigurationSectionProps {
  config: KnowReplyConfig; // To check if API token is present
  availableAgents: Agent[]; // Combined from availableAgents and agentConfigs to get full list for ConfiguredAgentsSection condition
  availableAgentsToAdd: Agent[];
  onAddAgent: (agent: Agent) => void;
  agentConfigs: AgentConfig[];
  mcpEndpoints: MCPEndpoint[];
  onToggleAgentEnabled: (agentId: string) => void;
  onRemoveAgent: (agentId: string) => void;
  onToggleMCPForAgent: (agentId: string, mcpEndpointId: string) => void;
  loadingAgents: boolean;
  fetchError: string | null;
  onFetchAgents: () => void; // Function to retry fetching agents
  onAddNewEmailRow: (agentId: string) => void;
  onEmailValueChange: (agentId: string, emailIndex: number, newValue: string) => void;
  onRemoveEmailRow: (agentId: string, emailIndex: number) => void;
}

export function AgentConfigurationSection({
  config,
  availableAgents,
  availableAgentsToAdd,
  onAddAgent,
  agentConfigs,
  mcpEndpoints,
  onToggleAgentEnabled,
  onRemoveAgent,
  onToggleMCPForAgent,
  loadingAgents,
  fetchError,
  onFetchAgents,
  onAddNewEmailRow,
  onEmailValueChange,
  onRemoveEmailRow,
}: AgentConfigurationSectionProps) {
  if (!config.knowreply_api_token) {
    return null; // Don't show this section if there's no API token
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-5 w-5" />
          Agent Configuration
        </CardTitle>
        <CardDescription>
          Add agents and configure which MCP endpoints each can access, and assign email addresses.
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
            <Button variant="outline" onClick={onFetchAgents}>
              Retry Connection
            </Button>
          </div>
        ) : (
          <>
            <AgentList
              availableAgentsToAdd={availableAgentsToAdd}
              onAddAgent={onAddAgent}
            />
            <ConfiguredAgentsSection
              agentConfigs={agentConfigs}
              mcpEndpoints={mcpEndpoints}
              availableAgents={availableAgents} // Pass the full list of available agents
              onToggleAgentEnabled={onToggleAgentEnabled}
              onRemoveAgent={onRemoveAgent}
              onToggleMCPForAgent={onToggleMCPForAgent}
              onAddNewEmailRow={onAddNewEmailRow}
              onEmailValueChange={onEmailValueChange}
              onRemoveEmailRow={onRemoveEmailRow}
            />
            {/* This explicit message for when no agents are available at all (even after successful fetch) */}
            { !loadingAgents && !fetchError && availableAgents.length === 0 && agentConfigs.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                    <Brain className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No agents found for your API token. Please check your KnowReply dashboard.</p>
                </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
