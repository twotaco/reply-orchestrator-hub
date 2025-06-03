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

const categoryMapUtil: { [key: string]: string } = { // Renamed to avoid conflict if any other 'categoryMap' exists in global scope for some reason
  'calendly': 'Calendly',
  'hubspot': 'HubSpot',
  'klaviyo': 'Klaviyo',
  'shopify': 'Shopify',
  'stripe': 'Stripe',
  'zendesk': 'Zendesk',
  'supabase': 'Supabase',
  'mailchimp': 'Mailchimp',
  'intercom': 'Intercom',
  'custom': 'Custom'
};

function getPascalCaseCategory(providerName: string): string {
  const lowerProviderName = providerName.toLowerCase(); // Ensure lookup is case-insensitive
  const mappedCategory = categoryMapUtil[lowerProviderName];
  if (mappedCategory) {
    return mappedCategory;
  } else {
    // If providerName was 'custom' and somehow missed the map (e.g. map was incomplete), ensure it's 'Custom'
    if (lowerProviderName === 'custom') {
        return 'Custom';
    }
    // For any other unmapped provider, log a warning and default to 'Custom'.
    console.warn(
      `Category for provider '${providerName}' not found in categoryMapUtil. Defaulting to 'Custom'. ` +
      `Please update the map if this provider should have a specific PascalCase category.`
    );
    return 'Custom';
  }
}

interface MCPEndpoint {
  id: string;
  name: string; // User-defined name for the AI to identify this tool, e.g., "stripe_getCustomerByEmail"
  category: string;
  mcp_server_base_url?: string; // Base URL of the MCP server, e.g., "http://localhost:8000"
  provider_name?: string; // e.g., "stripe", "hubspot"
  action_name?: string; // e.g., "getCustomerByEmail", "createTicket"
  action_display_name?: string; // User-friendly display name for the action
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
  connection_schema?: any;
}

interface MCPConnectionParamRecord {
  id: string;
  user_id: string;
  provider_name: string;
  connection_values: Record<string, any>; // Represents the JSONB content
  created_at: string;
  updated_at: string;
}

interface MCPForm {
  name: string; // User-defined name, will be used as the identifier for the LLM
  selected_provider_name: string; // Renamed from category
  mcp_server_base_url: string;
  provider_name: string; // This will be set from selected_provider_name, or manually if custom
  action_name: string;
  // auth_token: string; // API key for the target provider - Now part of connectionParams
  connectionParams: Record<string, string>;
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

// categoryMap definition removed from here, moved outside and renamed to categoryMapUtil within getPascalCaseCategory scope

export function MCPManagement() {
  const { user } = useAuth();
  // Renamed 'endpoints' to 'savedConfiguredActions' for clarity
  const [savedConfiguredActions, setSavedConfiguredActions] = useState<MCPEndpoint[]>([]);
  const [loading, setLoading] = useState(true); // For existing endpoints list
  // editingId might be deprecated if "edit" means selecting provider and seeing its actions
  // const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false); // Controls visibility of the configuration section
  const [testingId, setTestingId] = useState<string | null>(null); // Used for disabling button during actual test execution

  // State for Test Payload Modal
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [testingEndpoint, setTestingEndpoint] = useState<MCPEndpoint | null>(null); // Endpoint being prepared for test in modal
  const [currentTestPayload, setCurrentTestPayload] = useState<string>('');
  const [testResponse, setTestResponse] = useState<string | null>(null); // State for storing test response

  // State for Inline Provider Editing
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editingApiKey, setEditingApiKey] = useState<string>(''); // This will be deprecated by editingConnectionParams
  const [editingActionsSelection, setEditingActionsSelection] = useState<Record<string, boolean>>({});
  const [editingConnectionParams, setEditingConnectionParams] = useState<Record<string, string>>({});
  const [loadingConnectionParams, setLoadingConnectionParams] = useState<boolean>(false);

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
    connectionParams: {}, // Provider-level connection parameters
    expected_format: '{}', // Deprecated at this level
    instructions: '', // Deprecated at this level
    active: true, // Deprecated at this level, active is per configured action
  });
  const [loadingMainFormConnectionParams, setLoadingMainFormConnectionParams] = useState<boolean>(false);

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

  const handleInlineProviderSave = async () => {
    if (!editingCategory || !user) {
      toast({ title: "Error", description: "Editing context is missing.", variant: "destructive" });
      return;
    }

    const anyActionSelectedInInlineEdit = Object.values(editingActionsSelection).some(isSelected => isSelected);
    if (anyActionSelectedInInlineEdit && (!editingApiKey || editingApiKey.trim() === '')) {
      toast({
        title: "Validation Error",
        description: "Provider API Key is required when actions are selected for this provider.",
        variant: "destructive"
      });
      return;
    }

    const providerData = discoveredProviders?.find(p => p.provider_name === editingCategory);
    if (!providerData) {
      toast({ title: "Error", description: `Could not find discoverable provider data for ${editingCategory}.`, variant: "destructive" });
      return;
    }

    // Validation for connection parameters
    const anyActionSelected = Object.values(editingActionsSelection).some(isSelected => isSelected);
    if (anyActionSelected && providerData.connection_schema && typeof providerData.connection_schema === 'object') {
      const schemaKeys = Object.keys(providerData.connection_schema);
      const missingRequiredParam = schemaKeys.find(key => {
        const schemaField = providerData.connection_schema[key];
        // Simple check: if schema defines it as required (e.g. has a 'required: true' property)
        // For now, let's assume all schema fields are required if actions are selected, unless explicitly optional.
        // A more robust solution would be to check a `required` flag in the schema.
        // For this iteration, we'll check if any param defined in schema is empty.
        return !editingConnectionParams[key]?.trim();
      });

      if (missingRequiredParam) {
        const fieldDetails = providerData.connection_schema[missingRequiredParam];
        const displayName = fieldDetails?.display_name || missingRequiredParam;
        toast({
          title: "Validation Error",
          description: `Connection parameter "${displayName}" is required when actions are selected for this provider.`,
          variant: "destructive"
        });
        return;
      }
    }

    // Upsert connection parameters
    if (user && editingCategory) {
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
        return; // Stop if connection params fail to save
      }
    }


    const currentSavedActionsInThisCategory = savedConfiguredActions.filter(
      sa => sa.provider_name === editingCategory // provider_name is lowercase from DB
    );
    const operations: Promise<any>[] = [];
    let itemsUpdated = 0;
    let itemsAdded = 0;
    let itemsDeleted = 0;

    // Process discoverable actions for inserts or updates
    for (const discoveredAction of providerData.actions) {
      const isSelected = !!editingActionsSelection[discoveredAction.action_name];
      const existingSavedAction = currentSavedActionsInThisCategory.find(sa => sa.action_name === discoveredAction.action_name);

      if (isSelected) {
        const dataToSave = {
          name: `${editingCategory}_${discoveredAction.action_name}`, // AI Name
          category: getPascalCaseCategory(editingCategory), // PascalCase for DB 'category' field
          mcp_server_base_url: 'https://mcp.knowreply.email',
          provider_name: editingCategory, // Lowercase provider name for DB 'provider_name' field
          action_name: discoveredAction.action_name,
          action_display_name: discoveredAction.display_name || discoveredAction.action_name,
          // auth_token: editingApiKey.trim(), // Removed: API key is now provider-level via mcp_connection_params
          expected_format: discoveredAction.sample_payload || {},
          instructions: discoveredAction.description || '',
          active: true, // If selected in UI, it's active
          user_id: user.id,
        };
        if (existingSavedAction) { // Update existing
          operations.push(supabase.from('mcp_endpoints').update({
            ...dataToSave,
            id: existingSavedAction.id // ensure id is part of update payload for clarity, though not strictly needed for .eq
          }).eq('id', existingSavedAction.id));
          itemsUpdated++;
        } else { // Insert new
          operations.push(supabase.from('mcp_endpoints').insert([dataToSave]));
          itemsAdded++;
        }
      } else { // Not selected in UI
        if (existingSavedAction) { // Was saved, now deselected: Delete
          operations.push(supabase.from('mcp_endpoints').delete().eq('id', existingSavedAction.id));
          itemsDeleted++;
        }
      }
    }

    if (operations.length === 0) {
      toast({title: "No Changes", description: "No changes were made to this provider's configuration."});
      setEditingCategory(null);
      setEditingApiKey('');
      setEditingActionsSelection({});
      return;
    }

    try {
      const results = await Promise.all(operations);
      results.forEach(result => {
        if (result.error) throw result.error;
      });
      toast({ title: "Success", description: `Successfully updated ${getPascalCaseCategory(editingCategory)}: ${itemsAdded} added, ${itemsUpdated} updated, ${itemsDeleted} removed. Connection parameters saved.` });
      fetchEndpoints(); // Refresh the main list
      setEditingCategory(null); // Close inline editor on success
      setEditingConnectionParams({});
      setEditingActionsSelection({});
    } catch (error: any) {
      console.error('Error saving inline MCP configurations:', error); // Changed from 'or connection params' as conn params save is tried first
      toast({ title: "Error", description: `Failed to save configurations: ${error.message}`, variant: "destructive" });
      // Do not close/reset form on error, user might want to retry if only action saving failed
    }
    // finally block removed as success/error handles reset if all operations succeed.
  };

  const fetchEndpoints = async () => { // Renamed to reflect it fetches saved configured actions
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('mcp_endpoints')
        .select('id, name, category, mcp_server_base_url, provider_name, action_name, action_display_name, expected_format, instructions, active, created_at, updated_at') // Explicitly select columns
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
      connectionParams: {}, // Reset connection params
      expected_format: '{}',
      instructions: '',
      // active: true, // Removed
    });
    setActionFormsData({});
    // setEditingId(null); // Deprecated
    setShowAddForm(false);
  };

  const handleProviderSelect = async (selectedProviderNameValue: string) => {
    const selectedDiscoveredProvider = discoveredProviders?.find(p => p.provider_name === selectedProviderNameValue);

    // Initial form data update, clear previous connection params
    setFormData(prev => ({
      ...prev,
      selected_provider_name: selectedProviderNameValue,
      provider_name: selectedProviderNameValue === 'custom' ? '' : selectedProviderNameValue,
      action_name: '', // Deprecated at this level
      mcp_server_base_url: 'https://mcp.knowreply.email', // Default MCP server
      connectionParams: {}, // Clear previous params
      instructions: selectedDiscoveredProvider?.description || (selectedProviderNameValue === 'custom' ? 'Define your custom provider.' : 'Select actions below.'),
      expected_format: '{}', // Deprecated at this level
    }));

    setActionFormsData({}); // Clear previous action forms data

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
        if (connParamsData && connParamsData.connection_values) {
          initialParams = connParamsData.connection_values as Record<string, string>;
        }

        // Ensure all schema fields are present in initialParams, defaulting to empty string
        const providerSchema = selectedDiscoveredProvider?.connection_schema;
        if (providerSchema && typeof providerSchema === 'object' && providerSchema !== null) {
          Object.keys(providerSchema).forEach(key => {
            if (!(key in initialParams)) {
              initialParams[key] = '';
            }
          });
        }

        setFormData(prev => ({ ...prev, connectionParams: initialParams }));

        if (connParamsError && connParamsError.code !== 'PGRST116') { // PGRST116: single row not found
          console.error("Error fetching main form connection params:", connParamsError);
          toast({ title: "Error", description: "Could not load existing connection parameters for this provider.", variant: "destructive" });
        }
      } catch (e) {
        console.error("Exception fetching main form connection params:", e);
        toast({ title: "Error", description: "An unexpected error occurred while loading connection parameters.", variant: "destructive" });
      } finally {
        setLoadingMainFormConnectionParams(false);
      }
    }


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
    const currentProviderData = discoveredProviders?.find(p => p.provider_name === formData.selected_provider_name);

    // Validation for connection parameters in the main form
    if (anyActionSelected &&
        formData.selected_provider_name &&
        formData.selected_provider_name !== 'custom' &&
        currentProviderData?.connection_schema &&
        typeof currentProviderData.connection_schema === 'object') {

      const schemaKeys = Object.keys(currentProviderData.connection_schema);
      const missingRequiredParam = schemaKeys.find(key => {
        const schemaField = currentProviderData.connection_schema[key];
        // Basic check: if schema defines it, assume it's required for now if actions are selected
        // A more robust check would use a 'required' flag in schemaField
        return !formData.connectionParams[key]?.trim();
      });

      if (missingRequiredParam) {
        const fieldDetails = currentProviderData.connection_schema[missingRequiredParam];
        const displayName = fieldDetails?.display_name || missingRequiredParam;
        toast({
          title: "Validation Error",
          description: `Connection parameter "${displayName}" for ${currentProviderData.display_name} is required when actions are selected.`,
          variant: "destructive"
        });
        return;
      }
    }

    // Upsert connection parameters for the main form
    if (user && formData.selected_provider_name && formData.selected_provider_name !== 'custom' && Object.keys(formData.connectionParams).length > 0) {
      const { error: connParamError } = await supabase
        .from('mcp_connection_params')
        .upsert({
          user_id: user.id,
          provider_name: formData.selected_provider_name, // Use selected_provider_name as it's the actual provider identifier
          connection_values: formData.connectionParams,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id, provider_name' });

      if (connParamError) {
        console.error('Error saving connection parameters from main form:', connParamError);
        toast({ title: "Error", description: `Failed to save connection parameters: ${connParamError.message}`, variant: "destructive" });
        return; // Stop if connection params fail to save
      }
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
          action_display_name: actionConfig.display_name, // Save the display name
          // auth_token: formData.auth_token || null, // Removed: Handled by mcp_connection_params
          instructions: actionConfig.instructions,
          expected_format: parsedSamplePayload, // Save parsed JSON
          active: actionConfig.is_selected, // Active status is based on selection
          user_id: user.id,
          category: getPascalCaseCategory(formData.selected_provider_name),
          mcp_server_base_url: 'https://mcp.knowreply.email', // Hardcoded URL
        };

        // Warning logic is now inside getPascalCaseCategory

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

  const handleTest = async (endpointToTest: MCPEndpoint, payloadString: string) => {
    setTestingId(endpointToTest.id);
    setTestResponse(null); // Clear previous test response

    if (!user) {
      toast({ title: "Test Error", description: "User not available. Please login again.", variant: "destructive" });
      setTestingId(null);
      return;
    }

    if (!endpointToTest.mcp_server_base_url || !endpointToTest.provider_name || !endpointToTest.action_name) {
      const errorMsg = "Endpoint configuration is incomplete (missing URL, provider, or action).";
      toast({ title: "Test Error", description: errorMsg, variant: "destructive" });
      setTestResponse(errorMsg);
      setTestingId(null);
      return;
    }

    const mcpServerInternalApiKey = import.meta.env.VITE_MCP_SERVER_INTERNAL_API_KEY;
    if (!mcpServerInternalApiKey) {
      toast({
        title: "Test Error",
        description: "MCP Server Internal API Key is not configured. Please set VITE_MCP_SERVER_INTERNAL_API_KEY.",
        variant: "destructive",
      });
      setTestingId(null);
      return;
    }

    let payloadForArgs: any;
    try {
      payloadForArgs = JSON.parse(payloadString);
    } catch (e: any) {
      const errorMessage = `Invalid JSON format in payload: ${e.message}`;
      toast({
        title: "Test Error",
        description: errorMessage,
        variant: "destructive",
        duration: 10000
      });
      setTestResponse(errorMessage); // Show JSON parse error in modal response area
      // setIsTestModalOpen(false); // Keep modal open to show error
      setTestingId(null); // Clear spinner
      return;
    }

    try {
      // Fetch connection parameters
      const providerNameForTest = endpointToTest.provider_name; // Assuming this is lowercase and correct
      const { data: connParamsRecord, error: connParamsError } = await supabase
        .from('mcp_connection_params')
        .select('connection_values')
        .eq('user_id', user.id)
        .eq('provider_name', providerNameForTest)
        .single();

      if (connParamsError || !connParamsRecord || !connParamsRecord.connection_values || Object.keys(connParamsRecord.connection_values).length === 0) {
        let errorMsg = `Connection parameters not configured for provider: ${providerNameForTest}.`;
        if(connParamsError && connParamsError.code !== 'PGRST116'){ // PGRST116 means no row found, which is handled by the main check.
          console.error("Error fetching connection params for test:", connParamsError);
          errorMsg = `Error fetching connection parameters: ${connParamsError.message}`;
        }
        toast({ title: "Test Error", description: errorMsg, variant: "destructive" });
        setTestResponse(errorMsg);
        setTestingId(null);
        return;
      }

      const testUrl = `${endpointToTest.mcp_server_base_url}/mcp/${providerNameForTest}/${endpointToTest.action_name}`;
      
      const newTestPayload = {
        args: payloadForArgs,
        auth: connParamsRecord.connection_values
      };

      const headers: any = {
        'Content-Type': 'application/json',
        'x-internal-api-key': mcpServerInternalApiKey,
      };

      // The actual fetch call
      const response = await fetch(testUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(newTestPayload),
      });

      const responseText = await response.text(); // Get raw text first

      // Try to parse as JSON if content type suggests it, otherwise use text
      let responseData: any = responseText;
      try {
          if (response.headers.get("content-type")?.includes("application/json")) {
              responseData = JSON.parse(responseText);
          }
      } catch (e) {
          // console.warn("Response was not valid JSON, using raw text.");
      }
      
      const formattedResponseForState = typeof responseData === 'string'
                                       ? responseData
                                       : JSON.stringify(responseData, null, 2);
      setTestResponse(formattedResponseForState);

      toast({
        title: response.ok ? "Test Successful" : "Test Failed",
        description: `Status: ${response.status} - ${response.statusText}. Full response in modal.`,
        variant: response.ok ? "default" : "destructive",
        duration: response.ok ? 5000 : 10000
      });

    } catch (error: any) {
      console.error('Error testing endpoint:', error);
      const errorMessage = `Network error or other issue: ${error.message}`;
      setTestResponse(errorMessage);
      toast({
        title: "Test Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setTestingId(null); // Clear spinner for the main button
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

  const groupedEndpoints: { [category: string]: MCPEndpoint[] } =
    savedConfiguredActions.reduce((acc, endpoint) => {
      const category = endpoint.category || 'Uncategorized'; // Default if category is somehow missing
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(endpoint);
      return acc;
    }, {} as { [category: string]: MCPEndpoint[] });

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
      <form onSubmit={(e) => { e.preventDefault(); }} className="w-full">
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
                      <CardTitle>Configure Actions for {categoryMapUtil[formData.selected_provider_name] || formData.selected_provider_name}</CardTitle>
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

            {/* Connection Parameters Section for Main Form */}
            {formData.selected_provider_name && formData.selected_provider_name !== 'custom' && (
              loadingMainFormConnectionParams ? (
                <div className="flex items-center p-4">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mr-2"></div>
                  <span>Loading connection details...</span>
                </div>
              ) : (
                (() => {
                  const providerData = discoveredProviders?.find(p => p.provider_name === formData.selected_provider_name);
                  const connectionSchema = providerData?.connection_schema;
                  if (connectionSchema && typeof connectionSchema === 'object' && Object.keys(connectionSchema).length > 0) {
                    return (
                      <div className="space-y-3 p-4 border rounded-md bg-gray-50/50">
                        <h4 className="text-md font-semibold text-gray-700">
                          Connection Parameters for {providerData.display_name}
                        </h4>
                        {Object.entries(connectionSchema).map(([key, schemaValue]: [string, any]) => (
                          <div key={key}>
                            <Label htmlFor={`form-conn-param-${key}`}>
                              {schemaValue?.display_name || key}
                              {schemaValue?.required && <span className="text-red-500 ml-1">*</span>}
                            </Label>
                            <Input
                              id={`form-conn-param-${key}`}
                              type={schemaValue?.type === 'password' ? 'password' : 'text'}
                              value={formData.connectionParams[key] || ''}
                              onChange={(e) =>
                                setFormData(prev => ({
                                  ...prev,
                                  connectionParams: { ...prev.connectionParams, [key]: e.target.value },
                                }))
                              }
                              placeholder={schemaValue?.placeholder || `Enter ${schemaValue?.display_name || key}`}
                              className="mt-1 bg-white"
                            />
                            {schemaValue?.description && (
                              <p className="text-xs text-gray-500 mt-1">{schemaValue.description}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  } else if (providerData && (!connectionSchema || Object.keys(connectionSchema || {}).length === 0)) {
                    return (
                        <div className="p-4 border rounded-md bg-gray-50/50">
                            <p className="text-sm text-gray-600">This provider ({providerData.display_name}) does not require additional connection parameters.</p>
                        </div>
                    );
                  }
                  return null;
                })()
              )
            )}
            {/* End Connection Parameters Section for Main Form */}

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
      </form>
      )}

     <Card>
        <CardHeader>
          <CardTitle>Configured MCP Endpoints</CardTitle>
          <CardDescription>
            {savedConfiguredActions.length} action(s) configured across {Object.keys(groupedEndpoints).length} provider(s).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {Object.keys(groupedEndpoints).length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No MCP endpoints configured yet. Add one above to get started.
            </div>
          ) : (
            Object.entries(groupedEndpoints).map(([category, actionsInGroup]) => (
              <div key={category} className="mb-8 p-4 border rounded-lg shadow-sm">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-2xl font-semibold text-gray-700">{categoryMapUtil[category.toLowerCase()] || category}</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const lowerCategory = category.toLowerCase(); // Key for discoveredProviders is lowercase
                      setEditingCategory(lowerCategory);
                      setLoadingConnectionParams(true);
                      setEditingConnectionParams({}); // Clear previous params immediately

                      // Fetch connection params
                      if (user) {
                        supabase
                          .from('mcp_connection_params')
                          .select('connection_values')
                          .eq('user_id', user.id)
                          .eq('provider_name', lowerCategory)
                          .single()
                          .then(({ data, error }) => {
                            let initialParams: Record<string, string> = {};
                            const providerSchema = discoveredProviders?.find(p => p.provider_name === lowerCategory)?.connection_schema;

                            if (data && data.connection_values) {
                              initialParams = data.connection_values as Record<string, string>;
                            }

                            // Ensure all schema fields are present in initialParams, defaulting to empty string
                            if (providerSchema && typeof providerSchema === 'object' && providerSchema !== null) {
                              Object.keys(providerSchema).forEach(key => {
                                if (!(key in initialParams)) {
                                  initialParams[key] = '';
                                }
                              });
                            }
                            setEditingConnectionParams(initialParams);
                            if (error && error.code !== 'PGRST116') { // PGRST116: single row not found
                                console.error("Error fetching connection params:", error);
                                toast({ title: "Error", description: "Could not load existing connection parameters.", variant: "destructive"});
                            }
                          })
                          .finally(() => {
                            setLoadingConnectionParams(false);
                          });
                      } else {
                        setLoadingConnectionParams(false); // Should not happen if user is viewing this page
                        toast({ title: "Error", description: "User not found, cannot load connection parameters.", variant: "destructive"});
                      }

                      // const currentProviderApiKey = actionsInGroup.length > 0 ? (actionsInGroup[0].auth_token || '') : '';
                      // setEditingApiKey(currentProviderApiKey); // Deprecated by connection_params

                      const initialSelections: Record<string, boolean> = {};
                      const providerData = discoveredProviders?.find(p => p.provider_name === lowerCategory);
                      if (providerData && providerData.actions) {
                        providerData.actions.forEach(discoveredAction => {
                          const savedAction = actionsInGroup.find(sa =>
                            sa.action_name === discoveredAction.action_name &&
                            sa.provider_name === lowerCategory
                          );
                          initialSelections[discoveredAction.action_name] = savedAction ? savedAction.active : false;
                        });
                      }
                      setEditingActionsSelection(initialSelections);
                      setShowAddForm(false);
                    }}
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Configure Provider
                  </Button>
                </div>
                {editingCategory === category.toLowerCase() ? ( // Compare with lowercase editingCategory
                  <div className="p-4 border-t border-dashed mt-2 space-y-4">
                    {loadingConnectionParams ? (
                      <div className="flex items-center justify-center p-4">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                        <p className="ml-2 text-sm text-gray-500">Loading connection details...</p>
                      </div>
                    ) : (
                      (() => {
                        const providerData = discoveredProviders?.find(p => p.provider_name === editingCategory);
                        const connectionSchema = providerData?.connection_schema;
                        if (connectionSchema && typeof connectionSchema === 'object' && Object.keys(connectionSchema).length > 0) {
                          return (
                            <div className="space-y-3">
                              <h4 className="text-md font-semibold mb-2">Connection Parameters:</h4>
                              {Object.entries(connectionSchema).map(([key, schemaValue]: [string, any]) => (
                                <div key={key}>
                                  <Label htmlFor={`conn-param-${key}`}>
                                    {schemaValue?.display_name || key}
                                    {schemaValue?.required && <span className="text-red-500 ml-1">*</span>}
                                  </Label>
                                  <Input
                                    id={`conn-param-${key}`}
                                    type={schemaValue?.type === 'password' ? 'password' : 'text'}
                                    value={editingConnectionParams[key] || ''}
                                    onChange={(e) =>
                                      setEditingConnectionParams(prev => ({ ...prev, [key]: e.target.value }))
                                    }
                                    placeholder={schemaValue?.placeholder || `Enter ${schemaValue?.display_name || key}`}
                                    className="mt-1"
                                  />
                                  {schemaValue?.description && (
                                    <p className="text-xs text-gray-500 mt-1">{schemaValue.description}</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          );
                        } else if (providerData && (!connectionSchema || Object.keys(connectionSchema || {}).length === 0)) {
                           return <p className="text-sm text-gray-500">This provider does not require additional connection parameters.</p>;
                        }
                        return null; // Should not happen if discovery data is consistent
                      })()
                    )}

                    <div>
                      <h4 className="text-md font-semibold mb-2">Configure Actions:</h4>
                      <div className="space-y-2 max-h-60 overflow-y-auto p-2 border rounded-md"> {/* Scrollable action list */}
                        {(discoveredProviders?.find(p => p.provider_name === category.toLowerCase())?.actions || []).map(discoveredAction => (
                          <div key={discoveredAction.action_name} className="flex items-center space-x-2">
                            <Checkbox
                              id={`inline-edit-action-${category}-${discoveredAction.action_name}`}
                              checked={!!editingActionsSelection[discoveredAction.action_name]}
                              onCheckedChange={(checked) => {
                                setEditingActionsSelection(prev => ({
                                  ...prev,
                                  [discoveredAction.action_name]: !!checked
                                }));
                              }}
                            />
                            <Label htmlFor={`inline-edit-action-${category}-${discoveredAction.action_name}`} className="font-normal">
                              {discoveredAction.display_name} ({discoveredAction.action_name})
                            </Label>
                          </div>
                        ))}
                         { (discoveredProviders?.find(p => p.provider_name === category.toLowerCase())?.actions || []).length === 0 && (
                            <p className="text-sm text-gray-500">No discoverable actions found for this provider.</p>
                         )}
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 mt-4">
                      <Button variant="outline" onClick={() => {
                        setEditingCategory(null);
                        // setEditingApiKey(''); // Deprecated
                        setEditingConnectionParams({});
                        setEditingActionsSelection({});
                        setLoadingConnectionParams(false); // Ensure loading is stopped if cancel is hit during load
                      }}>
                        Cancel
                      </Button>
                      <Button onClick={handleInlineProviderSave} disabled={loadingConnectionParams}>
                        {loadingConnectionParams ? 'Loading...' : 'Save Changes'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[30%]">Function Name</TableHead>
                      <TableHead className="w-[30%]">Action Slug</TableHead>
                      <TableHead className="w-[15%]">Status</TableHead>
                      <TableHead className="text-right w-[25%]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {actionsInGroup.map((endpoint) => (
                      <TableRow key={endpoint.id}>
                        <TableCell className="font-medium">
                          {endpoint.action_display_name || endpoint.name} {/* Display name with fallback to AI name */}
                        </TableCell>
                        <TableCell>
                          <code className="text-sm bg-gray-100 px-2 py-1 rounded">
                            {endpoint.action_name || 'N/A'}
                          </code>
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={endpoint.active}
                            onCheckedChange={() => toggleActive(endpoint.id, endpoint.active)}
                            aria-label={`Toggle status for ${endpoint.name}`}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-2 justify-end">
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => {
                                setTestingEndpoint(endpoint);
                                setCurrentTestPayload(JSON.stringify(endpoint.expected_format || {}, null, 2));
                                setTestResponse(null); // Clear previous results when opening modal
                                setIsTestModalOpen(true);
                              }}
                              disabled={testingId === endpoint.id} // Keep this to disable if a test is actively running via testingId
                              title="Test Action"
                            >
                              <TestTube className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="destructive"
                              size="icon"
                              onClick={() => handleDelete(endpoint.id)}
                              title="Delete Action"
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
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Test Payload Modal */}
      {testingEndpoint && (
        <Dialog open={isTestModalOpen} onOpenChange={setIsTestModalOpen}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>
                Test Action: {testingEndpoint.action_display_name || testingEndpoint.name}
              </DialogTitle>
              <DialogDescription>
                Modify the JSON payload below to test with different inputs.
                The 'args' will be taken from this payload. The 'auth.token' will use the configured Provider API Key for this provider ({categoryMapUtil[testingEndpoint.category.toLowerCase()] || testingEndpoint.category}).
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <Label htmlFor="test-payload-textarea">Payload for "args" (JSON format)</Label>
              <Textarea
                id="test-payload-textarea"
                value={currentTestPayload}
                onChange={(e) => setCurrentTestPayload(e.target.value)}
                placeholder='Enter JSON payload for "args"'
                className="h-40 font-mono text-xs" // Reduced height
              />
            </div>
            {testResponse !== null && (
              <div className="mt-4">
                <Label htmlFor="test-response-area">Test Response</Label>
                <pre
                  id="test-response-area"
                  className="mt-1 p-2 text-xs bg-gray-100 rounded-md h-40 border whitespace-pre-wrap break-words overflow-y-auto"
                >
                  {testResponse}
                </pre>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => { setIsTestModalOpen(false); setTestResponse(null); } }>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (testingEndpoint) {
                    setTestResponse(null); // Clear previous results before running a new test
                    handleTest(testingEndpoint, currentTestPayload);
                  } else {
                    toast({ title: "Error", description: "No endpoint selected for testing.", variant: "destructive" });
                    setIsTestModalOpen(false);
                  }
                }}
                disabled={testingId === testingEndpoint?.id}
              >
                {testingId === testingEndpoint?.id ? 'Testing...' : 'Run Test'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
} 
