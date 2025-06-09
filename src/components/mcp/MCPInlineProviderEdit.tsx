import React, { useState, useEffect, useCallback } from 'react';
import type { User } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { DiscoveredProvider, MCPEndpoint, DiscoveredProviderAction } from './types';

interface MCPInlineProviderEditProps {
  editingCategory: string;
  onCancel: () => void;
  onSaveSuccess: () => void;
  user: User | null;
  discoveredProviders: DiscoveredProvider[] | null;
  currentSavedActionsForCategory: MCPEndpoint[];
  categoryMapUtil: { [key: string]: string }; // Already available in MCPManagement
  getPascalCaseCategory: (providerName: string) => string; // Already available in MCPManagement
  userRole?: string | null;
}

export function MCPInlineProviderEdit({
  editingCategory,
  onCancel,
  onSaveSuccess,
  user,
  discoveredProviders,
  currentSavedActionsForCategory,
  categoryMapUtil, // Prop drilling, consider context or Zustand for deep nesting if it grows
  getPascalCaseCategory,
  userRole,
}: MCPInlineProviderEditProps) {
  const [editingConnectionParams, setEditingConnectionParams] = useState<Record<string, string>>({});
  const [editingActionsSelection, setEditingActionsSelection] = useState<Record<string, boolean>>({});
  const [loadingConnectionParams, setLoadingConnectionParams] = useState<boolean>(true);

  const providerData = discoveredProviders?.find(p => p.provider_name === editingCategory);

  useEffect(() => {
    if (!user || !editingCategory || !providerData) {
      setLoadingConnectionParams(false);
      return;
    }

    setLoadingConnectionParams(true);
    setEditingConnectionParams({}); // Clear previous

    supabase
      .from('mcp_connection_params')
      .select('connection_values')
      .eq('user_id', user.id)
      .eq('provider_name', editingCategory)
      .single()
      .then(({ data, error }) => {
        let initialParams: Record<string, string> = {};
        const connectionSchema = providerData?.connection_schema;
        const shape = connectionSchema?.typeName === 'ZodObject' && connectionSchema.shape ? connectionSchema.shape : null;

        if (data && data.connection_values) {
          initialParams = data.connection_values as Record<string, string>;
        }

        if (shape) {
          Object.keys(shape).forEach(key => {
            if (!(key in initialParams)) {
              initialParams[key] = ''; // Ensure all schema fields are present
            }
          });
        }
        setEditingConnectionParams(initialParams);
        if (error && error.code !== 'PGRST116') { // PGRST116: single row not found (is fine)
          console.error("Error fetching connection params:", error);
          toast({ title: "Error", description: "Could not load existing connection parameters.", variant: "destructive" });
        }
      })
      .finally(() => {
        setLoadingConnectionParams(false);
      });

    const initialSelections: Record<string, boolean> = {};
    if (providerData && providerData.actions) {
      providerData.actions.forEach(discoveredAction => {
        const savedAction = currentSavedActionsForCategory.find(sa =>
          sa.action_name === discoveredAction.action_name &&
          sa.provider_name === editingCategory // Ensure provider_name matches, though currentSavedActionsForCategory should already be filtered
        );
        initialSelections[discoveredAction.action_name] = savedAction ? savedAction.active : false;
      });
    }
    setEditingActionsSelection(initialSelections);

  }, [editingCategory, user, providerData, currentSavedActionsForCategory]); // supabase, toast are stable

  const handleInlineProviderSave = useCallback(async () => {
    if (!editingCategory || !user || !providerData) {
      toast({ title: "Error", description: "Editing context is missing.", variant: "destructive" });
      return;
    }

    const anyActionSelected = Object.values(editingActionsSelection).some(isSelected => isSelected);
    if (anyActionSelected && providerData.connection_schema && typeof providerData.connection_schema === 'object') {
      const connectionSchema = providerData.connection_schema;
      const shape = connectionSchema?.typeName === 'ZodObject' && connectionSchema.shape ? connectionSchema.shape : null;
      const schemaKeys = shape ? Object.keys(shape) : [];

      const missingRequiredParam = schemaKeys.find(key => {
        const schemaField = shape![key] as any;
        const isActuallyRequired = !schemaField.typeName?.startsWith('ZodOptional') && !schemaField.typeName?.startsWith('ZodDefault');
        return isActuallyRequired && !editingConnectionParams[key]?.trim();
      });

      if (missingRequiredParam) {
        const fieldDetails = shape && shape[missingRequiredParam] ? (shape[missingRequiredParam] as any) : null;
        const displayName = fieldDetails?.description || fieldDetails?.display_name || missingRequiredParam;
        toast({
          title: "Validation Error",
          description: `Connection parameter "${displayName}" for ${providerData.display_name} is required when actions are selected.`,
          variant: "destructive"
        });
        return;
      }
    }

    if (Object.keys(editingConnectionParams).length > 0) {
      const { error: connParamError } = await supabase
        .from('mcp_connection_params')
        .upsert({
          user_id: user.id,
          provider_name: editingCategory,
          connection_values: editingConnectionParams,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id, provider_name' });

      if (connParamError) {
        console.error('Error saving connection parameters:', connParamError);
        toast({ title: "Error", description: `Failed to save connection parameters: ${connParamError.message}`, variant: "destructive" });
        return;
      }
    }

    const operations: Promise<any>[] = [];
    let itemsUpdated = 0;
    let itemsAdded = 0;
    let itemsDeleted = 0;

    for (const discoveredAction of providerData.actions) {
      const isSelected = !!editingActionsSelection[discoveredAction.action_name];
      const existingSavedAction = currentSavedActionsForCategory.find(sa => sa.action_name === discoveredAction.action_name);

      if (isSelected) {
        const dataToSave = {
          name: `${editingCategory}_${discoveredAction.action_name}`,
          category: getPascalCaseCategory(editingCategory),
          mcp_server_base_url: 'https://mcp.knowreply.email',
          provider_name: editingCategory,
          action_name: discoveredAction.action_name,
          action_display_name: discoveredAction.display_name || discoveredAction.action_name,
          expected_format: discoveredAction.args_schema || {},
          instructions: discoveredAction.description || '',
          output_schema: discoveredAction.output_schema || {},
          active: true,
          user_id: user.id,
        };
        if (existingSavedAction) {
          operations.push(supabase.from('mcp_endpoints').update({ ...dataToSave, id: existingSavedAction.id }).eq('id', existingSavedAction.id));
          itemsUpdated++;
        } else {
          operations.push(supabase.from('mcp_endpoints').insert([dataToSave]));
          itemsAdded++;
        }
      } else {
        if (existingSavedAction) {
          operations.push(supabase.from('mcp_endpoints').delete().eq('id', existingSavedAction.id));
          itemsDeleted++;
        }
      }
    }

    if (operations.length === 0 && Object.keys(editingConnectionParams).filter(k => editingConnectionParams[k]?.trim() !== '').length === 0 && !anyActionSelected && currentSavedActionsForCategory.length === 0) {
      toast({ title: "No Changes", description: "No changes were made to this provider's configuration." });
      onCancel();
      return;
    }

    try {
      const results = await Promise.all(operations);
      results.forEach(result => {
        if (result.error) throw result.error;
      });
      toast({ title: "Success", description: `Successfully updated ${getPascalCaseCategory(editingCategory)}: ${itemsAdded} added, ${itemsUpdated} updated, ${itemsDeleted} removed. Connection parameters saved.` });
      onSaveSuccess(); // This will call fetchEndpoints and close the form in parent
    } catch (error: any) {
      console.error('Error saving inline MCP configurations:', error);
      toast({ title: "Error", description: `Failed to save configurations: ${error.message}`, variant: "destructive" });
    }
  }, [
    editingCategory, user, providerData, editingConnectionParams, editingActionsSelection,
    currentSavedActionsForCategory, getPascalCaseCategory, onSaveSuccess, onCancel,
  ]); // supabase, toast are stable

  if (!providerData) {
    return <div className="p-4 text-sm text-red-500">Error: Provider data for "{editingCategory}" not found.</div>;
  }

  const connectionSchema = providerData.connection_schema;
  const shape = connectionSchema?.typeName === 'ZodObject' && connectionSchema.shape ? connectionSchema.shape : null;

  return (
    <div className="p-4 border-t border-dashed mt-2 space-y-4">
      {loadingConnectionParams ? (
        <div className="flex items-center justify-center p-4">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          <p className="ml-2 text-sm text-gray-500">Loading connection details...</p>
        </div>
      ) : (
        shape && Object.keys(shape).length > 0 && (
          <div className="space-y-3">
            <h4 className="text-md font-semibold mb-2">Connection Parameters:</h4>
            {Object.entries(shape).map(([key, schemaValue]: [string, any]) => {
              const isRequired = !schemaValue.typeName?.startsWith('ZodOptional') && !schemaValue.typeName?.startsWith('ZodDefault');
              return (
                <div key={key}>
                  <Label htmlFor={`conn-param-${key}`}>
                    {schemaValue?.description || key.replace(/([A-Z])/g, ' $1').replace(/^./, (str: string) => str.toUpperCase())}
                    {isRequired && <span className="text-red-500 ml-1">*</span>}
                  </Label>
                  <Input
                    id={`conn-param-${key}`}
                    type={(key.toLowerCase().includes('secret') || key.toLowerCase().includes('token') || key.toLowerCase().includes('key')) ? 'password' : 'text'}
                    value={editingConnectionParams[key] || ''}
                    onChange={(e) =>
                      setEditingConnectionParams(prev => ({ ...prev, [key]: e.target.value }))
                    }
                    placeholder={schemaValue?.description || `Enter ${key}`}
                    className="mt-1"
                  />
                </div>
              );
            })}
          </div>
        )
      )}
      {!loadingConnectionParams && providerData && (!shape || Object.keys(shape).length === 0) && (
         <p className="text-sm text-gray-500">This provider ({providerData.display_name}) does not require additional connection parameters.</p>
      )}

      <div>
        <h4 className="text-md font-semibold mb-2">Configure Actions:</h4>
        <div className="space-y-2 max-h-60 overflow-y-auto p-2 border rounded-md">
          {(providerData.actions || []).map(discoveredAction => (
            <div key={discoveredAction.action_name} className="flex items-center space-x-2">
              <Checkbox
                id={`inline-edit-action-${editingCategory}-${discoveredAction.action_name}`}
                checked={!!editingActionsSelection[discoveredAction.action_name]}
                onCheckedChange={(checked) => {
                  setEditingActionsSelection(prev => ({
                    ...prev,
                    [discoveredAction.action_name]: !!checked
                  }));
                }}
              />
              <Label htmlFor={`inline-edit-action-${editingCategory}-${discoveredAction.action_name}`} className="font-normal">
                {discoveredAction.display_name} ({discoveredAction.action_name})
              </Label>
            </div>
          ))}
          {(providerData.actions || []).length === 0 && (
            <p className="text-sm text-gray-500">No discoverable actions found for this provider.</p>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2 mt-4">
        <Button variant="outline" onClick={onCancel} disabled={loadingConnectionParams}>
          Cancel
        </Button>
        <Button onClick={handleInlineProviderSave} disabled={loadingConnectionParams || userRole === 'demo'}>
          {loadingConnectionParams ? 'Loading...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}
