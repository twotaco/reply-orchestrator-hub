import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';

interface EmailAddressInputProps {
  agentId: string; // Though not used in this component's rendering, it's often useful for context or future enhancements
  emailIndex: number;
  emailValue: string;
  onEmailChange: (agentId: string, emailIndex: number, value: string) => void;
  onRemoveEmail: (agentId: string, emailIndex: number) => void;
}

export function EmailAddressInput({
  agentId,
  emailIndex,
  emailValue,
  onEmailChange,
  onRemoveEmail,
}: EmailAddressInputProps) {
  return (
    <div className="flex items-center gap-2">
      <Input
        type="email"
        placeholder="Enter email address"
        value={emailValue}
        onChange={(e) => onEmailChange(agentId, emailIndex, e.target.value)}
        className="flex-grow"
      />
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onRemoveEmail(agentId, emailIndex)}
        title="Remove this email address"
        className="text-gray-500 hover:text-red-500"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
