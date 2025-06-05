import { Accordion } from "@/components/ui/accordion"; // Parent Accordion component
import { ConfiguredAgentAccordionItem } from "./ConfiguredAgentAccordionItem"; // The item component
import { Label } from "@/components/ui/label"; // For the section title
import { Brain } from 'lucide-react'; // For empty state message

// Interfaces (ensure consistency)
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

// Removed `availableAgents: Agent[]` prop as it's not directly needed for this component's logic anymore.
// The decision to show "No agents configured" is solely based on `agentConfigs.length`.
interface ConfiguredAgentsAccordionProps {
  agentConfigs: AgentConfig[];
  mcpEndpoints: MCPEndpoint[];
  onToggleAgentEnabled: (agentId: string) => void;
  onRemoveAgent: (agentId: string) => void;
  onToggleMCPForAgent: (agentId: string, mcpEndpointId: string) => void;
  onAddNewEmailRow: (agentId: string) => void;
  onEmailValueChange: (agentId: string, emailIndex: number, newValue: string) => void;
  onRemoveEmailRow: (agentId: string, emailIndex: number) => void;
}

export function ConfiguredAgentsAccordion({
  agentConfigs,
  mcpEndpoints,
  onToggleAgentEnabled,
  onRemoveAgent,
  onToggleMCPForAgent,
  onAddNewEmailRow,
  onEmailValueChange,
  onRemoveEmailRow,
}: ConfiguredAgentsAccordionProps) {

  if (agentConfigs.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-gray-500 dark:text-gray-400 flex flex-col items-center">
        <Brain className="h-8 w-8 mb-2 text-gray-400 dark:text-gray-500 opacity-75" />
        <span>No agents have been configured yet.</span>
        <span>Add agents from the "Available Agents" section above.</span>
      </div>
    );
  }

  return (
    <div className="space-y-3 mt-6">
      <Label className="text-base font-semibold mb-2 block text-gray-700 dark:text-gray-300">
        Configured Agents
      </Label>
      <Accordion type="multiple" className="space-y-2">
        {/*
          Accordion items will be collapsed by default if defaultValue is not set or is an empty array.
        */}
        {agentConfigs.map((agentConfig) => (
          <ConfiguredAgentAccordionItem
            key={agentConfig.agent_id}
            agentConfig={agentConfig}
            mcpEndpoints={mcpEndpoints}
            onToggleAgentEnabled={onToggleAgentEnabled}
            onRemoveAgent={onRemoveAgent}
            onToggleMCPForAgent={onToggleMCPForAgent}
            onAddNewEmailRow={onAddNewEmailRow}
            onEmailValueChange={onEmailValueChange}
            onRemoveEmailRow={onRemoveEmailRow}
            // isInitiallyCollapsed prop is not strictly needed here as parent Accordion controls it
          />
        ))}
      </Accordion>
    </div>
  );
}
