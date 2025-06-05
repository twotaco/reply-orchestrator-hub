import { Accordion } from "@/components/ui/accordion"; // Parent Accordion component
import { AvailableAgentAccordionItem } from "./AvailableAgentAccordionItem"; // The item component created earlier
import { Label } from "@/components/ui/label"; // For the section title
import { Info } from 'lucide-react'; // For empty state message

interface Agent {
  id: string;
  name: string;
  persona?: string;
  role?: string;
}

interface AvailableAgentsAccordionProps {
  availableAgentsToAdd: Agent[];
  onAddAgent: (agent: Agent) => void;
  // defaultCollapsed: boolean; // The accordion items should be collapsed by default
}

export function AvailableAgentsAccordion({
  availableAgentsToAdd,
  onAddAgent,
}: AvailableAgentsAccordionProps) {
  if (availableAgentsToAdd.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-gray-500 dark:text-gray-400 flex flex-col items-center">
        <Info className="h-8 w-8 mb-2 text-gray-400 dark:text-gray-500" />
        <span>No new agents available to add.</span>
        <span>Check your Know Reply dashboard or API token if you expect more.</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Label className="text-base font-semibold mb-2 block text-gray-700 dark:text-gray-300">
        Available Agents to Add
      </Label>
      <Accordion type="multiple" className="space-y-2">
        {/*
          To make all items collapsed by default with type="multiple",
          the Accordion component usually doesn't need a specific prop.
          If `defaultValue` is an empty array or not provided, items start collapsed.
          Individual `AccordionItem` does not control its own initial state directly.
        */}
        {availableAgentsToAdd.map((agent) => (
          <AvailableAgentAccordionItem
            key={agent.id}
            agent={agent}
            onAddAgent={onAddAgent}
            isInitiallyCollapsed={true} // This prop is for semantics, actual collapse is by parent Accordion
          />
        ))}
      </Accordion>
    </div>
  );
}
