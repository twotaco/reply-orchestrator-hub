import { useState, useEffect, useMemo } from 'react';
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
import { Client } from "@modelcontextprotocol/sdk/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp";
// McpContent might be used later for typing responses, importing proactively.
// import { McpContent } from "@modelcontextprotocol/sdk/types";

const categoryMapUtil: { [key: string]: string } = {
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
  auth_token?: string; // API key for the target provider
  expected_format?: any;
  instructions?: string;
  active: boolean;
  created_at: string;
  updated_at: string;
  // post_url is deprecated, will be constructed from base_url, provider_name, action_name by the MCP server
}

interface DiscoveredProviderAction { // Updated to reflect SDK's ActionDefinition structure (simplified)
  action_name: string; // e.g., "getCustomerByEmail" (after splitting from "provider.actionName")
  display_name: string;
  description?: string;
  param_schema?: any; // Placeholder for ZodSchema from SDK if we want to use it later
                     // sample_payload is no longer directly available from listActions
}

interface DiscoveredProvider { // Updated
  provider_name: string; // e.g., "stripe"
  display_name: string; // e.g., "Stripe" (derived)
  description?: string; // (derived or from SDK if available at provider level)
  // mcp_server_type is removed as it's not part of SDK's listActions response
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

// categoryMap definition removed from here, moved outside and renamed to categoryMapUtil within getPascalCaseCategory scope

export function MCPManagement() {
  const { user } = useAuth();

  const mcpServerUrl = 'https://mcp.knowreply.email';

  // MCP Client Setup
  const [isMcpClientConnected, setIsMcpClientConnected] = useState(false);
  const mcpClientAndTransport = useMemo(() => {
    const internalApiKey = import.meta.env.VITE_MCP_SERVER_INTERNAL_API_KEY;
    if (!internalApiKey) {
      console.error("VITE_MCP_SERVER_INTERNAL_API_KEY is not set. MCP Client setup skipped.");
      // Display a persistent error to the user if the key is missing, as parts of the UI will be non-functional.
      // This could be a banner or a more integrated UI element. For now, console error + future toast.
      return null;
    }

    const customFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const headers = new Headers(init?.headers);
      headers.set('x-internal-api-key', internalApiKey);
      return fetch(input, { ...init, headers });
    };

    const transport = new StreamableHTTPClientTransport(
      new URL(mcpServerUrl), // SDK appends /mcp
      customFetch
    );

    const client = new Client({
      name: "KnowReplyHubClient",
      version: "1.0.0"
    });

    return { client, transport };
  }, []); // mcpServerUrl is a const defined outside, so no dependency needed for it.

  useEffect(() => {
    if (mcpClientAndTransport && !isMcpClientConnected) {
      const { client, transport } = mcpClientAndTransport;
      client.connect(transport)
        .then(() => {
          console.log("MCP Client connected successfully.");
          setIsMcpClientConnected(true);
          // Consider fetching initial data like discoveredProviders via MCP client here
        })
        .catch(err => {
          console.error("MCP Client failed to connect:", err);
          toast({ title: "MCP Connection Error", description: `Failed to connect to MCP server: ${err.message}. Some features may be unavailable.`, variant: "destructive", duration: 10000});
          setIsMcpClientConnected(false);
        });
      // Optional: return cleanup function for client.close() or transport.close() if needed on unmount.
      // return () => { client.close(); }; // Example, check SDK for proper cleanup
    }
  }, [mcpClientAndTransport, isMcpClientConnected]);


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
  const [editingApiKey, setEditingApiKey] = useState<string>('');
  const [editingActionsSelection, setEditingActionsSelection] = useState<Record<string, boolean>>({});

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
      fetchEndpoints(); // Fetches savedConfiguredActions (from Supabase)
      if (isMcpClientConnected && mcpClientAndTransport?.client) {
        fetchMcpActions();
      } else if (!import.meta.env.VITE_MCP_SERVER_INTERNAL_API_KEY && !discoveryLoading) {
        setDiscoveryError("MCP Server Internal API Key is not configured. Cannot fetch provider actions.");
        setDiscoveryLoading(false);
      }
    }
  }, [user, isMcpClientConnected, mcpClientAndTransport, discoveryLoading]); // Added discoveryLoading to deps to prevent potential re-runs if error is set

  const fetchMcpActions = async () => {
    if (!mcpClientAndTransport?.client || !isMcpClientConnected) {
      // This condition should ideally prevent this function from being called if client not ready,
      // but as a safeguard:
      setDiscoveryError("MCP Client not available or not connected.");
      setDiscoveryLoading(false);
      return;
    }

    setDiscoveryLoading(true);
    setDiscoveryError(null);
    try {
      const client = mcpClientAndTransport.client;
      const sdkActionsResponse = await client.listActions();

      const providerActionsMap: { [providerName: string]: DiscoveredProviderAction[] } = {};
      const providerMetaMap: { [providerName: string]: { displayName: string, description: string } } = {};

      for (const sdkAction of sdkActionsResponse.actions) {
        let providerName = 'general';
        let actionNameOnly = sdkAction.name;
        const nameParts = sdkAction.name.split('.');

        if (nameParts.length > 1) {
          providerName = nameParts[0];
          actionNameOnly = nameParts.slice(1).join('.');
        } else {
          // If no explicit provider, it might be a general action.
          // Or, the provider might be an implicit part of the server's setup not in the name.
          // For now, we group under 'general' or a default.
          // This behavior might need refinement based on how such actions should be presented.
          console.warn(`Action '${sdkAction.name}' does not follow 'provider.action' naming. Grouping under '${providerName}'.`);
        }

        if (!providerActionsMap[providerName]) {
          providerActionsMap[providerName] = [];
          providerMetaMap[providerName] = {
            displayName: categoryMapUtil[providerName] || (providerName.charAt(0).toUpperCase() + providerName.slice(1)),
            description: `Actions related to ${categoryMapUtil[providerName] || (providerName.charAt(0).toUpperCase() + providerName.slice(1))}.`
          };
        }

        providerActionsMap[providerName].push({
          action_name: actionNameOnly,
          display_name: sdkAction.displayName || actionNameOnly.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          description: sdkAction.description,
          param_schema: sdkAction.paramSchema,
          // sample_payload is no longer directly available.
          // We might generate one from param_schema if needed, or link to schema docs.
          // For now, it's removed from DiscoveredProviderAction or can be set to {}
        });
      }

      const newDiscoveredProviders: DiscoveredProvider[] = Object.keys(providerActionsMap).map(providerName => ({
        provider_name: providerName,
        display_name: providerMetaMap[providerName].displayName,
        description: providerMetaMap[providerName].description,
        actions: providerActionsMap[providerName],
      }));

      setDiscoveredProviders(newDiscoveredProviders);
      console.log("Fetched and transformed MCP Actions via SDK:", newDiscoveredProviders);

    } catch (error: any) {
      console.error('Error fetching MCP actions via SDK:', error);
      setDiscoveryError(`Failed to fetch MCP actions: ${error.message}`);
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
          auth_token: editingApiKey.trim(),
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
      toast({ title: "Success", description: `Successfully updated ${getPascalCaseCategory(editingCategory)}: ${itemsAdded} added, ${itemsUpdated} updated, ${itemsDeleted} removed.` });
      fetchEndpoints(); // Refresh the main list
    } catch (error: any) {
      console.error('Error saving inline MCP configurations:', error);
      toast({ title: "Error", description: `Failed to save configurations: ${error.message}`, variant: "destructive" });
    } finally {
      setEditingCategory(null);
      setEditingApiKey('');
      setEditingActionsSelection({});
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
          action_display_name: actionConfig.display_name, // Save the display name
          auth_token: formData.auth_token || null, // Use provider-level auth_token
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
    setTestingId(endpointToTest.id); // For main button spinner & to disable "Run Test" in modal

    if (!endpointToTest.mcp_server_base_url || !endpointToTest.provider_name || !endpointToTest.action_name) {
      toast({ title: "Test Error", description: "Endpoint configuration is incomplete (missing URL, provider, or action).", variant: "destructive" });
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
      const testUrl = `${endpointToTest.mcp_server_base_url}/mcp/${endpointToTest.provider_name}/${endpointToTest.action_name}`;
      
      const newTestPayload = {
        args: payloadForArgs, // Use the parsed payload from the modal
        auth: {
          token: endpointToTest.auth_token || null // The provider-specific API key
        }
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
                      const currentProviderApiKey = actionsInGroup.length > 0 ? (actionsInGroup[0].auth_token || '') : '';
                      setEditingApiKey(currentProviderApiKey);

                      const initialSelections: Record<string, boolean> = {};
                      const providerData = discoveredProviders?.find(p => p.provider_name === lowerCategory);
                      if (providerData && providerData.actions) {
                        providerData.actions.forEach(discoveredAction => {
                          // actionsInGroup are already filtered for the current category (PascalCase key from groupedEndpoints)
                          // and their provider_name field should be lowercase.
                          const savedAction = actionsInGroup.find(sa =>
                            sa.action_name === discoveredAction.action_name &&
                            sa.provider_name === lowerCategory // Ensure we are matching against the lowercase provider_name
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
                    <div>
                      <Label htmlFor={`edit-apikey-${category}`}>Provider API Key *</Label>
                      <Input
                        id={`edit-apikey-${category}`}
                        type="password"
                        value={editingApiKey}
                        onChange={(e) => setEditingApiKey(e.target.value)}
                        placeholder={`Enter API Key for ${categoryMapUtil[category.toLowerCase()] || category}`}
                        className="mt-1"
                      />
                    </div>

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
                        setEditingApiKey('');
                        setEditingActionsSelection({});
                      }}>
                        Cancel
                      </Button>
                      <Button onClick={handleInlineProviderSave}>
                        Save Changes
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
                  className="mt-1 p-2 text-xs bg-gray-100 rounded-md overflow-x-auto h-40 border"
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
