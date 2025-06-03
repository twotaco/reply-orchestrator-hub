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
  'zendesk': 'Zendesk',
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
  instructions?: string;
  active: boolean;
  created_at: string;
  updated_at: string;
  // auth_token removed
  // output_schema is not directly stored on mcp_endpoints, but on discovered actions
}

interface DiscoveredProviderAction {
  action_name: string;
  display_name: string;
  description?: string;
  sample_payload?: any;
  output_schema?: any;
}

interface DiscoveredProvider {
  provider_name: string;
  display_name: string;
  description?: string;
  mcp_server_type: 'knowreply_managed' | 'self_hosted';
  actions: DiscoveredProviderAction[];
  connection_schema?: any;
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
  connectionParams: Record<string, string>; // Replaces auth_token
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
  sample_payload?: string;
  display_name?: string;
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
  // const [editingApiKey, setEditingApiKey] = useState<string>(''); // Deprecated
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
    mcp_server_base_url: 'https://mcp.knowreply.email', // Default
    provider_name: '',
    action_name: '',
    connectionParams: {}, // New
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

  const fetchDiscoveryData = async () => { /* ... same as before ... */
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
        // console.log("Fetched MCP Discovery Data:", data.providers);
      } else {
        throw new Error("Discovery data is not in the expected format (missing 'providers' array).");
      }
    } catch (error: any) {
      console.error('Detailed error fetching MCP discovery data:', error);
      setDiscoveryError(`Failed to fetch MCP discovery data. Details: ${error.message}. Check console for more info.`);
    } finally {
      setDiscoveryLoading(false);
    }
  };

  const handleInlineProviderSave = async () => { /* ... modified for connectionParams ... */
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

    if (anyActionSelected && providerData.connection_schema && typeof providerData.connection_schema === 'object') {
      const schemaKeys = Object.keys(providerData.connection_schema);
      const missingRequiredParam = schemaKeys.find(key => {
        const schemaField = providerData.connection_schema[key];
        return schemaField?.required && !editingConnectionParams[key]?.trim();
      });

      if (missingRequiredParam) {
        const fieldDetails = providerData.connection_schema[missingRequiredParam];
        const displayName = fieldDetails?.display_name || missingRequiredParam;
        toast({
          title: "Validation Error",
          description: `Connection parameter "${displayName}" is required when actions are selected.`,
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
          expected_format: discoveredAction.sample_payload || {},
          instructions: discoveredAction.description || '',
          active: true,
          user_id: user.id,
        };
        if (existingSavedAction) {
          operations.push(supabase.from('mcp_endpoints').update(dataToSave).eq('id', existingSavedAction.id));
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

    if (operations.length === 0 && Object.keys(editingConnectionParams).length === 0) { // Adjusted condition
      toast({title: "No Changes", description: "No changes were made."});
    } else {
        try {
          const results = await Promise.all(operations);
          results.forEach(result => { if (result.error) throw result.error; });
          toast({ title: "Success", description: `Successfully updated ${getPascalCaseCategory(editingCategory)}: ${itemsAdded} added, ${itemsUpdated} updated, ${itemsDeleted} removed. Connection parameters saved.` });
          fetchEndpoints();
        } catch (error: any) {
          toast({ title: "Error", description: `Failed to save configurations: ${error.message}`, variant: "destructive" });
        }
    }
    setEditingCategory(null);
    setEditingConnectionParams({});
    setEditingActionsSelection({});
  };

  const fetchEndpoints = async () => { /* ... modified to select specific columns ... */
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('mcp_endpoints')
        .select('id, name, category, mcp_server_base_url, provider_name, action_name, action_display_name, expected_format, instructions, active, created_at, updated_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setSavedConfiguredActions(data || []);
    } catch (error) {
      toast({ title: "Error", description: "Failed to fetch configured MCP actions.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => { /* ... modified for connectionParams ... */
    setFormData({
      name: '',
      selected_provider_name: '',
      mcp_server_base_url: 'https://mcp.knowreply.email',
      provider_name: '',
      action_name: '',
      connectionParams: {},
      expected_format: '{}',
      instructions: '',
    });
    setActionFormsData({});
    setShowAddForm(false);
  };

  const handleProviderSelect = async (selectedProviderNameValue: string) => { /* ... modified for connectionParams ... */
    const selectedDiscoveredProvider = discoveredProviders?.find(p => p.provider_name === selectedProviderNameValue);
    setFormData(prev => ({
      ...prev,
      selected_provider_name: selectedProviderNameValue,
      provider_name: selectedProviderNameValue === 'custom' ? '' : selectedProviderNameValue,
      action_name: '',
      connectionParams: {},
      instructions: selectedDiscoveredProvider?.description || (selectedProviderNameValue === 'custom' ? 'Define your custom provider.' : 'Select actions below.'),
    }));
    setActionFormsData({});

    if (selectedProviderNameValue && selectedProviderNameValue !== 'custom' && user && selectedDiscoveredProvider?.connection_schema) {
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
        const providerSchema = selectedDiscoveredProvider.connection_schema;
        if (providerSchema && typeof providerSchema === 'object') {
          Object.keys(providerSchema).forEach(key => {
            if (!(key in initialParams)) initialParams[key] = '';
          });
        }
        setFormData(prev => ({ ...prev, connectionParams: initialParams }));
        if (connParamsError && connParamsError.code !== 'PGRST116') {
          toast({ title: "Error", description: "Could not load connection parameters.", variant: "destructive" });
        }
      } catch (e) { /* ... */ }
      finally { setLoadingMainFormConnectionParams(false); }
    }
    // Populate actions
    const newActionFormsData: Record<string, ConfiguredActionData> = {};
    if (selectedDiscoveredProvider?.actions) {
      selectedDiscoveredProvider.actions.forEach(action => { /* ... */ }); // Simplified for brevity
    }
    setActionFormsData(newActionFormsData);
    setShowAddForm(true);
  };

  const handleSave = async () => { /* ... modified for connectionParams ... */
    if (!user || !formData.selected_provider_name) return;
    // ... validation for custom provider name ...
    const anyActionSelected = Object.values(actionFormsData).some(action => action.is_selected);
    const currentProviderData = discoveredProviders?.find(p => p.provider_name === formData.selected_provider_name);

    if (anyActionSelected && formData.selected_provider_name !== 'custom' && currentProviderData?.connection_schema) {
      const schemaKeys = Object.keys(currentProviderData.connection_schema);
      const missingRequiredParam = schemaKeys.find(key =>
        currentProviderData.connection_schema[key]?.required && !formData.connectionParams[key]?.trim()
      );
      if (missingRequiredParam) { /* ... toast error ... */ return; }
    }

    if (user && formData.selected_provider_name !== 'custom' && Object.keys(formData.connectionParams).length > 0) {
      const { error: connParamError } = await supabase.from('mcp_connection_params').upsert({
        user_id: user.id, provider_name: formData.selected_provider_name,
        connection_values: formData.connectionParams, updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id, provider_name' });
      if (connParamError) { /* ... toast error ... */ return; }
    }
    // ... rest of action saving logic (without auth_token) ...
    const operations: Promise<any>[] = []; // Simplified
    // ... loop through actionFormsData ...
    // dataToSave should not include auth_token
    // ...
    try {
      await Promise.all(operations);
      toast({ title: "Success", description: "Configuration saved."});
      fetchEndpoints(); resetForm();
    } catch (error: any) { /* ... toast error ... */ }
  };

  const handleTest = async (endpointToTest: MCPEndpoint, payloadString: string) => { /* ... modified for mcp_connection_params ... */
    setTestingId(endpointToTest.id); setTestResponse(null);
    if (!user) { /* ... toast error ... */ return; }
    if (!endpointToTest.mcp_server_base_url || !endpointToTest.provider_name || !endpointToTest.action_name) { /* ... */ return; }
    const mcpServerInternalApiKey = import.meta.env.VITE_MCP_SERVER_INTERNAL_API_KEY;
    if (!mcpServerInternalApiKey) { /* ... toast error ... */ return; }
    let payloadForArgs: any;
    try { payloadForArgs = JSON.parse(payloadString); } catch (e) { /* ... toast error ... */ return; }

    try {
      const { data: connParamsRecord, error: connParamsError } = await supabase
        .from('mcp_connection_params')
        .select('connection_values')
        .eq('user_id', user.id)
        .eq('provider_name', endpointToTest.provider_name!)
        .single();
      if (connParamsError || !connParamsRecord?.connection_values) { /* ... toast error ... */ return; }
      
      const testUrl = `${endpointToTest.mcp_server_base_url}/mcp/${endpointToTest.provider_name}/${endpointToTest.action_name}`;
      const newTestPayload = { args: payloadForArgs, auth: connParamsRecord.connection_values };
      const headers: any = { 'Content-Type': 'application/json', 'x-internal-api-key': mcpServerInternalApiKey };
      const response = await fetch(testUrl, { method: 'POST', headers, body: JSON.stringify(newTestPayload) });
      // ... (rest of response handling)
      const responseText = await response.text();
      setTestResponse(responseText); // Simplified
      toast({title: response.ok ? "Test OK" : "Test Fail"});

    } catch (error: any) { /* ... toast error ... */ }
    finally { setTestingId(null); }
  };

  // ... (toggleActive, loading return, groupedEndpoints) ...
  // JSX structure:
  return (
    <div className="space-y-6">
      {/* ... Header ... */}
      {showAddForm && (
        <form> {/* ... Card ... CardHeader ... */}
          <CardContent className="space-y-4">
            {/* ... Provider Select ... */}
            {/* ... Custom Provider Name Input ... */}

            {/* Connection Parameters Section for Main Form */}
            {formData.selected_provider_name && formData.selected_provider_name !== 'custom' && (
              loadingMainFormConnectionParams ? (
                <div className="flex items-center p-4"> {/* Loading indicator */} </div>
              ) : (
                (() => {
                  const providerData = discoveredProviders?.find(p => p.provider_name === formData.selected_provider_name);
                  // ADD LOGGING FOR MAIN FORM HERE
                  if (formData.selected_provider_name === 'woocommerce') {
                    console.log("[Main Form] WooCommerce providerData:", providerData);
                    if (providerData) {
                      console.log("[Main Form] WooCommerce connection_schema:", providerData.connection_schema);
                      console.log("[Main Form] WooCommerce connection_schema keys length:", Object.keys(providerData.connection_schema || {}).length);
                    }
                  }
                  const connectionSchema = providerData?.connection_schema;
                  if (connectionSchema && typeof connectionSchema === 'object' && Object.keys(connectionSchema).length > 0) {
                    return ( <div className="space-y-3 p-4 border rounded-md bg-gray-50/50"> {/* ... inputs ... */} </div> );
                  } else if (providerData) { /* ... no params needed message ... */ }
                  return null;
                })()
              )
            )}
            {/* ... Actions Section ... */}
            {/* ... Save/Cancel buttons ... */}
          </CardContent>
        </form>
      )}
      <Card> {/* ... Configured Endpoints List ... */}
        <CardContent>
          {Object.entries(groupedEndpoints).map(([category, actionsInGroup]) => (
            <div key={category} className="mb-8 p-4 border rounded-lg shadow-sm">
              {/* ... Category Header & Configure Button ... */}
              {editingCategory === category.toLowerCase() ? (
                <div className="p-4 border-t border-dashed mt-2 space-y-4">
                  {loadingConnectionParams ? ( /* ... loading ... */
                    <div className="flex items-center justify-center p-4"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div><p className="ml-2 text-sm text-gray-500">Loading...</p></div>
                  ) : (
                    (() => {
                      const providerData = discoveredProviders?.find(p => p.provider_name === editingCategory);
                      // ADD LOGGING FOR INLINE EDIT HERE
                      if (editingCategory === 'woocommerce') {
                        console.log("[Inline Edit] WooCommerce providerData:", providerData);
                        if (providerData) {
                          console.log("[Inline Edit] WooCommerce connection_schema:", providerData.connection_schema);
                          console.log("[Inline Edit] WooCommerce connection_schema keys length:", Object.keys(providerData.connection_schema || {}).length);
                        }
                      }
                      const connectionSchema = providerData?.connection_schema;
                      if (connectionSchema && typeof connectionSchema === 'object' && Object.keys(connectionSchema).length > 0) {
                        return ( <div className="space-y-3"> {/* ... inputs ... */} </div> );
                      } else if (providerData) { /* ... no params needed ... */ }
                      return null;
                    })()
                  )}
                  {/* ... Configure Actions Checkboxes ... */}
                  {/* ... Save/Cancel for Inline Edit ... */}
                </div>
              ) : ( /* ... Table of actions ... */ )}
            </div>
          ))}
        </CardContent>
      </Card>
      {/* ... Test Modal ... */}
    </div>
  );
}
