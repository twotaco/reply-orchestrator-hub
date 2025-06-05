import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { ConfiguredAgentCard } from "./ConfiguredAgentCard"; // Child component
import { Trash2, GripVertical, CheckCircle2, XCircle } from "lucide-react"; // Icons

// Interfaces (ensure these are consistent with other components)
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

interface ConfiguredAgentAccordionItemProps {
  agentConfig: AgentConfig;
  mcpEndpoints: MCPEndpoint[];
  onToggleAgentEnabled: (agentId: string) => void;
  onRemoveAgent: (agentId: string) => void;
  onToggleMCPForAgent: (agentId: string, mcpEndpointId: string) => void;
  onAddNewEmailRow: (agentId: string) => void;
  onEmailValueChange: (agentId: string, emailIndex: number, newValue: string) => void;
  onRemoveEmailRow: (agentId: string, emailIndex: number) => void;
  // No setHasUnsavedChanges here, it's handled by parent callbacks
  // isInitiallyCollapsed: boolean; // Parent Accordion controls this
}

export function ConfiguredAgentAccordionItem({
  agentConfig,
  mcpEndpoints,
  onToggleAgentEnabled,
  onRemoveAgent,
  onToggleMCPForAgent,
  onAddNewEmailRow,
  onEmailValueChange,
  onRemoveEmailRow,
}: ConfiguredAgentAccordionItemProps) {
  return (
    <AccordionItem value={agentConfig.agent_id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg mb-3">
      <AccordionTrigger className="px-4 py-3 hover:no-underline group">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-3">
            {/* Optional: Drag handle icon if reordering becomes a feature */}
            {/* <GripVertical className="h-5 w-5 text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300" /> */}
            {agentConfig.enabled ? (
              <CheckCircle2 className="h-5 w-5 text-green-500 dark:text-green-400" />
            ) : (
              <XCircle className="h-5 w-5 text-gray-400 dark:text-gray-500" />
            )}
            <div className="flex flex-col items-start text-left">
              <span className="font-medium text-gray-800 dark:text-gray-100">{agentConfig.agent_name}</span>
              {agentConfig.agent_role && (
                <span className="text-sm text-gray-500 dark:text-gray-400">{agentConfig.agent_role}</span>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation(); // Prevent accordion from toggling when removing
              onRemoveAgent(agentConfig.agent_id);
            }}
            title={`Remove ${agentConfig.agent_name}`}
            className="text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </AccordionTrigger>
      <AccordionContent className="border-t border-gray-200 dark:border-gray-700">
        {/* ConfiguredAgentCard is rendered inside the content area */}
        <ConfiguredAgentCard
          agentConfig={agentConfig}
          mcpEndpoints={mcpEndpoints}
          onToggleAgentEnabled={onToggleAgentEnabled}
          onRemoveAgent={onRemoveAgent} // Still passed down in case ConfiguredAgentCard needs it, though button is moved
          onToggleMCPForAgent={onToggleMCPForAgent}
          onAddNewEmailRow={onAddNewEmailRow}
          onEmailValueChange={onEmailValueChange}
          onRemoveEmailRow={onRemoveEmailRow}
        />
      </AccordionContent>
    </AccordionItem>
  );
}
