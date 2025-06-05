import { Label } from '@/components/ui/label';
import { ConfiguredAgentCard } from './ConfiguredAgentCard'; // Import child component
import { Brain } from 'lucide-react'; // For the empty state message

// Assuming these interfaces are defined or imported from a common types file
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

interface Agent { // For the availableAgents check
  id: string;
  name: string;
}

interface ConfiguredAgentsSectionProps {
  agentConfigs: AgentConfig[];
  mcpEndpoints: MCPEndpoint[];
  availableAgents: Agent[]; // Used to determine if the "No agents configured yet" message should show based on whether any agents were available to be added at all.
  onToggleAgentEnabled: (agentId: string) => void;
  onRemoveAgent: (agentId: string) => void;
  onToggleMCPForAgent: (agentId: string, mcpEndpointId: string) => void;
  onAddNewEmailRow: (agentId: string) => void;
  onEmailValueChange: (agentId: string, emailIndex: number, newValue: string) => void;
  onRemoveEmailRow: (agentId: string, emailIndex: number) => void;
}

export function ConfiguredAgentsSection({
  agentConfigs,
  mcpEndpoints,
  availableAgents, // Add this prop
  onToggleAgentEnabled,
  onRemoveAgent,
  onToggleMCPForAgent,
  onAddNewEmailRow,
  onEmailValueChange,
  onRemoveEmailRow,
}: ConfiguredAgentsSectionProps) {
  if (agentConfigs.length === 0) {
    // Only show "No agents configured yet" if there were agents available to add,
    // otherwise the "Add Agents" section (or lack thereof) will convey the state.
    // This also prevents showing this message when agents are still loading.
    if (availableAgents.length > 0) { // Check if there were any agents to begin with
        return (
            <div className="text-center py-8 text-gray-500">
                <Brain className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No agents configured yet. Add agents from the list above to get started.</p>
            </div>
        );
    }
    return null; // Return null if no agents configured AND no agents were available (e.g. API token invalid or no agents on account)
  }

  return (
    <div>
      <Label className="text-sm font-medium mb-3 block">Configured Agents</Label>
      <div className="space-y-4">
        {agentConfigs.map((agentConfig) => (
          <ConfiguredAgentCard
            key={agentConfig.agent_id}
            agentConfig={agentConfig}
            mcpEndpoints={mcpEndpoints}
            onToggleAgentEnabled={onToggleAgentEnabled}
            onRemoveAgent={onRemoveAgent}
            onToggleMCPForAgent={onToggleMCPForAgent}
            onAddNewEmailRow={onAddNewEmailRow}
            onEmailValueChange={onEmailValueChange}
            onRemoveEmailRow={onRemoveEmailRow}
          />
        ))}
      </div>
    </div>
  );
}
