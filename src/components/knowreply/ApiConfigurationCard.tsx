import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Bot } from 'lucide-react';

interface KnowReplyConfig {
  knowreply_api_token: string | null;
}

interface ApiConfigurationCardProps {
  config: KnowReplyConfig;
  setConfig: (config: KnowReplyConfig) => void;
  setHasUnsavedChanges: (value: boolean) => void;
}

export function ApiConfigurationCard({ config, setConfig, setHasUnsavedChanges }: ApiConfigurationCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          API Configuration
        </CardTitle>
        <CardDescription>
          Enter your Know Reply API token to access your agents
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="api-token">Know Reply API Token</Label>
          <Input
            id="api-token"
            type="password"
            placeholder="Enter your Know Reply API token"
            value={config.knowreply_api_token || ''}
            onChange={(e) => {
              setConfig({ ...config, knowreply_api_token: e.target.value });
              setHasUnsavedChanges(true);
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
}
