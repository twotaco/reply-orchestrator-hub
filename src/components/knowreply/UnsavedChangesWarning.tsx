import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, Loader2, Save } from 'lucide-react';

interface UnsavedChangesWarningProps {
  hasUnsavedChanges: boolean;
  onSaveConfiguration: () => void;
  saving: boolean;
}

export function UnsavedChangesWarning({
  hasUnsavedChanges,
  onSaveConfiguration,
  saving,
}: UnsavedChangesWarningProps) {
  if (!hasUnsavedChanges) {
    return null;
  }

  return (
    <Card className="border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-900/30">
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 text-orange-700 dark:text-orange-300">
          <AlertCircle className="h-5 w-5" />
          <span className="font-medium">You have unsaved changes</span>
          <Button
            onClick={onSaveConfiguration}
            disabled={saving}
            size="sm"
            className="ml-auto bg-orange-500 hover:bg-orange-600 dark:bg-orange-600 dark:hover:bg-orange-700 text-white"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Save Now
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
