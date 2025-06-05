import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Plus } from 'lucide-react';
import { EmailAddressInput } from './EmailAddressInput';

interface AgentConfig {
  agent_id: string;
  agent_name: string;
  enabled: boolean;
  email_addresses: string[];
}

interface AgentEmailConfigProps {
  agentConfig: AgentConfig;
  onAddNewEmailRow: (agentId: string) => void;
  onEmailValueChange: (agentId: string, emailIndex: number, newValue: string) => void;
  onRemoveEmailRow: (agentId: string, emailIndex: number) => void;
  // No setHasUnsavedChanges here, it's handled by parent through callbacks
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

  // Ensure there's always at least one email address entry field if the array is empty or undefined
  // This local handling makes sense if the parent state `agentConfig.email_addresses`
  // might not yet be initialized with one entry.
  // However, the parent component (`KnowReplySetup` or `ConfiguredAgentCard`) should ideally ensure
  // `email_addresses` starts with at least one empty string `['']` when an agent is added.
  // For this step, we'll assume the parent will handle the initial state of email_addresses.
  // The rendering logic below will then correctly handle the first email.

  const currentEmailAddresses = agentConfig.email_addresses && agentConfig.email_addresses.length > 0
    ? agentConfig.email_addresses
    : ['']; // Fallback for rendering if parent hasn't initialized, but parent should.

  return (
    <div className="pt-4 mt-4 border-t dark:border-gray-700">
      <div className="flex justify-between items-center mb-3">
        <Label className="text-sm font-medium">
          Associated Email Addresses <span className="text-red-500">*</span>
        </Label>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onAddNewEmailRow(agentConfig.agent_id)}
          title="Add another email address field"
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Another Email
        </Button>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        The first email address is mandatory. Additional email addresses can be added.
      </p>

      <div className="space-y-3">
        {currentEmailAddresses.map((emailString, index) => (
          <EmailAddressInput
            key={`${agentConfig.agent_id}-email-${index}`}
            agentId={agentConfig.agent_id}
            emailIndex={index}
            emailValue={emailString}
            onEmailChange={onEmailValueChange}
            onRemoveEmail={onRemoveEmailRow}
            canBeRemoved={index > 0} // Only emails after the first one can be removed
          />
        ))}
        {/*
          The logic for "No email addresses associated" might need adjustment
          if we always show one input. Perhaps a message if the *first* input is empty.
          For now, this message is removed as there will always be at least one input.
        */}
      </div>
    </div>
  );
}
