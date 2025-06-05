import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Plus } from 'lucide-react';
import { EmailAddressInput } from './EmailAddressInput'; // Assuming EmailAddressInput.tsx is in the same directory

interface AgentConfig {
  agent_id: string;
  agent_name: string; // Not directly used but good for context if expanding
  enabled: boolean; // To decide if this section should be active
  email_addresses: string[];
  // email_errors?: string[]; // Future: for displaying specific email errors
}

interface AgentEmailConfigProps {
  agentConfig: AgentConfig;
  onAddNewEmailRow: (agentId: string) => void;
  onEmailValueChange: (agentId: string, emailIndex: number, newValue: string) => void;
  onRemoveEmailRow: (agentId: string, emailIndex: number) => void;
}

export function AgentEmailConfig({
  agentConfig,
  onAddNewEmailRow,
  onEmailValueChange,
  onRemoveEmailRow,
}: AgentEmailConfigProps) {
  if (!agentConfig.enabled) {
    return null;
  }

  return (
    <div className="pt-4 mt-4 border-t">
      <div className="flex justify-between items-center mb-2">
        <Label className="text-sm font-medium">Associated Email Addresses</Label>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onAddNewEmailRow(agentConfig.agent_id)}
          title="Add new email address field"
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Email
        </Button>
      </div>

      <div className="space-y-2">
        {agentConfig.email_addresses && agentConfig.email_addresses.map((emailString, index) => (
          <EmailAddressInput
            key={`${agentConfig.agent_id}-email-${index}`} // More robust key
            agentId={agentConfig.agent_id}
            emailIndex={index}
            emailValue={emailString}
            onEmailChange={onEmailValueChange}
            onRemoveEmail={onRemoveEmailRow}
          />
        ))}
        {(agentConfig.email_addresses?.length === 0 || !agentConfig.email_addresses) && (
          <p className="text-xs text-gray-500 text-center py-2">
            No email addresses associated. Click "Add Email" to assign one.
          </p>
        )}
      </div>
    </div>
  );
}
