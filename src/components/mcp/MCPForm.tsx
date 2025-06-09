import React, { useState, useEffect, useCallback } from 'react';
import type { User } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Save, X } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { DiscoveredProvider, MCPEndpoint, ConfiguredActionData, MCPForm as MCPFormDataState } from './types';
import { categoryMapUtil as defaultCategoryMapUtil, getPascalCaseCategory as defaultGetPascalCaseCategory } from './utils'; // Import defaults if props not passed

interface MCPFormProps {
  user: User | null;
  discoveredProviders: DiscoveredProvider[] | null;
  discoveryLoading: boolean;
  discoveryError: string | null;
  savedConfiguredActions: MCPEndpoint[];
  categoryMapUtil: { [key: string]: string };
  getPascalCaseCategory: (providerName: string) => string;
  onSaveSuccess: () => void;
  onCancel: () => void;
  userRole?: string | null; // Add userRole prop
}

export function MCPForm({
  user,
  discoveredProviders,
  discoveryLoading,
  discoveryError,
  savedConfiguredActions,
  categoryMapUtil = defaultCategoryMapUtil, // Use default if not provided
  getPascalCaseCategory = defaultGetPascalCaseCategory, // Use default if not provided
  onSaveSuccess,
  onCancel,
  userRole, // Destructure userRole
}: MCPFormProps) {
  const [formData, setFormData] = useState<MCPFormDataState>({
    name: '',
    selected_provider_name: '',
    mcp_server_base_url: 'https://mcp.knowreply.email', // Default
    provider_name: '',
    action_name: '',
    connectionParams: {},
    expected_format: '{}',
    instructions: '',
  });
  const [actionFormsData, setActionFormsData] = useState<Record<string, ConfiguredActionData>>({});
  const [loadingMainFormConnectionParams, setLoadingMainFormConnectionParams] = useState<boolean>(false);

  const internalResetForm = useCallback(() => {
    setFormData({
      name: '', selected_provider_name: '', mcp_server_base_url: 'https://mcp.knowreply.email',
      provider_name: '', action_name: '', connectionParams: {},
      expected_format: '{}', instructions: '',
    });
    setActionFormsData({});
    onCancel();
  }, [onCancel]);

  const handleProviderSelect = useCallback(async (selectedProviderNameValue: string) => {
    const selectedDiscoveredProvider = discoveredProviders?.find(p => p.provider_name === selectedProviderNameValue);

    setFormData(prev => ({
      ...prev,
      selected_provider_name: selectedProviderNameValue,
      provider_name: selectedProviderNameValue === 'custom' ? '' : selectedProviderNameValue,
      mcp_server_base_url: 'https://mcp.knowreply.email',
      connectionParams: {},
      instructions: selectedDiscoveredProvider?.description || (selectedProviderNameValue === 'custom' ? 'Define your custom provider.' : 'Select actions below.'),
    }));
    setActionFormsData({});

    if (selectedProviderNameValue && selectedProviderNameValue !== 'custom' && user) {
      setLoadingMainFormConnectionParams(true);
      try {
        const { data: connParamsData, error: connParamsError } = await supabase
          .from('mcp_connection_params')
          .select('connection_values')
          .eq('user_id', user.id)
          .eq('provider_name', selectedProviderNameValue)
          .single();

        let initialParams: Record<string, string> = {};
        if (connParamsData?.connection_values) {
          initialParams = connParamsData.connection_values as Record<string, string>;
        }

        const providerSchema = selectedDiscoveredProvider?.connection_schema;
        const shape = providerSchema?.typeName === 'ZodObject' && providerSchema.shape ? providerSchema.shape : null;
        if (shape) {
          Object.keys(shape).forEach(key => {
            if (!(key in initialParams)) initialParams[key] = '';
          });
        }
        setFormData(prev => ({ ...prev, connectionParams: initialParams }));

        if (connParamsError && connParamsError.code !== 'PGRST116') {
          console.error("Error fetching main form connection params:", connParamsError);
          toast({ title: "Error", description: "Could not load existing connection parameters.", variant: "destructive" });
        }
      } catch (e) {
        console.error("Exception fetching main form connection params:", e);
        toast({ title: "Error", description: "An unexpected error occurred loading connection parameters.", variant: "destructive" });
      } finally {
        setLoadingMainFormConnectionParams(false);
      }
    }

    const newActionFormsData: Record<string, ConfiguredActionData> = {};
    if (selectedDiscoveredProvider?.actions) {
      selectedDiscoveredProvider.actions.forEach(discoveredAction => {
        const savedAction = savedConfiguredActions.find(
          sa => sa.provider_name === selectedDiscoveredProvider.provider_name && sa.action_name === discoveredAction.action_name
        );
        newActionFormsData[discoveredAction.action_name] = {
          id: savedAction?.id,
          ai_name: `${selectedDiscoveredProvider.provider_name}_${discoveredAction.action_name}`,
          is_selected: !!savedAction,
          active: savedAction ? savedAction.active : false,
          action_name: discoveredAction.action_name,
          provider_name: selectedDiscoveredProvider.provider_name,
          instructions: discoveredAction.description || "No specific instructions.",
          sample_payload: JSON.stringify(discoveredAction.sample_payload || {}, null, 2),
          display_name: discoveredAction.display_name || discoveredAction.action_name,
          output_schema: discoveredAction.output_schema,
          args_schema: discoveredAction.args_schema,
        };
      });
    }
    setActionFormsData(newActionFormsData);
  }, [discoveredProviders, savedConfiguredActions, user /* supabase, toast are stable */]);

  const handleActionConfigChange = useCallback((actionName: string, field: keyof ConfiguredActionData, value: any) => {
    setActionFormsData(prev => ({
      ...prev,
      [actionName]: { ...prev[actionName], [field]: value },
    }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!user) return;
    if (!formData.selected_provider_name) {
      toast({ title: "Error", description: "Please select a provider first.", variant: "destructive" });
      return;
    }
    if (formData.selected_provider_name === 'custom' && !formData.provider_name) {
      toast({ title: "Validation Error", description: "For 'Custom' provider type, please specify the Provider Name.", variant: "destructive" });
      return;
    }

    const anyActionSelected = Object.values(actionFormsData).some(action => action.is_selected);
    const currentProviderData = discoveredProviders?.find(p => p.provider_name === formData.selected_provider_name);

    if (anyActionSelected && formData.selected_provider_name !== 'custom' && currentProviderData?.connection_schema) {
      const connectionSchema = currentProviderData.connection_schema;
      const shape = connectionSchema?.typeName === 'ZodObject' && connectionSchema.shape ? connectionSchema.shape : null;
      const schemaKeys = shape ? Object.keys(shape) : [];
      const missingRequiredParam = schemaKeys.find(key => {
        const schemaField = shape![key] as any;
        const isActuallyRequired = !schemaField.typeName?.startsWith('ZodOptional') && !schemaField.typeName?.startsWith('ZodDefault');
        return isActuallyRequired && !formData.connectionParams[key]?.trim();
      });
      if (missingRequiredParam) {
        const fieldDetails = shape![missingRequiredParam] as any;
        const displayName = fieldDetails?.description || fieldDetails?.display_name || missingRequiredParam;
        toast({ title: "Validation Error", description: `Connection parameter "${displayName}" is required.`, variant: "destructive" });
        return;
      }
    }

    if (formData.selected_provider_name !== 'custom' && Object.keys(formData.connectionParams).length > 0) {
      const { error: connParamError } = await supabase
        .from('mcp_connection_params')
        .upsert({
          user_id: user.id,
          provider_name: formData.selected_provider_name,
          connection_values: formData.connectionParams,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id, provider_name' });
      if (connParamError) {
        toast({ title: "Error", description: `Failed to save connection parameters: ${connParamError.message}`, variant: "destructive" });
        return;
      }
    }

    const operations: Promise<any>[] = [];
    let itemsSaved = 0, itemsDeselectedAndRemoved = 0;

    Object.values(actionFormsData).forEach(actionConfig => {
      if (!actionConfig.is_selected && !actionConfig.id) return;
      if (actionConfig.is_selected) {
        const dataToSave = {
          name: actionConfig.ai_name, provider_name: actionConfig.provider_name,
          action_name: actionConfig.action_name, action_display_name: actionConfig.display_name,
          instructions: actionConfig.instructions, expected_format: actionConfig.args_schema || {},
          output_schema: actionConfig.output_schema || {}, active: actionConfig.is_selected,
          user_id: user.id, category: getPascalCaseCategory(formData.selected_provider_name),
          mcp_server_base_url: formData.mcp_server_base_url,
        };
        if (actionConfig.id) {
          operations.push(supabase.from('mcp_endpoints').update(dataToSave).eq('id', actionConfig.id));
        } else {
          operations.push(supabase.from('mcp_endpoints').insert([dataToSave]));
        }
        itemsSaved++;
      } else if (actionConfig.id) {
        operations.push(supabase.from('mcp_endpoints').delete().eq('id', actionConfig.id));
        itemsDeselectedAndRemoved++;
      }
    });

    if (operations.length === 0 && itemsSaved === 0 && itemsDeselectedAndRemoved === 0) {
      toast({ title: "No Changes", description: "No actions selected or modified.", variant: "default" });
      internalResetForm();
      return;
    }

    try {
      const results = await Promise.all(operations);
      results.forEach(result => { if (result.error) throw result.error; });
      toast({ title: "Success", description: `Saved ${itemsSaved} action(s). ${itemsDeselectedAndRemoved > 0 ? `${itemsDeselectedAndRemoved} removed.` : ''}` });
      onSaveSuccess(); // Calls fetchEndpoints and hides form in parent
    } catch (error: any) {
      toast({ title: "Error", description: `Failed to save configurations: ${error.message}`, variant: "destructive" });
    }
  }, [user, formData, actionFormsData, discoveredProviders, getPascalCaseCategory, onSaveSuccess, internalResetForm /* supabase, toast stable */]);

  return (
    <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="w-full">
      <Card>
        <CardHeader>
          <CardTitle>
            {formData.selected_provider_name
              ? `Configure Actions for ${categoryMapUtil[formData.selected_provider_name] || formData.selected_provider_name}`
              : 'Select a Provider to Configure MCP Actions'}
          </CardTitle>
          <CardDescription>
            Configure an endpoint for external system integration
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            <div>
              <Label htmlFor="provider_select">Provider *</Label>
              {discoveryLoading && <p className="text-sm text-gray-500">Loading providers...</p>}
              {discoveryError && <p className="text-sm text-red-500">{discoveryError}</p>}
              {!discoveryLoading && !discoveryError && (
                <Select
                  value={formData.selected_provider_name}
                  onValueChange={handleProviderSelect}
                  disabled={!discoveredProviders || discoveredProviders.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {discoveredProviders?.map((provider) => (
                      <SelectItem key={provider.provider_name} value={provider.provider_name}>
                        {provider.display_name} ({provider.provider_name})
                      </SelectItem>
                    ))}
                    <SelectItem value="custom">Custom Provider</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {formData.selected_provider_name && (
            <>
              {formData.selected_provider_name === 'custom' && (
                <div>
                  <Label htmlFor="provider_name_custom">Custom Provider Name *</Label>
                  <Input
                    id="provider_name_custom"
                    value={formData.provider_name}
                    onChange={(e) => setFormData({ ...formData, provider_name: e.target.value })}
                    placeholder="Enter your custom provider identifier"
                  />
                  <p className="text-sm text-gray-500 mt-1">Your custom provider's unique name (e.g., my_internal_api).</p>
                </div>
              )}

              {Object.keys(actionFormsData).length > 0 && (
                <Card className="mt-4">
                  <CardHeader>
                    <CardTitle>Configure Actions for {categoryMapUtil[formData.selected_provider_name] || formData.selected_provider_name}</CardTitle>
                    <CardDescription>Select and configure the actions you want to enable.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {Object.entries(actionFormsData).map(([actionName, actionConfig]) => (
                      <Card key={actionName} className="p-4 space-y-3">
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id={`action-select-${actionName}`}
                            checked={actionConfig.is_selected}
                            onCheckedChange={(checked) => handleActionConfigChange(actionName, 'is_selected', !!checked)}
                          />
                          <Label htmlFor={`action-select-${actionName}`} className="text-lg font-medium">
                            {actionConfig.display_name} ({actionName})
                          </Label>
                        </div>
                        {actionConfig.is_selected && (
                           <div className="space-y-4 pl-6 border-l-2 border-gray-200 ml-2">
                              {/* Future per-action config can go here, e.g. instructions override */}
                           </div>
                        )}
                        <div>
                          <p className="text-sm text-gray-700 mt-1 bg-gray-50 p-2 rounded-md whitespace-pre-wrap">
                            {actionConfig.instructions || "No instructions provided."}
                          </p>
                        </div>
                        <div>
                          <Label className="text-sm font-semibold">Example Input (Args Schema):</Label>
                          <pre className="mt-1 p-2 text-xs bg-gray-50 rounded-md overflow-x-auto">
                            <code>
                              {actionConfig.sample_payload || JSON.stringify(actionConfig.args_schema || {}, null, 2)}
                            </code>
                          </pre>
                        </div>
                      </Card>
                    ))}
                  </CardContent>
                </Card>
              )}

              {formData.selected_provider_name && formData.selected_provider_name !== 'custom' && (
                loadingMainFormConnectionParams ? (
                  <div className="flex items-center p-4"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mr-2"></div><span>Loading connection details...</span></div>
                ) : (
                  (() => {
                    const providerData = discoveredProviders?.find(p => p.provider_name === formData.selected_provider_name);
                    const connectionSchema = providerData?.connection_schema;
                    const shape = connectionSchema?.typeName === 'ZodObject' && connectionSchema.shape ? connectionSchema.shape : null;

                    if (shape && Object.keys(shape).length > 0) {
                      return (
                        <div className="space-y-3 p-4 border rounded-md bg-gray-50/50">
                          <h4 className="text-md font-semibold text-gray-700">Connection Parameters for {providerData!.display_name}</h4>
                          {Object.entries(shape).map(([key, schemaValue]: [string, any]) => {
                            const isRequired = !schemaValue.typeName?.startsWith('ZodOptional') && !schemaValue.typeName?.startsWith('ZodDefault');
                            return (
                              <div key={key}>
                                <Label htmlFor={`form-conn-param-${key}`}>
                                  {schemaValue?.description || key.replace(/([A-Z])/g, ' $1').replace(/^./, (str: string) => str.toUpperCase())}
                                  {isRequired && <span className="text-red-500 ml-1">*</span>}
                                </Label>
                                <Input
                                  id={`form-conn-param-${key}`}
                                  type={(key.toLowerCase().includes('secret') || key.toLowerCase().includes('token') || key.toLowerCase().includes('key')) ? 'password' : 'text'}
                                  value={formData.connectionParams[key] || ''}
                                  onChange={(e) => setFormData(prev => ({ ...prev, connectionParams: { ...prev.connectionParams, [key]: e.target.value } }))}
                                  placeholder={schemaValue?.description || `Enter ${key}`}
                                  className="mt-1 bg-white"
                                />
                              </div>
                            );
                          })}
                        </div>
                      );
                    } else if (providerData && (!shape || Object.keys(shape).length === 0)) {
                      return <div className="p-4 border rounded-md bg-gray-50/50"><p className="text-sm text-gray-600">This provider ({providerData!.display_name}) does not require additional connection parameters.</p></div>;
                    }
                    return null;
                  })()
                )
              )}
            </>
          )}

          <div className="flex gap-2">
            <Button type="submit" disabled={userRole === 'demo'}> {/* Added disabled logic */}
              <Save className="h-4 w-4 mr-2" />
              Save Configuration
            </Button>
            <Button variant="outline" type="button" onClick={internalResetForm}> {/* Added type="button" */}
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
