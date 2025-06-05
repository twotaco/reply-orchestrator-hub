import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Plus } from 'lucide-react';

interface Agent {
  id: string;
  name: string;
  persona?: string;
  role?: string;
}

interface AgentListProps {
  availableAgentsToAdd: Agent[];
  onAddAgent: (agent: Agent) => void;
}

export function AgentList({ availableAgentsToAdd, onAddAgent }: AgentListProps) {
  if (availableAgentsToAdd.length === 0) {
    return null; // Or some placeholder if desired when no agents are available to add
  }

  return (
    <div>
      <Label className="text-sm font-medium mb-3 block">Add Agents</Label>
      <div className="grid gap-3">
        {availableAgentsToAdd.map((agent) => (
          <div key={agent.id} className="flex items-center justify-between p-3 border rounded-lg">
            <div>
              <div className="font-medium">{agent.name}</div>
              {agent.role && (
                <div className="text-sm text-gray-500">{agent.role}</div>
              )}
            </div>
            <Button size="sm" onClick={() => onAddAgent(agent)}>
              <Plus className="h-4 w-4 mr-1" />
              Add Agent
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
