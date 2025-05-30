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

interface MCPForm {
  name: string; // User-defined name, will be used as the identifier for the LLM
  category: string;
  mcp_server_base_url: string;
  provider_name: string;
  action_name: string;
  auth_token: string; // API key for the target provider
  expected_format: string;
  instructions: string;
  active: boolean;
  // stripe_tools and server_type are deprecated in this new model
}

const categories = [
  'Stripe',
  'Supabase',
  'Shopify',
  'HubSpot',
  'Klaviyo',
  'Zendesk',
  'Calendly',
  'Mailchimp',
  'Intercom',
  'Custom'
];

const stripeTools = [
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
  const [endpoints, setEndpoints] = useState<MCPEndpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<MCPForm>({
    name: '',
    category: '',
    mcp_server_base_url: '',
    provider_name: '',
    action_name: '',
    auth_token: '',
    expected_format: '{\n  "example": "json format"\n}',
    instructions: '',
    active: true,
  });

  useEffect(() => {
    if (user) {
      fetchEndpoints();
    }
  }, [user]);

  const fetchEndpoints = async () => {
    try {
      const { data, error } = await supabase
        .from('mcp_endpoints')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setEndpoints(data || []);
    } catch (error) {
      console.error('Error fetching MCP endpoints:', error);
      toast({
        title: "Error",
        description: "Failed to fetch MCP endpoints",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      category: '',
      mcp_server_base_url: '',
      provider_name: '',
      action_name: '',
      auth_token: '',
      expected_format: '{\n  "example": "json format"\n}',
      instructions: '',
      active: true,
    });
    setEditingId(null);
    setShowAddForm(false);
  };

  const handleCategoryChange = (category: string) => {
    // Preserve user input for some fields if they've already typed something
    const newFormData = { 
      ...formData, 
      category, 
      // mcp_server_base_url: formData.mcp_server_base_url, // Let's reset this to avoid confusion if category changes server expectations
      mcp_server_base_url: '', 
      provider_name: '', 
      action_name: '', 
      // auth_token: formData.auth_token, // Reset auth token as it's provider specific
      auth_token: '',
      instructions: '', 
      expected_format: '{\n  "example": "json format"\n}', 
    }; 
    
    if (category === 'Stripe') {
      newFormData.provider_name = 'stripe';
      newFormData.instructions = 'This MCP interacts with the Stripe API. Define a specific action like "createCustomer" or "retrievePaymentIntent".';
      newFormData.expected_format = JSON.stringify({"amount": 2000, "currency": "usd", "customer": "cus_example"}, null, 2);
    } else if (category === 'HubSpot') {
      newFormData.provider_name = 'hubspot';
      newFormData.instructions = 'This MCP interacts with the HubSpot API. Define a specific action like "createContact" or "getDeal".';
      newFormData.expected_format = JSON.stringify({ "properties": { "email": "test@example.com", "firstname": "Test"}}, null, 2);
    } else if (category === 'Shopify') {
      newFormData.provider_name = 'shopify';
      newFormData.instructions = 'This MCP interacts with the Shopify API. Define a specific action.';
      newFormData.expected_format = JSON.stringify({ "query": "{ shop { name } }" }, null, 2);
    } else if (category === 'Klaviyo') {
      newFormData.provider_name = 'klaviyo';
      newFormData.instructions = 'This MCP interacts with the Klaviyo API. Define a specific action.';
    } else if (category === 'Zendesk') {
      newFormData.provider_name = 'zendesk';
      newFormData.instructions = 'This MCP interacts with the Zendesk API. Define a specific action.';
    } else if (category === 'Calendly') {
      newFormData.provider_name = 'calendly';
      newFormData.instructions = 'This MCP interacts with the Calendly API. Define a specific action.';
    } else if (category === 'Mailchimp') {
      newFormData.provider_name = 'mailchimp';
      newFormData.instructions = 'This MCP interacts with the Mailchimp API. Define a specific action.';
    } else if (category === 'Intercom') {
      newFormData.provider_name = 'intercom';
      newFormData.instructions = 'This MCP interacts with the Intercom API. Define a specific action.';
    } else if (category === 'Custom') {
      newFormData.provider_name = ''; // User defines everything
      newFormData.instructions = 'Configure a custom MCP endpoint. You need to specify the provider and action name for your custom MCP server.';
      newFormData.expected_format = JSON.stringify({ "custom_payload_key": "custom_value" }, null, 2);
    }
    
    setFormData(newFormData);
  };

  // handleServerTypeChange and handleStripeToolToggle are now deprecated and can be removed.
  // const handleServerTypeChange = (serverType: 'local' | 'remote') => { ... };
  // const handleStripeToolToggle = (tool: string, checked: boolean) => { ... };

  // const handleStripeToolToggle = (...) => { ... };

  const handleSave = async () => {
    if (!formData.name || !formData.category || !formData.mcp_server_base_url || !formData.provider_name || !formData.action_name) {
      toast({
        title: "Validation Error",
        description: "Please fill in Name, Category, MCP Server Base URL, Provider Name, and Action Name.",
        variant: "destructive"
      });
      return;
    }

    // Category specific validation (e.g. Stripe API key) can be added here if necessary
    // For example, if category is Stripe and auth_token is missing:
    if (formData.category === 'Stripe' && !formData.auth_token) {
       toast({
        title: "Validation Error",
        description: "Target Provider API Key (Stripe Secret Key) is recommended for Stripe MCPs.",
        variant: "warning" // Warning instead of destructive for now
      });
      // return; // Optionally block save
    }

    let expectedFormat;
    try {
      expectedFormat = formData.expected_format ? JSON.parse(formData.expected_format) : null;
    } catch (error) {
      toast({
        title: "JSON Error",
        description: "Invalid JSON format in expected format field",
        variant: "destructive"
      });
      return;
    }

    try {
      const endpointData = {
        name: formData.name, // This is the unique ID for the AI
        category: formData.category,
        mcp_server_base_url: formData.mcp_server_base_url,
        provider_name: formData.provider_name,
        action_name: formData.action_name,
        auth_token: formData.auth_token || null,
        expected_format: expectedFormat, // Already parsed
        instructions: formData.instructions || null,
        active: formData.active,
        user_id: user?.id,
        // post_url is no longer directly stored; it's derived by the MCP server
        // from mcp_server_base_url, provider_name, and action_name.
      };

      if (editingId) {
        const { error } = await supabase
          .from('mcp_endpoints')
          .update(endpointData)
          .eq('id', editingId);

        if (error) throw error;
        toast({
          title: "Success",
          description: "MCP endpoint updated successfully"
        });
      } else {
        const { error } = await supabase
          .from('mcp_endpoints')
          .insert([endpointData]);

        if (error) throw error;
        toast({
          title: "Success",
          description: "MCP endpoint created successfully"
        });
      }

      resetForm();
      fetchEndpoints();
    } catch (error) {
      console.error('Error saving MCP endpoint:', error);
      toast({
        title: "Error",
        description: "Failed to save MCP endpoint",
        variant: "destructive"
      });
    }
  };

  const handleEdit = (endpoint: MCPEndpoint) => {
    // Remove stripe_tools and server_type from expected_format if they exist for older data
    let currentExpectedFormat = endpoint.expected_format || {};
    if (currentExpectedFormat?.stripe_tools) delete currentExpectedFormat.stripe_tools;
    if (currentExpectedFormat?.server_type) delete currentExpectedFormat.server_type;
    if (Object.keys(currentExpectedFormat).length === 0) {
      currentExpectedFormat = { example: "json format" };
    }


    setFormData({
      name: endpoint.name,
      category: endpoint.category,
      mcp_server_base_url: endpoint.mcp_server_base_url || '',
      provider_name: endpoint.provider_name || '',
      action_name: endpoint.action_name || '',
      auth_token: endpoint.auth_token || '',
      expected_format: JSON.stringify(currentExpectedFormat, null, 2),
      instructions: endpoint.instructions || '',
      active: endpoint.active,
    });
    setEditingId(endpoint.id);
    setShowAddForm(true);
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
            <CardTitle>{editingId ? 'Edit' : 'Add'} MCP Endpoint</CardTitle>
            <CardDescription>
              Configure an endpoint for external system integration
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name">MCP Endpoint Name (Unique ID for AI) *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., stripe_getCustomerByEmail"
                />
                <p className="text-sm text-gray-500 mt-1">
                  This name will be used by the AI to identify this tool. E.g., 'stripe_getCustomerByEmail' or 'Fetch Stripe Customer'. Must be unique.
                </p>
              </div>
              <div>
                <Label htmlFor="category">Category *</Label>
                <Select value={formData.category} onValueChange={handleCategoryChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            {/* New MCP Server Configuration Fields */}
            <div>
              <Label htmlFor="mcp_server_base_url">MCP Server Base URL *</Label>
              <Input
                id="mcp_server_base_url"
                value={formData.mcp_server_base_url}
                onChange={(e) => setFormData({ ...formData, mcp_server_base_url: e.target.value })}
                placeholder="e.g., http://localhost:8080 or https://mcp.example.com"
              />
              <p className="text-sm text-gray-500 mt-1">The base URL of your MCP server (e.g., the KnowReply MCP server).</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="provider_name">Provider Name *</Label>
                <Input
                  id="provider_name"
                  value={formData.provider_name}
                  onChange={(e) => setFormData({ ...formData, provider_name: e.target.value })}
                  placeholder="e.g., stripe, hubspot, custom"
                />
                <p className="text-sm text-gray-500 mt-1">Identifier for the target service provider.</p>
              </div>
              <div>
                <Label htmlFor="action_name">Action Name *</Label>
                <Input
                  id="action_name"
                  value={formData.action_name}
                  onChange={(e) => setFormData({ ...formData, action_name: e.target.value })}
                  placeholder="e.g., getCustomerByEmail, createTicket"
                />
                <p className="text-sm text-gray-500 mt-1">Specific action to be performed by the provider.</p>
              </div>
            </div>

            {/* Stripe specific UI is now simplified/removed as it's handled by provider_name + action_name */}
            {/* 
              The old Stripe UI for server_type and stripe_tools is deprecated.
              Users will now set provider_name="stripe" and action_name="specificStripeAction".
              The mcp_server_base_url will point to their MCP server that can handle these.
            */}
            
            {/* Generic Auth Token field - label updated */}
            <div>
              <Label htmlFor="auth_token">Target Provider API Key</Label>
              <Input
                id="auth_token"
                type="password"
                value={formData.auth_token}
                onChange={(e) => setFormData({ ...formData, auth_token: e.target.value })}
                placeholder="e.g., sk_test_xxxxxx (for Stripe), or other provider API key"
              />
              <p className="text-sm text-gray-500 mt-1">API Key for the target service (Stripe, HubSpot, etc.). Leave blank if not required.</p>
            </div>

            <div>
              <Label htmlFor="instructions">Instructions for AI Agent</Label>
              <Textarea
                id="instructions"
                value={formData.instructions}
                onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
                rows={3}
                placeholder="Describe what this endpoint does and how the AI agent should use it..."
              />
              <p className="text-sm text-gray-500 mt-1">
                These instructions help the AI agent understand when and how to use this endpoint
              </p>
            </div>

            <div>
              <Label htmlFor="expected_format">Expected JSON Format</Label>
              <Textarea
                id="expected_format"
                value={formData.expected_format}
                onChange={(e) => setFormData({ ...formData, expected_format: e.target.value })}
                rows={6}
                className="font-mono text-sm"
                placeholder='{\n  "example": "json format"\n}'
              />
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="active"
                checked={formData.active}
                onCheckedChange={(checked) => setFormData({ ...formData, active: checked })}
              />
              <Label htmlFor="active">Active</Label>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSave}>
                <Save className="h-4 w-4 mr-2" />
                {editingId ? 'Update' : 'Save'}
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
            {endpoints.length} endpoint{endpoints.length !== 1 ? 's' : ''} configured
          </CardDescription>
        </CardHeader>
        <CardContent>
          {endpoints.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No MCP endpoints configured yet. Add your first endpoint to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name (AI Identifier)</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>MCP Server Base URL</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Action</TableHead>
                  {/* <TableHead>Instructions</TableHead> */}
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {endpoints.map((endpoint) => (
                  <TableRow key={endpoint.id}>
                    <TableCell className="font-medium">{endpoint.name}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {endpoint.category}
                      </span>
                    </TableCell>
                    <TableCell>
                      <code className="text-sm bg-gray-100 px-2 py-1 rounded truncate max-w-[200px] block">
                        {endpoint.mcp_server_base_url || 'N/A'}
                      </code>
                    </TableCell>
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
