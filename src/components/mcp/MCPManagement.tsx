import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import { Plus, Edit, Trash2, TestTube, Save, X } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';

const categoryMapUtil: { [key: string]: string } = {
  'calendly': 'Calendly',
  'custom': 'Custom',
  'hubspot': 'HubSpot',
  'intercom': 'Intercom',
  'klaviyo': 'Klaviyo',
  'mailchimp': 'Mailchimp',
  'shopify': 'Shopify',
  'stripe': 'Stripe',
  'supabase': 'Supabase',
  'woocommerce': 'WooCommerce',
  'wordpress': 'WordPress',
  'zendesk': 'Zendesk'
};

function getPascalCaseCategory(providerName: string): string {
  const lowerProviderName = providerName.toLowerCase();
  const mappedCategory = categoryMapUtil[lowerProviderName];
  if (mappedCategory) {
    return mappedCategory;
  } else {
    if (lowerProviderName === 'custom') {
        return 'Custom';
    }
    console.warn(
      `Category for provider '${providerName}' not found in categoryMapUtil. Defaulting to 'Custom'. ` +
      `Please update the map if this provider should have a specific PascalCase category.`
    );
    return 'Custom';
  }
}

interface MCPEndpoint {
  id: string;
  name: string;
  category: string;
  mcp_server_base_url?: string;
  provider_name?: string;
  action_name?: string;
  action_display_name?: string;
  expected_format?: any;
  output_schema?: any;
  instructions?: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

interface DiscoveredProviderAction {
  action_name: string;
  display_name: string;
  description?: string;
  sample_payload?: any;
  output_schema?: any;
  args_schema?: any;
}

interface DiscoveredProvider {
  provider_name: string;
  display_name: string;
  description?: string;
  actions: DiscoveredProviderAction[];
  connection_schema?: any; // This is the Zod schema object
}

interface MCPConnectionParamRecord {
  id: string;
  user_id: string;
  provider_name: string;
  connection_values: Record<string, any>;
  created_at: string;
  updated_at: string;
}

interface MCPForm {
  name: string;
  selected_provider_name: string;
  mcp_server_base_url: string;
  provider_name: string;
  action_name: string;
  connectionParams: Record<string, string>;
  expected_format: string;
  instructions: string;
}

interface ConfiguredActionData {
  id?: string;
  ai_name: string;
  is_selected: boolean;
  active: boolean;
  action_name: string;
  provider_name: string;
  instructions?: string;
  sample_payload?: string; // Retained for UI display
  display_name?: string;
  output_schema?: any;
  args_schema?: any; // Retained for saving to expected_format
}

export function MCPManagement() {
  const { user } = useAuth();
  const [savedConfiguredActions, setSavedConfiguredActions] = useState<MCPEndpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [testingEndpoint, setTestingEndpoint] = useState<MCPEndpoint | null>(null);
  const [currentTestPayload, setCurrentTestPayload] = useState<string>('');
  const [testResponse, setTestResponse] = useState<string | null>(null);

  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editingActionsSelection, setEditingActionsSelection] = useState<Record<string, boolean>>({});
  const [editingConnectionParams, setEditingConnectionParams] = useState<Record<string, string>>({});
  const [loadingConnectionParams, setLoadingConnectionParams] = useState<boolean>(false);

  const [discoveredProviders, setDiscoveredProviders] = useState<DiscoveredProvider[] | null>(null);
  const [discoveryLoading, setDiscoveryLoading] = useState(true);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);

  const [actionFormsData, setActionFormsData] = useState<Record<string, ConfiguredActionData>>({});

  const [formData, setFormData] = useState<MCPForm>({
    name: '',
    selected_provider_name: '',
    mcp_server_base_url: '',
    provider_name: '',
    action_name: '',
    connectionParams: {},
    expected_format: '{}',
    instructions: '',
  });
  const [loadingMainFormConnectionParams, setLoadingMainFormConnectionParams] = useState<boolean>(false);

  useEffect(() => {
    if (user) {
      fetchEndpoints();
      fetchDiscoveryData();
    }
  }, [user]);

  const fetchDiscoveryData = async () => {
    setDiscoveryLoading(true);
    setDiscoveryError(null);
    try {
      const response = await fetch('https://mcp.knowreply.email/discover');
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      if (data && Array.isArray(data.providers)) {
        setDiscoveredProviders(data.providers);
      } else {
        throw new Error("Discovery data is not in the expected format (missing 'providers' array).");
      }
    } catch (error: any) {
      console.error('Detailed error fetching MCP discovery data:', error);
      setDiscoveryError(`Failed to fetch MCP discovery data. Details: ${error.message}.`);
    } finally {
      setDiscoveryLoading(false);
    }
  };

  const handleInlineProviderSave = async () => {
    if (!editingCategory || !user) {
      toast({ title: "Error", description: "Editing context is missing.", variant: "destructive" });
      return;
    }

    const providerData = discoveredProviders?.find(p => p.provider_name === editingCategory);
    if (!providerData) {
      toast({ title: "Error", description: `Could not find discoverable provider data for ${editingCategory}.`, variant: "destructive" });
      return;
    }

    const anyActionSelected = Object.values(editingActionsSelection).some(isSelected => isSelected);
    if (anyActionSelected && providerData.connection_schema) {
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

    if (user && editingCategory && Object.keys(editingConnectionParams).length > 0) {
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

    const currentSavedActionsInThisCategory = savedConfiguredActions.filter(
      sa => sa.provider_name === editingCategory
    );
    const operations: Promise<any>[] = [];
    let itemsUpdated = 0, itemsAdded = 0, itemsDeleted = 0;

    for (const discoveredAction of providerData.actions) {
      const isSelected = !!editingActionsSelection[discoveredAction.action_name];
      const existingSavedAction = currentSavedActionsInThisCategory.find(sa => sa.action_name === discoveredAction.action_name);

      if (isSelected) {
        const dataToSave = {
          name: `${editingCategory}_${discoveredAction.action_name}`,
          category: getPascalCaseCategory(editingCategory),
          mcp_server_base_url: 'https://mcp.knowreply.email',
          provider_name: editingCategory,
          action_name: discoveredAction.action_name,
          action_display_name: discoveredAction.display_name || discoveredAction.action_name,
          expected_format: discoveredAction.args_schema || {}, // Use args_schema
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
      } else if (existingSavedAction) {
        operations.push(supabase.from('mcp_endpoints').delete().eq('id', existingSavedAction.id));
        itemsDeleted++;
      }
    }

    if (operations.length === 0 && Object.keys(editingConnectionParams).length === 0 && !anyActionSelected) {
        toast({title: "No Changes", description: "No changes were made to this provider's configuration."});
        setEditingCategory(null); setEditingConnectionParams({}); setEditingActionsSelection({});
        return;
    }
    try {
      const results = await Promise.all(operations);
      results.forEach(result => { if (result.error) throw result.error; });
      toast({ title: "Success", description: `Successfully updated ${getPascalCaseCategory(editingCategory)}: ${itemsAdded} added, ${itemsUpdated} updated, ${itemsDeleted} removed. Connection parameters saved.` });
      fetchEndpoints();
      setEditingCategory(null); setEditingConnectionParams({}); setEditingActionsSelection({});
    } catch (error: any) {
      console.error('Error saving inline MCP configurations:', error);
      toast({ title: "Error", description: `Failed to save configurations: ${error.message}`, variant: "destructive" });
    }
  };

  const fetchEndpoints = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('mcp_endpoints')
        .select('id, name, category, mcp_server_base_url, provider_name, action_name, action_display_name, expected_format, output_schema, instructions, active, created_at, updated_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setSavedConfiguredActions(data || []);
    } catch (error) {
      console.error('Error fetching configured MCP actions:', error);
      toast({ title: "Error", description: "Failed to fetch configured MCP actions.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({ name: '', selected_provider_name: '', mcp_server_base_url: '', provider_name: '', action_name: '', connectionParams: {}, expected_format: '{}', instructions: '' });
    setActionFormsData({});
    setShowAddForm(false);
  };

  const handleProviderSelect = async (selectedProviderNameValue: string) => {
    const selectedDiscoveredProvider = discoveredProviders?.find(p => p.provider_name === selectedProviderNameValue);
    setFormData(prev => ({ ...prev, selected_provider_name: selectedProviderNameValue, provider_name: selectedProviderNameValue === 'custom' ? '' : selectedProviderNameValue, action_name: '', mcp_server_base_url: 'https://mcp.knowreply.email', connectionParams: {}, instructions: selectedDiscoveredProvider?.description || (selectedProviderNameValue === 'custom' ? 'Define your custom provider.' : 'Select actions below.'), expected_format: '{}' }));
    setActionFormsData({});
    if (selectedProviderNameValue && selectedProviderNameValue !== 'custom' && user) {
      setLoadingMainFormConnectionParams(true);
      try {
        const { data: connParamsData, error: connParamsError } = await supabase.from('mcp_connection_params').select('connection_values').eq('user_id', user.id).eq('provider_name', selectedProviderNameValue).single();
        let initialParams: Record<string, string> = {};
        if (connParamsData?.connection_values) initialParams = connParamsData.connection_values as Record<string, string>;

        const connectionSchema = selectedDiscoveredProvider?.connection_schema;
        const shape = connectionSchema?.typeName === 'ZodObject' && connectionSchema.shape ? connectionSchema.shape : null;
        if (shape) {
          Object.keys(shape).forEach(key => { if (!(key in initialParams)) initialParams[key] = ''; });
        }
        setFormData(prev => ({ ...prev, connectionParams: initialParams }));
        if (connParamsError && connParamsError.code !== 'PGRST116') {
          console.error("Error fetching main form connection params:", connParamsError);
          toast({ title: "Error", description: "Could not load existing connection parameters.", variant: "destructive" });
        }
      } catch (e) {
        console.error("Exception fetching main form connection params:", e);
        toast({ title: "Error", description: "An unexpected error occurred.", variant: "destructive" });
      } finally {
        setLoadingMainFormConnectionParams(false);
      }
    }

    const newActionFormsData: Record<string, ConfiguredActionData> = {};
    if (selectedDiscoveredProvider?.actions) {
      selectedDiscoveredProvider.actions.forEach(discoveredAction => {
        const savedAction = savedConfiguredActions.find(sa => sa.provider_name === selectedDiscoveredProvider.provider_name && sa.action_name === discoveredAction.action_name);
        newActionFormsData[discoveredAction.action_name] = {
          id: savedAction?.id,
          ai_name: `${selectedDiscoveredProvider.provider_name}_${discoveredAction.action_name}`,
          is_selected: !!savedAction, active: savedAction ? savedAction.active : false,
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
    setShowAddForm(true);
  };

  const handleActionConfigChange = (actionName: string, field: keyof ConfiguredActionData, value: any) => {
    setActionFormsData(prev => ({ ...prev, [actionName]: { ...prev[actionName], [field]: value } }));
  };

  const handleSave = async () => {
    if (!user) return;
    if (!formData.selected_provider_name) { toast({ title: "Error", description: "Please select a provider.", variant: "destructive" }); return; }
    if (formData.selected_provider_name === 'custom' && !formData.provider_name) { toast({ title: "Validation Error", description: "For 'Custom' provider, specify Provider Name.", variant: "destructive"}); return; }

    const anyActionSelected = Object.values(actionFormsData).some(action => action.is_selected);
    const currentProviderData = discoveredProviders?.find(p => p.provider_name === formData.selected_provider_name);

    if (anyActionSelected && formData.selected_provider_name && formData.selected_provider_name !== 'custom' && currentProviderData?.connection_schema) {
      const connectionSchema = currentProviderData.connection_schema;
      const shape = connectionSchema?.typeName === 'ZodObject' && connectionSchema.shape ? connectionSchema.shape : null;
      const schemaKeys = shape ? Object.keys(shape) : [];
      const missingRequiredParam = schemaKeys.find(key => {
        const schemaField = shape![key] as any;
        const isActuallyRequired = !schemaField.typeName?.startsWith('ZodOptional') && !schemaField.typeName?.startsWith('ZodDefault');
        return isActuallyRequired && !formData.connectionParams[key]?.trim();
      });

      if (missingRequiredParam) {
        const fieldDetails = shape && shape[missingRequiredParam] ? (shape[missingRequiredParam] as any) : null;
        const displayName = fieldDetails?.description || fieldDetails?.display_name || missingRequiredParam;
        toast({ title: "Validation Error", description: `Connection parameter "${displayName}" for ${currentProviderData.display_name} is required.`, variant: "destructive" });
        return;
      }
    }

    if (user && formData.selected_provider_name && formData.selected_provider_name !== 'custom' && Object.keys(formData.connectionParams).length > 0) {
      const { error: connParamError } = await supabase.from('mcp_connection_params').upsert({ user_id: user.id, provider_name: formData.selected_provider_name, connection_values: formData.connectionParams, updated_at: new Date().toISOString() }, { onConflict: 'user_id, provider_name' });
      if (connParamError) { console.error('Error saving connection params (main form):', connParamError); toast({ title: "Error", description: `Connection params save failed: ${connParamError.message}`, variant: "destructive" }); return; }
    }

    const operations: Promise<any>[] = [];
    let errorOccurred = false, itemsSaved = 0, itemsDeselectedAndRemoved = 0;

    for (const actionConfig of Object.values(actionFormsData)) {
      if (!actionConfig.is_selected && !actionConfig.id) continue;
      if (actionConfig.is_selected) {
        const dataToSave = {
          name: actionConfig.ai_name, provider_name: actionConfig.provider_name, action_name: actionConfig.action_name,
          action_display_name: actionConfig.display_name, instructions: actionConfig.instructions,
          expected_format: actionConfig.args_schema || {}, // Use args_schema
          output_schema: actionConfig.output_schema || {},
          active: actionConfig.is_selected, user_id: user.id, category: getPascalCaseCategory(formData.selected_provider_name),
          mcp_server_base_url: 'https://mcp.knowreply.email',
        };
        if (actionConfig.id) { operations.push(supabase.from('mcp_endpoints').update(dataToSave).eq('id', actionConfig.id)); }
        else { operations.push(supabase.from('mcp_endpoints').insert([dataToSave])); }
        itemsSaved++;
      } else if (!actionConfig.is_selected && actionConfig.id) {
        operations.push(supabase.from('mcp_endpoints').delete().eq('id', actionConfig.id));
        itemsDeselectedAndRemoved++;
      }
    }

    if (errorOccurred) return;
    if (operations.length === 0 && itemsSaved === 0) { toast({title: "No Changes", description: "No actions selected/modified."}); resetForm(); return; }

    try {
      const results = await Promise.all(operations);
      results.forEach(result => { if (result.error) throw result.error; });
      toast({ title: "Success", description: `Saved ${itemsSaved} action(s). ${itemsDeselectedAndRemoved > 0 ? `${itemsDeselectedAndRemoved} removed.` : ''}` });
      fetchEndpoints(); resetForm();
    } catch (error: any) {
      console.error('Error saving MCP configurations:', error);
      toast({ title: "Error", description: `Save failed: ${error.message}`, variant: "destructive" });
    }
  };

  const handleEdit = (endpoint: MCPEndpoint) => { /* ... existing logic ... */ };
  const handleDelete = async (id: string) => { /* ... existing logic ... */ };
  const handleTest = async (endpointToTest: MCPEndpoint, payloadString: string) => { /* ... existing logic ... */ };
  const toggleActive = async (id: string, active: boolean) => { /* ... existing logic ... */ };

  if (loading) { /* ... existing logic ... */ }

  const groupedEndpoints: { [category: string]: MCPEndpoint[] } = savedConfiguredActions.reduce((acc, endpoint) => { /* ... existing logic ... */
      const category = endpoint.category || 'Uncategorized';
      if (!acc[category]) { acc[category] = []; }
      acc[category].push(endpoint);
      return acc;
    }, {} as { [category: string]: MCPEndpoint[] });

  return (
    <div className="space-y-6">
      {/* ... existing JSX structure ... */}
      {showAddForm && (
        // ... form JSX ...
        // Main Form Connection Params Rendering:
            {formData.selected_provider_name && formData.selected_provider_name !== 'custom' && (
              loadingMainFormConnectionParams ? (
                <div className="flex items-center p-4"> <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mr-2"></div> <span>Loading connection details...</span> </div>
              ) : (
                (() => {
                  const providerData = discoveredProviders?.find(p => p.provider_name === formData.selected_provider_name);
                  const connectionSchema = providerData?.connection_schema;
                  const shape = connectionSchema?.typeName === 'ZodObject' && connectionSchema.shape ? connectionSchema.shape : null;

                  if (shape && Object.keys(shape).length > 0) {
                    return (
                      <div className="space-y-3 p-4 border rounded-md bg-gray-50/50">
                        <h4 className="text-md font-semibold text-gray-700"> Connection Parameters for {providerData!.display_name} </h4>
                        {Object.entries(shape).map(([key, schemaValue]: [string, any]) => {
                          const isRequired = !schemaValue.typeName?.startsWith('ZodOptional') && !schemaValue.typeName?.startsWith('ZodDefault');
                          return (
                            <div key={key}>
                              <Label htmlFor={`form-conn-param-${key}`}>
                                {schemaValue?.description || key.replace(/([A-Z])/g, ' $1').replace(/^./, (str: string) => str.toUpperCase())}
                                {isRequired && <span className="text-red-500 ml-1">*</span>}
                              </Label>
                              <Input id={`form-conn-param-${key}`}
                                type={(key.toLowerCase().includes('secret') || key.toLowerCase().includes('token') || key.toLowerCase().includes('key')) ? 'password' : 'text'}
                                value={formData.connectionParams[key] || ''}
                                onChange={(e) => setFormData(prev => ({ ...prev, connectionParams: { ...prev.connectionParams, [key]: e.target.value } })) }
                                placeholder={schemaValue?.description || `Enter ${key}`}
                                className="mt-1 bg-white" />
                            </div>
                          );
                        })}
                      </div>
                    );
                  } else if (providerData) {
                    return ( <div className="p-4 border rounded-md bg-gray-50/50"> <p className="text-sm text-gray-600">This provider ({providerData!.display_name}) does not require additional connection parameters.</p> </div> );
                  }
                  return null;
                })()
              )
            )}
        // ... rest of form JSX ...
      )}
      {/* ... existing JSX for displaying grouped endpoints ... */}
      {Object.entries(groupedEndpoints).map(([category, actionsInGroup]) => (
        // ... existing category group JSX ...
        editingCategory === category.toLowerCase() ? (
          <div className="p-4 border-t border-dashed mt-2 space-y-4">
            {loadingConnectionParams ? ( /* ... loading ... */ ) : (
              (() => {
                const providerData = discoveredProviders?.find(p => p.provider_name === editingCategory);
                const connectionSchema = providerData?.connection_schema;
                const shape = connectionSchema?.typeName === 'ZodObject' && connectionSchema.shape ? connectionSchema.shape : null;

                if (shape && Object.keys(shape).length > 0) {
                  return (
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
                            <Input id={`conn-param-${key}`}
                              type={(key.toLowerCase().includes('secret') || key.toLowerCase().includes('token') || key.toLowerCase().includes('key')) ? 'password' : 'text'}
                              value={editingConnectionParams[key] || ''}
                              onChange={(e) => setEditingConnectionParams(prev => ({ ...prev, [key]: e.target.value })) }
                              placeholder={schemaValue?.description || `Enter ${key}`}
                              className="mt-1" />
                          </div>
                        );
                      })}
                    </div>
                  );
                } else if (providerData) {
                   return <p className="text-sm text-gray-500">This provider ({providerData.display_name}) does not require additional connection parameters.</p>;
                }
                return null;
              })()
            )}
            {/* ... rest of inline editing form ... */}
          </div>
        ) : ( /* ... table display ... */ )
      ))}
      {/* ... Test modal ... */}
    </div>
  );
}
