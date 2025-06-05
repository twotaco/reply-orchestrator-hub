import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"; // Assuming ShadCN UI import path
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

interface Agent {
  id: string;
  name: string;
  persona?: string;
  role?: string;
}

interface AvailableAgentAccordionItemProps {
  agent: Agent;
  onAddAgent: (agent: Agent) => void;
  isInitiallyCollapsed: boolean; // To control initial state based on parent
}

export function AvailableAgentAccordionItem({
  agent,
  onAddAgent,
  isInitiallyCollapsed, // This prop might be used by the parent Accordion component if it supports default values
}: AvailableAgentAccordionItemProps) {
  // The actual control of collapse/expand is typically handled by the parent Accordion's `type` and `defaultValue` or `value` props.
  // This component just defines the structure of an item.
  return (
    <AccordionItem value={agent.id}>
      <AccordionTrigger>
        <div className="flex flex-col items-start">
          <span className="font-medium">{agent.name}</span>
          {agent.role && (
            <span className="text-sm text-gray-500 dark:text-gray-400">{agent.role}</span>
          )}
        </div>
      </AccordionTrigger>
      <AccordionContent>
        <div className="pt-2 pb-4 px-1">
          {agent.persona && (
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
              <strong>Persona:</strong> {agent.persona}
            </p>
          )}
          <Button size="sm" onClick={() => onAddAgent(agent)} className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            Add Agent to Configuration
          </Button>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
