import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Settings, ExternalLink } from 'lucide-react'; // Icons

export function SetupInstructionsCard() {
  return (
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl font-semibold text-gray-800 dark:text-gray-100">
          <Settings className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          Setup Instructions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
          <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">Quick Start Guide:</h4>
          <ol className="text-sm text-blue-700 dark:text-blue-300 space-y-1 list-decimal list-inside">
            <li>Enter your KnowReply API token to connect your account.</li>
            <li>Available agents from your KnowReply account will appear in the "Available Agents to Add" section.</li>
            <li>Click on an available agent to expand its details, then click "Add Agent to Configuration".</li>
            <li>Once added, the agent will move to the "Configured Agents" section.</li>
            <li>Expand a configured agent to:
                <ul className="list-disc list-inside pl-5 mt-1 space-y-0.5">
                    <li>Enable or disable the agent.</li>
                    <li>Assign MCP (Multi-Channel Platform) endpoints it can access (if any are set up).</li>
                    <li>Associate email addresses for routing (at least one is mandatory).</li>
                </ul>
            </li>
            <li>Use the sticky "Save Configuration" button at the bottom of the page to save all your changes.</li>
          </ol>
        </div>

        <div className="space-y-2">
          <Button variant="outline" className="w-full justify-between" asChild>
            <a href="https://knowreply.com/dashboard" target="_blank" rel="noopener noreferrer">
              Go to KnowReply Dashboard
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
          {/* Add more relevant links or information if needed */}
        </div>
      </CardContent>
    </Card>
  );
}
