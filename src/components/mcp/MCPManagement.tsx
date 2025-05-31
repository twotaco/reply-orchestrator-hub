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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import { Plus, Edit, Trash2, TestTube, Save, X } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';

interface MCPEndpoint {
  id: string;
  name: string; // User-defined name for the AI to identify this tool, e.g., "stripe_getCustomerByEmail"
  category: string;
  mcp_server_base_url?: string; // Base URL of the MCP server, e.g., "http://localhost:8000"
  provider_name?: string; // e.g., "stripe", "hubspot"
  action_name?: string; // e.g., "getCustomerByEmail", "createTicket"
  auth_token?: string; // API key for the target provider
  expected_format?: any;
  instructions?: string;
  active: boolean;
  created_at: string;
  updated_at: string;
  // post_url is deprecated, will be constructed from base_url, provider_name, action_name by the MCP server
}

interface DiscoveredProviderAction {
  action_name: string;
  display_name: string;
  description?: string;
  sample_payload?: any; // Added for displaying sample payload
  // We might add expected_payload_schema and response_schema here later
}

interface DiscoveredProvider {
  provider_name: string;
  display_name: string;
  description?: string;
  mcp_server_type: 'knowreply_managed' | 'self_hosted'; // To know if it's a standard one we might pre-fill base URL for
  actions: DiscoveredProviderAction[];
}

interface MCPForm {
  name: string; // User-defined name, will be used as the identifier for the LLM
  selected_provider_name: string; // Renamed from category
  mcp_server_base_url: string;
  provider_name: string; // This will be set from selected_provider_name, or manually if custom
  action_name: string;
  auth_token: string; // API key for the target provider
  expected_format: string;
  instructions: string;
  // active: boolean; // Removed: Top-level active is deprecated
  // stripe_tools and server_type are deprecated in this new model
}

interface ConfiguredActionData {
  id?: string; // ID of the saved MCPEndpoint, if this action is already configured/saved
  ai_name: string;
  // auth_token: string; // Removed: API key is now provider-level
  is_selected: boolean;
  active: boolean; // Reflects the 'active' status from the database, used by the switch if already saved
  action_name: string;
  provider_name: string;
  instructions?: string;
  sample_payload?: string;
  display_name?: string;
}


// const categories array is now removed, will be fetched.

const stripeTools = [ // This might be deprecated or used differently for custom Stripe actions
  'create_customer',
  'retrieve_customer',
  'update_customer',
  'list_customers',
  'create_payment_intent',
  'retrieve_payment_intent',
  'create_subscription',
  'retrieve_subscription',
  'create_product',
  'create_price',
  'create_checkout_session',
  'search_knowledge_base'
];

export function MCPManagement() {
  const { user } = useAuth();
  // Renamed 'endpoints' to 'savedConfiguredActions' for clarity
  const [savedConfiguredActions, setSavedConfiguredActions] = useState<MCPEndpoint[]>([]);
  const [loading, setLoading] = useState(true); // For existing endpoints list
  // editingId might be deprecated if "edit" means selecting provider and seeing its actions
  // const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false); // Controls visibility of the configuration section
  const [testingId, setTestingId] = useState<string | null>(null);

  // New state for discovery client
  const [discoveredProviders, setDiscoveredProviders] = useState<DiscoveredProvider[] | null>(null);
  const [discoveryLoading, setDiscoveryLoading] = useState(true);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);

  // New state for action configurations based on selected provider
  const [actionFormsData, setActionFormsData] = useState<Record<string, ConfiguredActionData>>({});

  const [formData, setFormData] = useState<MCPForm>({
    name: '', // This field is deprecated for the main form, AI name is per action.
    selected_provider_name: '',
    mcp_server_base_url: '',
    provider_name: '', // Actual provider name (e.g. if selected_provider_name is 'custom')
    action_name: '', // Deprecated at this level
    auth_token: '', // Provider-level default auth token
    expected_format: '{}', // Deprecated at this level
    instructions: '', // Deprecated at this level
    active: true, // Deprecated at this level, active is per configured action
  });

  useEffect(() => {
    if (user) {
      fetchEndpoints(); // Fetches savedConfiguredActions
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
        console.log("Fetched MCP Discovery Data:", data.providers);
      } else {
        throw new Error("Discovery data is not in the expected format (missing 'providers' array).");
      }
    } catch (error: any) { // Added ': any' to access error properties more freely if needed, or type guard
      console.error('Detailed error fetching MCP discovery data:', error); // Log the full error object
      // Keep existing error message for UI
      setDiscoveryError(`Failed to fetch MCP discovery data. Details: ${error.message}. Check console for more info.`);
      // toast({ title: "Discovery Error", description: `Failed to fetch MCP providers: ${error.message}`, variant: "destructive" });
    } finally {
      setDiscoveryLoading(false);
    }
  };

  const fetchEndpoints = async () => { // Renamed to reflect it fetches saved configured actions
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('mcp_endpoints')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSavedConfiguredActions(data || []);
    } catch (error) {
      console.error('Error fetching configured MCP actions:', error);
      toast({
        title: "Error",
        description: "Failed to fetch configured MCP actions.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      selected_provider_name: '',
      mcp_server_base_url: '',
      provider_name: '',
      action_name: '',
      auth_token: '',
      expected_format: '{}',
      instructions: '',
      // active: true, // Removed
    });
    setActionFormsData({});
    // setEditingId(null); // Deprecated
    setShowAddForm(false);
  };

  const handleProviderSelect = (selectedProviderNameValue: string) => {
    const selectedDiscoveredProvider = discoveredProviders?.find(p => p.provider_name === selectedProviderNameValue);

    setFormData(prev => ({
      ...prev,
      selected_provider_name: selectedProviderNameValue,
      provider_name: selectedProviderNameValue === 'custom' ? '' : selectedProviderNameValue,
      action_name: '',
      mcp_server_base_url: 'https://mcp.knowreply.email',
      auth_token: '',
      instructions: selectedDiscoveredProvider?.description || (selectedProviderNameValue === 'custom' ? 'Define your custom provider.' : 'Select actions below.'),
      expected_format: '{}',
    }));

    const newActionFormsData: Record<string, ConfiguredActionData> = {};
    if (selectedDiscoveredProvider && selectedDiscoveredProvider.actions) {
      selectedDiscoveredProvider.actions.forEach(discoveredAction => {
        const savedAction = savedConfiguredActions.find(
          sa => sa.provider_name === selectedDiscoveredProvider.provider_name && sa.action_name === discoveredAction.action_name
        );
        newActionFormsData[discoveredAction.action_name] = {
          id: savedAction?.id,
          ai_name: `${selectedDiscoveredProvider.provider_name}_${discoveredAction.action_name}`, // Always auto-generate AI name
          // auth_token: savedAction?.auth_token || '', // Removed
          is_selected: !!savedAction, // Select if it's already saved
          active: savedAction ? savedAction.active : false, // Persist active state or default to false
          action_name: discoveredAction.action_name,
          provider_name: selectedDiscoveredProvider.provider_name,
          instructions: discoveredAction.description || "No specific instructions.",
          sample_payload: JSON.stringify(discoveredAction.sample_payload || {}, null, 2),
          display_name: discoveredAction.display_name || discoveredAction.action_name,
        };
      });
    }
    setActionFormsData(newActionFormsData);
    setShowAddForm(true); // Automatically show configuration section when a provider is selected
  };

  // handleServerTypeChange and handleStripeToolToggle are now deprecated and can be removed.
  // const handleServerTypeChange = (serverType: 'local' | 'remote') => { ... };
  // const handleStripeToolToggle = (tool: string, checked: boolean) => { ... };

  // const handleStripeToolToggle = (...) => { ... };

  const handleActionConfigChange = (actionName: string, field: keyof ConfiguredActionData, value: any) => {
    setActionFormsData(prev => ({
      ...prev,
      [actionName]: {
        ...prev[actionName],
        [field]: value,
      },
    }));
  };

  const handleSave = async () => {
    if (!user) return;
    if (!formData.selected_provider_name) {
        toast({ title: "Error", description: "Please select a provider first.", variant: "destructive" });
        return;
    }
    if (formData.selected_provider_name === 'custom' && !formData.provider_name) {
       toast({ title: "Validation Error", description: "For 'Custom' provider type, please specify the actual Provider Name.", variant: "destructive"});
       return;
    }
    // Removed validation for mcp_server_base_url as it's now fixed.

    // Check if any action is selected
    const anyActionSelected = Object.values(actionFormsData).some(action => action.is_selected);

    if (anyActionSelected && (!formData.auth_token || formData.auth_token.trim() === '')) {
      toast({
        title: "Validation Error",
        description: "Provider API Key is required when actions are selected.",
        variant: "destructive"
      });
      return;
    }

    const operations: Promise<any>[] = [];
    let errorOccurred = false;
    let itemsSaved = 0;
    let itemsDeselectedAndRemoved = 0;

    for (const actionConfig of Object.values(actionFormsData)) {
      if (!actionConfig.is_selected && !actionConfig.id) continue; // Skip if not selected and never saved

      if (actionConfig.is_selected) {
        // Removed validation for actionConfig.ai_name as it's now auto-generated
        // if (!actionConfig.ai_name) {
        //   toast({ title: "Validation Error", description: `Unique AI Name is required for action: ${actionConfig.display_name}.`, variant: "destructive" });
        //   errorOccurred = true;
        //   break;
        // }

        // const determinedAuthToken = actionConfig.auth_token || formData.auth_token || null; // Removed: auth_token is now only from formData
        let parsedSamplePayload = {};
        try {
          parsedSamplePayload = JSON.parse(actionConfig.sample_payload || '{}');
        } catch (e) {
          toast({ title: "JSON Error", description: `Invalid sample payload JSON for action ${actionConfig.display_name}.`, variant: "destructive" });
          errorOccurred = true;
          break;
        }

        const dataToSave = {
          name: actionConfig.ai_name,
          provider_name: actionConfig.provider_name,
          action_name: actionConfig.action_name,
          auth_token: formData.auth_token || null, // Use provider-level auth_token
          instructions: actionConfig.instructions,
          expected_format: parsedSamplePayload, // Save parsed JSON
          active: actionConfig.is_selected, // Active status is based on selection
          user_id: user.id,
          category: formData.selected_provider_name.toLowerCase(), // Ensure lowercase for category
          mcp_server_base_url: 'https://mcp.knowreply.email', // Hardcoded URL
        };

        if (actionConfig.id) { // Existing, selected action: Update
          operations.push(supabase.from('mcp_endpoints').update(dataToSave).eq('id', actionConfig.id));
        } else { // New, selected action: Insert
          operations.push(supabase.from('mcp_endpoints').insert([dataToSave]));
        }
        itemsSaved++;
      } else if (!actionConfig.is_selected && actionConfig.id) { // Existing, but now deselected: Delete
        operations.push(supabase.from('mcp_endpoints').delete().eq('id', actionConfig.id));
        itemsDeselectedAndRemoved++;
      }
    }

    if (errorOccurred) return;
    if (operations.length === 0 && itemsSaved === 0) {
        toast({title: "No Changes", description: "No actions were selected or modified to save.", variant: "default"});
        resetForm(); // Still reset/hide form
        return;
    }


    try {
      const results = await Promise.all(operations);
      results.forEach(result => {
        if (result.error) throw result.error;
      });
      toast({ title: "Success", description: `Successfully saved configurations for ${itemsSaved} action(s). ${itemsDeselectedAndRemoved > 0 ? `${itemsDeselectedAndRemoved} deselected action(s) removed.` : ''}` });
      fetchEndpoints(); // Refresh the main list
      resetForm(); // Hide the form and clear states
    } catch (error: any) {
      console.error('Error saving MCP configurations:', error);
      toast({ title: "Error", description: `Failed to save configurations: ${error.message}`, variant: "destructive" });
    }
  };

  const handleEdit = (endpoint: MCPEndpoint) => {
    setShowAddForm(true);
    // Set the provider for the form, which will trigger handleProviderSelect
    // handleProviderSelect will then merge with saved data, including the specific endpoint being edited.
    setFormData(prev => ({
        ...prev,
        selected_provider_name: endpoint.category, // This is the originally selected provider type
        mcp_server_base_url: endpoint.mcp_server_base_url || '',
        provider_name: endpoint.provider_name || endpoint.category, // Actual provider name
        auth_token: endpoint.auth_token || '', // This is the default provider key, action specific keys are in actionFormsData
    }));
    // Trigger handleProviderSelect manually IF selected_provider_name was already set to this value
    // otherwise the Select's onValueChange would handle it.
    // This ensures actions are populated even if clicking edit on an item whose provider is already selected.
     if (formData.selected_provider_name === endpoint.category) {
        handleProviderSelect(endpoint.category);
     } else {
        // Update selected_provider_name, which will trigger handleProviderSelect via the Select component's effect
         setFormData(prev => ({...prev, selected_provider_name: endpoint.category}));
     }
    // Note: The specific highlighting or scrolling to the edited action card is a UI enhancement not implemented here.
  };


  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this MCP endpoint?')) return;

    try {
      const { error } = await supabase
        .from('mcp_endpoints')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      toast({
        title: "Success",
        description: "MCP endpoint deleted successfully"
      });
      fetchEndpoints();
    } catch (error) {
      console.error('Error deleting MCP endpoint:', error);
      toast({
        title: "Error",
        description: "Failed to delete MCP endpoint",
        variant: "destructive"
      });
    }
  };

  const handleTest = async (endpoint: MCPEndpoint) => {
    setTestingId(endpoint.id);
    
    try {
      const testPayload = endpoint.expected_format || { test: true };
      const headers: any = { 'Content-Type': 'application/json' };
      
      if (endpoint.auth_token) {
        headers['Authorization'] = `Bearer ${endpoint.auth_token}`;
      }

      // TODO: Update handleTest to construct the full URL if needed,
      // or to send components to a test service that knows how to call the MCP server.
      // For now, this will likely fail if mcp_server_base_url is not a full callable URL by itself.
      const testUrl = endpoint.mcp_server_base_url; // This needs refinement for actual testing
      if (!testUrl) {
        toast({ title: "Test Error", description: "MCP Server Base URL is not configured.", variant: "destructive" });
        setTestingId(null);
        return;
      }

      const response = await fetch(testUrl, { // This will need to be updated
        method: 'POST',
        headers,
        body: JSON.stringify(testPayload)
      });

      const responseText = await response.text();
      
      toast({
        title: response.ok ? "Test Successful" : "Test Failed",
        description: `Status: ${response.status} - ${response.statusText}${responseText ? `\nResponse: ${responseText.substring(0, 100)}...` : ''}`,
        variant: response.ok ? "default" : "destructive"
      });
    } catch (error) {
      console.error('Error testing endpoint:', error);
      toast({
        title: "Test Failed",
        description: "Network error or invalid URL",
        variant: "destructive"
      });
    } finally {
      setTestingId(null);
    }
  };

  const toggleActive = async (id: string, active: boolean) => {
    try {
      const { error } = await supabase
        .from('mcp_endpoints')
        .update({ active: !active })
        .eq('id', id);

      if (error) throw error;
      fetchEndpoints();
    } catch (error) {
      console.error('Error updating endpoint status:', error);
      toast({
        title: "Error",
        description: "Failed to update endpoint status",
        variant: "destructive"
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">MCP Management</h1>
          <p className="text-gray-600 mt-2">Manage your Model Context Protocol endpoints</p>
        </div>
        <Button onClick={() => setShowAddForm(true)} disabled={showAddForm}>
          <Plus className="h-4 w-4 mr-2" />
          Add MCP Endpoint
        </Button>
      </div>

      {showAddForm && (
        <Card>
          <CardHeader>
            <CardTitle>
              {formData.selected_provider_name
                ? `Configure Actions for ${formData.selected_provider_name.charAt(0).toUpperCase() + formData.selected_provider_name.slice(1)}`
                : 'Select a Provider to Configure MCP Actions'}
            </CardTitle>
            <CardDescription>
              Configure an endpoint for external system integration
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4"> {/* Changed grid-cols-2 to grid-cols-1 as only one item remains here initially */}
              {/* MCP Endpoint Name input removed */}
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

            {/* Common fields for the selected provider - if selected_provider_name is set */}
            {formData.selected_provider_name && (
              <>
                {/* Provider Name input - only editable if "Custom" is selected from Provider dropdown */}
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
                {/* Redundant display of provider_name removed */}


                {/* Actions Section */}
                {Object.keys(actionFormsData).length > 0 && (
                  <Card className="mt-4">
                    <CardHeader>
                      <CardTitle>Configure Actions for {formData.provider_name || formData.selected_provider_name}</CardTitle>
                      <CardDescription>Select and configure the actions you want to enable for this provider.</CardDescription>
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
                              {/* AI Name input field removed */}
                              {/* Per-action API key input removed */}
                            </div>
                          )}
                          <div>
                            {/* Label is removed */}
                            <p className="text-sm text-gray-700 mt-1 bg-gray-50 p-2 rounded-md whitespace-pre-wrap">
                              {actionConfig.instructions || "No instructions provided."}
                            </p>
                          </div>
                          <div>
                            <Label className="text-sm font-semibold">Example Input:</Label>
                            <pre className="mt-1 p-2 text-xs bg-gray-50 rounded-md overflow-x-auto">
                              <code>
                                {actionConfig.sample_payload || "{}"}
                              </code>
                            </pre>
                          </div>
                        </Card>
                      ))}
                    </CardContent>
                  </Card>
                )}
                 {/* End Actions Section */}
              </>
            )}

            {/* The old top-level fields like instructions, expected_format, action_name, auth_token are now mostly per-action or deprecated */}
            {/* For example, a global auth_token might still be useful if all actions for a provider share one */}
             {formData.selected_provider_name && formData.selected_provider_name !== 'custom' && (
                <div>
                  <Label htmlFor="provider_auth_token">Provider API Key *</Label>
                  <Input
                    id="provider_auth_token"
                    type="password"
                    value={formData.auth_token} // This is the top-level auth_token now
                    onChange={(e) => setFormData({ ...formData, auth_token: e.target.value })}
                    placeholder={`API Key for ${formData.selected_provider_name} actions`}
                  />
                  {/* Descriptive paragraph removed */}
                </div>
             )}

            {/* Top-level active switch and its comment removed */}

            <div className="flex gap-2">
              <Button onClick={handleSave}>
                <Save className="h-4 w-4 mr-2" />
                {Object.values(actionFormsData).some(action => action.id) ? 'Update Configuration' : 'Save New Configuration'}
              </Button>
              <Button variant="outline" onClick={resetForm}>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>MCP Endpoints</CardTitle>
          <CardDescription>
            {savedConfiguredActions.length} endpoint{savedConfiguredActions.length !== 1 ? 's' : ''} configured
          </CardDescription>
        </CardHeader>
        <CardContent>
          {savedConfiguredActions.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No MCP endpoints configured yet. Add your first endpoint to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name (AI Identifier)</TableHead>
                  <TableHead>Category</TableHead>
                  {/* MCP Server Base URL column removed */}
                  <TableHead>Provider</TableHead>
                  <TableHead>Action</TableHead>
                  {/* <TableHead>Instructions</TableHead> */}
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {savedConfiguredActions.map((endpoint) => (
                  <TableRow key={endpoint.id}>
                    <TableCell className="font-medium">{endpoint.name}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {endpoint.category}
                      </span>
                    </TableCell>
                    {/* MCP Server Base URL cell removed */}
                     <TableCell>
                      <code className="text-sm bg-gray-100 px-2 py-1 rounded">
                        {endpoint.provider_name || 'N/A'}
                      </code>
                    </TableCell>
                     <TableCell>
                      <code className="text-sm bg-gray-100 px-2 py-1 rounded">
                        {endpoint.action_name || 'N/A'}
                      </code>
                    </TableCell>
                    {/* <TableCell>
                      {endpoint.instructions ? (
                        <span className="text-sm text-gray-600 truncate max-w-xs block">
                          {endpoint.instructions.substring(0, 30)}
                          {endpoint.instructions.length > 30 ? '...' : ''}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">No instructions</span>
                      )}
                    </TableCell> */}
                    <TableCell>
                      <Switch
                        checked={endpoint.active}
                        onCheckedChange={() => toggleActive(endpoint.id, endpoint.active)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleTest(endpoint)}
                          disabled={testingId === endpoint.id}
                        >
                          <TestTube className="h-4 w-4" />
                          {testingId === endpoint.id ? 'Testing...' : 'Test'}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(endpoint)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(endpoint.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
