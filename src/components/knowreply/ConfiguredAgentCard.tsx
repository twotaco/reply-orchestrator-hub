import { Button } from '@/components/ui/button';
// No longer import Card from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label'; // For better label association with checkbox
import { Trash2 } from 'lucide-react';
import { AgentMCPEndpointConfig } from './AgentMCPEndpointConfig';
import { AgentEmailConfig } from './AgentEmailConfig';

// Interfaces (AgentConfig, MCPEndpoint) remain the same
interface AgentConfig {
  agent_id: string;
  agent_name: string;
  agent_role?: string;
  enabled: boolean;
  mcp_endpoints: string[];
  email_addresses: string[]; // This should be initialized with [''] for new agents by the parent state logic
}

interface MCPEndpoint {
  id:string;
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
  // No setHasUnsavedChanges here, it's handled by parent through callbacks
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
  // The parent component (KnowReplySetup.tsx) should ensure that when an agent is newly added,
  // its agentConfig.email_addresses is initialized as [''].
  // If agentConfig.email_addresses is null or undefined here, AgentEmailConfig will currently
  // use a local fallback `['']` for rendering, but state changes might not reflect correctly
  // unless the actual agentConfig in the parent state is updated.

  return (
    <div className="space-y-6 pt-2 pb-4 px-1"> {/* Added some padding similar to AccordionContent */}
      {/* Agent Header: Enable/Disable and Name */}
      <div className="flex items-center justify-between pb-4 border-b dark:border-gray-700">
        <div className="flex items-center gap-3">
          <Checkbox
            id={`agent-enabled-${agentConfig.agent_id}`}
            checked={agentConfig.enabled}
            onCheckedChange={() => onToggleAgentEnabled(agentConfig.agent_id)}
            aria-labelledby={`agent-name-label-${agentConfig.agent_id}`}
          />
          <Label htmlFor={`agent-enabled-${agentConfig.agent_id}`} className="cursor-pointer" id={`agent-name-label-${agentConfig.agent_id}`}>
            <span className="font-medium text-sm">Enable Agent</span>
          </Label>
        </div>
        {/* Remove Agent button is now moved to the AccordionTrigger in ConfiguredAgentAccordionItem */}
        {/*
        <Button
          variant="outline"
          size="icon" // Changed to icon button for a cleaner look if kept here
          onClick={() => onRemoveAgent(agentConfig.agent_id)}
          title={`Remove ${agentConfig.agent_name} from configuration`}
          className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-500"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
        */}
      </div>

      {/* MCP Endpoints Configuration */}
      {/* This section will only be shown if the agent is enabled */}
      {agentConfig.enabled && (
        <AgentMCPEndpointConfig
          agentConfig={agentConfig}
          mcpEndpoints={mcpEndpoints}
          onToggleMCPForAgent={onToggleMCPForAgent}
        />
      )}

      {/* Email Addresses Configuration */}
      {/* This section will only be shown if the agent is enabled */}
      {agentConfig.enabled && (
        <AgentEmailConfig
          agentConfig={agentConfig}
          onAddNewEmailRow={onAddNewEmailRow}
          onEmailValueChange={onEmailValueChange}
          onRemoveEmailRow={onRemoveEmailRow}
        />
      )}

       {!agentConfig.enabled && (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
          Enable this agent to configure MCP endpoints and email addresses.
        </p>
      )}
    </div>
  );
}
