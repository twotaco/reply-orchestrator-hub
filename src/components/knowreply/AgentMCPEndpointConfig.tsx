import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

interface MCPEndpoint {
  id: string;
  name: string;
  category: string;
  post_url: string; // Not used in this component but part of the data structure
  instructions?: string;
}

interface AgentConfig {
  agent_id: string;
  enabled: boolean; // To decide if this section should be active
  mcp_endpoints: string[];
}

interface AgentMCPEndpointConfigProps {
  agentConfig: AgentConfig;
  mcpEndpoints: MCPEndpoint[]; // List of all available MCP endpoints
  onToggleMCPForAgent: (agentId: string, mcpEndpointId: string) => void;
}

export function AgentMCPEndpointConfig({
  agentConfig,
  mcpEndpoints,
  onToggleMCPForAgent,
}: AgentMCPEndpointConfigProps) {
  if (!agentConfig.enabled) {
    return null;
  }

  if (mcpEndpoints.length === 0) {
    return (
      <div className="text-sm text-gray-500 p-3 bg-gray-50 rounded mt-2">
        No MCP endpoints configured in your workspace. Set up MCP endpoints first to connect them to agents.
      </div>
    );
  }

  return (
    <div>
      <Label className="text-sm font-medium mb-2 block">MCP Endpoints</Label>
      <div className="grid gap-2">
        {mcpEndpoints.map((endpoint) => (
          <div key={endpoint.id} className="flex items-center space-x-3 p-2 border rounded">
            <Checkbox
              id={`mcp-${agentConfig.agent_id}-${endpoint.id}`} // Unique ID for label association
              checked={agentConfig.mcp_endpoints.includes(endpoint.id)}
              onCheckedChange={() => onToggleMCPForAgent(agentConfig.agent_id, endpoint.id)}
            />
            <div className="flex-1">
              <Label htmlFor={`mcp-${agentConfig.agent_id}-${endpoint.id}`} className="cursor-pointer">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{endpoint.name}</span>
                  <Badge variant="outline" className="text-xs">{endpoint.category}</Badge>
                </div>
                {endpoint.instructions && (
                  <p className="text-xs text-gray-500 mt-1">{endpoint.instructions}</p>
                )}
              </Label>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
