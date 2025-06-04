import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { TestTube, Trash2 } from 'lucide-react';
import type { MCPEndpoint } from './types';

interface MCPTableComponentProps {
  actionsInGroup: MCPEndpoint[];
  onTestEndpoint: (endpoint: MCPEndpoint) => void;
  onDeleteEndpoint: (endpointId: string) => void;
  onToggleEndpointActive: (endpointId: string, currentStatus: boolean) => void;
}

export function MCPTableComponent({
  actionsInGroup,
  onTestEndpoint,
  onDeleteEndpoint,
  onToggleEndpointActive,
}: MCPTableComponentProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[30%]">Function Name</TableHead>
          <TableHead className="w-[30%]">Action Slug</TableHead>
          <TableHead className="w-[15%]">Status</TableHead>
          <TableHead className="text-right w-[25%]">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {actionsInGroup.map((endpoint) => (
          <TableRow key={endpoint.id}>
            <TableCell className="font-medium">
              {endpoint.action_display_name || endpoint.name}
            </TableCell>
            <TableCell>
              <code className="text-sm bg-gray-100 px-2 py-1 rounded">
                {endpoint.action_name || 'N/A'}
              </code>
            </TableCell>
            <TableCell>
              <Switch
                checked={endpoint.active}
                onCheckedChange={() => onToggleEndpointActive(endpoint.id, endpoint.active)}
                aria-label={`Toggle status for ${endpoint.name}`}
              />
            </TableCell>
            <TableCell className="text-right">
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => onTestEndpoint(endpoint)}
                  title="Test Action"
                >
                  <TestTube className="h-4 w-4" />
                </Button>
                <Button
                  variant="destructive"
                  size="icon"
                  onClick={() => onDeleteEndpoint(endpoint.id)}
                  title="Delete Action"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
