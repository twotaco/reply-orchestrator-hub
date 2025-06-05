import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';

interface EmailAddressInputProps {
  agentId: string;
  emailIndex: number;
  emailValue: string;
  onEmailChange: (agentId: string, emailIndex: number, value: string) => void;
  onRemoveEmail: (agentId: string, emailIndex: number) => void;
  canBeRemoved: boolean; // New prop
}

export function EmailAddressInput({
  agentId,
  emailIndex,
  emailValue,
  onEmailChange,
  onRemoveEmail,
  canBeRemoved, // Destructure new prop
}: EmailAddressInputProps) {
  return (
    <div className="flex items-center gap-2">
      <Input
        type="email"
        placeholder="Enter email address (required)" // Update placeholder for the first email
        value={emailValue}
        onChange={(e) => onEmailChange(agentId, emailIndex, e.target.value)}
        className="flex-grow"
      />
      <Button
        variant="ghost"
        size="icon"
        onClick={() => {
          if (canBeRemoved) { // Only call if allowed
            onRemoveEmail(agentId, emailIndex);
          }
        }}
        title={canBeRemoved ? "Remove this email address" : "This email address cannot be removed"}
        disabled={!canBeRemoved} // Disable button
        className={`text-gray-500 ${canBeRemoved ? 'hover:text-red-500' : 'opacity-50 cursor-not-allowed'}`}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
