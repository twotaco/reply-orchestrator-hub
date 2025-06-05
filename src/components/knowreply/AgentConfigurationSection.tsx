import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Brain, AlertCircle } from 'lucide-react';
import { AvailableAgentsAccordion } from './AvailableAgentsAccordion'; // Updated import
import { ConfiguredAgentsAccordion } from './ConfiguredAgentsAccordion'; // Updated import

// Interfaces (ensure consistency)
interface KnowReplyConfig {
  knowreply_api_token: string | null;
}

interface Agent { // Represents an agent fetched from the API
  id: string;
  name: string;
  persona?: string;
  role?: string;
}

interface AgentConfig { // Represents a configured agent's settings
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
  config: KnowReplyConfig;
  availableAgents: Agent[]; // Full list of agents from API, used for "no agents found" message
  availableAgentsToAdd: Agent[]; // Filtered list for AvailableAgentsAccordion
  onAddAgent: (agent: Agent) => void;
  agentConfigs: AgentConfig[]; // For ConfiguredAgentsAccordion
  mcpEndpoints: MCPEndpoint[];
  onToggleAgentEnabled: (agentId: string) => void;
  onRemoveAgent: (agentId: string) => void;
  onToggleMCPForAgent: (agentId: string, mcpEndpointId: string) => void;
  loadingAgents: boolean;
  fetchError: string | null;
  onFetchAgents: () => void;
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
    // This card is not shown if API token is not present.
    // Alternatively, could show a message prompting for API token.
    return null;
  }

  return (
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl font-semibold text-gray-800 dark:text-gray-100">
          <Brain className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          Agent Configuration
        </CardTitle>
        <CardDescription className="text-sm text-gray-600 dark:text-gray-400">
          Manage your Know Reply agents. Add available agents to the configuration, then enable and assign MCPs or email addresses.
          Settings for each agent are shown in collapsible sections.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 pt-4">
        {loadingAgents ? (
          <div className="flex flex-col items-center justify-center py-10 text-gray-500 dark:text-gray-400">
            <Loader2 className="h-8 w-8 animate-spin mb-3" />
            <span>Loading agents...</span>
          </div>
        ) : fetchError ? (
          <div className="text-center py-10">
            <AlertCircle className="h-10 w-10 mx-auto mb-3 text-red-500 dark:text-red-400" />
            <p className="text-red-600 dark:text-red-400 mb-4 text-base">Error: {fetchError}</p>
            <Button variant="outline" onClick={onFetchAgents}>
              Retry Connection
            </Button>
          </div>
        ) : (
          <>
            {/* Message for when API fetch is successful but NO agents exist on the account */}
            {!loadingAgents && !fetchError && availableAgents.length === 0 && (
              <div className="py-6 text-center text-sm text-gray-500 dark:text-gray-400 border-t border-b dark:border-gray-700">
                 <Brain className="h-8 w-8 mx-auto mb-2 text-gray-400 dark:text-gray-500 opacity-75" />
                No agents found for your API token. Please verify your token or check your Know Reply dashboard if you expect agents to be listed.
              </div>
            )}

            {/* Only show AvailableAgentsAccordion if there are agents from the API */}
            {availableAgents.length > 0 && (
                 <AvailableAgentsAccordion
                    availableAgentsToAdd={availableAgentsToAdd}
                    onAddAgent={onAddAgent}
                />
            )}

            {/* ConfiguredAgentsAccordion can be shown even if availableAgents is empty, if some agents were configured previously */}
            <ConfiguredAgentsAccordion
              agentConfigs={agentConfigs}
              mcpEndpoints={mcpEndpoints}
              onToggleAgentEnabled={onToggleAgentEnabled}
              onRemoveAgent={onRemoveAgent}
              onToggleMCPForAgent={onToggleMCPForAgent}
              onAddNewEmailRow={onAddNewEmailRow}
              onEmailValueChange={onEmailValueChange}
              onRemoveEmailRow={onRemoveEmailRow}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
