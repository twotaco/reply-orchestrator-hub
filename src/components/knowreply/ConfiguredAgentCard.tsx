import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Trash2 } from 'lucide-react';
import { AgentMCPEndpointConfig } from './AgentMCPEndpointConfig'; // Import child component
import { AgentEmailConfig } from './AgentEmailConfig'; // Import child component

// Assuming these interfaces are defined or imported from a common types file in the future
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

interface ConfiguredAgentCardProps {
  agentConfig: AgentConfig;
  mcpEndpoints: MCPEndpoint[];
  onToggleAgentEnabled: (agentId: string) => void;
  onRemoveAgent: (agentId: string) => void;
  onToggleMCPForAgent: (agentId: string, mcpEndpointId: string) => void;
  onAddNewEmailRow: (agentId: string) => void;
  onEmailValueChange: (agentId: string, emailIndex: number, newValue: string) => void;
  onRemoveEmailRow: (agentId: string, emailIndex: number) => void;
}

export function ConfiguredAgentCard({
  agentConfig,
  mcpEndpoints,
  onToggleAgentEnabled,
  onRemoveAgent,
  onToggleMCPForAgent,
  onAddNewEmailRow,
  onEmailValueChange,
  onRemoveEmailRow,
}: ConfiguredAgentCardProps) {
  return (
    <Card className="p-4">
      <div className="space-y-4">
        {/* Agent Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Checkbox
              id={`agent-enabled-${agentConfig.agent_id}`}
              checked={agentConfig.enabled}
              onCheckedChange={() => onToggleAgentEnabled(agentConfig.agent_id)}
            />
            <label htmlFor={`agent-enabled-${agentConfig.agent_id}`} className="cursor-pointer">
              <div className="font-medium">{agentConfig.agent_name}</div>
              {agentConfig.agent_role && (
                <div className="text-sm text-gray-500">{agentConfig.agent_role}</div>
              )}
            </label>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onRemoveAgent(agentConfig.agent_id)}
            title={`Remove ${agentConfig.agent_name}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        {/* MCP Endpoints Configuration */}
        <AgentMCPEndpointConfig
          agentConfig={agentConfig}
          mcpEndpoints={mcpEndpoints}
          onToggleMCPForAgent={onToggleMCPForAgent}
        />

        {/* Email Addresses Configuration */}
        <AgentEmailConfig
          agentConfig={agentConfig}
          onAddNewEmailRow={onAddNewEmailRow}
          onEmailValueChange={onEmailValueChange}
          onRemoveEmailRow={onRemoveEmailRow}
        />
      </div>
    </Card>
  );
}
