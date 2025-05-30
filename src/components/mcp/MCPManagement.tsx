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
  name: string;
  category: string;
  post_url: string;
  auth_token?: string;
  expected_format?: any;
  instructions?: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

interface MCPForm {
  name: string;
  category: string;
  post_url: string;
  auth_token: string;
  expected_format: string;
  instructions: string;
  active: boolean;
  stripe_tools?: string[];
  server_type?: 'local' | 'remote';
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
    post_url: '',
    auth_token: '',
    expected_format: '{\n  "example": "json format"\n}',
    instructions: '',
    active: true,
    stripe_tools: [],
    server_type: 'remote'
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
      post_url: '',
      auth_token: '',
      expected_format: '{\n  "example": "json format"\n}',
      instructions: '',
      active: true,
      stripe_tools: [],
      server_type: 'remote'
    });
    setEditingId(null);
    setShowAddForm(false);
  };

  const handleCategoryChange = (category: string) => {
    const newFormData = { ...formData, category, post_url: '', auth_token: '', stripe_tools: [] }; // Reset some fields
    
    if (category === 'Stripe') {
      newFormData.post_url = formData.server_type === 'remote' ? 'https://mcp.stripe.com' : '';
      newFormData.expected_format = JSON.stringify({
        "jsonrpc": "2.0",
        "method": "tools/call",
        "params": {
          "name": "create_customer",
          "arguments": {"name": "Jenny Rosen", "email": "jenny.rosen@example.com"}
        },
        "id": 1
      }, null, 2);
      newFormData.instructions = 'Use this MCP server to interact with Stripe API. Supports customer management, payments, subscriptions, and knowledge base search.';
      newFormData.stripe_tools = ['create_customer', 'retrieve_customer', 'create_payment_intent'];
    } else if (category === 'HubSpot') {
      newFormData.post_url = 'https://api.hubapi.com';
      newFormData.expected_format = JSON.stringify({ "method": "contacts.getByEmail", "email": "test@example.com" }, null, 2);
      newFormData.instructions = 'Configure this HubSpot MCP to interact with contacts, deals, or tickets.';
    } else if (category === 'Shopify') {
      newFormData.post_url = 'https://<your-store>.myshopify.com/admin/api/2023-10/graphql.json'; // User needs to replace <your-store>
      newFormData.expected_format = JSON.stringify({ "query": "{ shop { name } }" }, null, 2);
      newFormData.instructions = 'Integrate with Shopify orders, products, customers, etc. Ensure the Post URL is updated with your store name.';
    } else if (category === 'Klaviyo') {
      newFormData.post_url = 'https://a.klaviyo.com/api';
      newFormData.expected_format = JSON.stringify({ "method": "profiles.get_profile", "params": { "external_id": "user123" } }, null, 2);
      newFormData.instructions = 'Configure this Klaviyo MCP to manage customer profiles and events.';
    } else if (category === 'Zendesk') {
      newFormData.post_url = 'https://<your-subdomain>.zendesk.com/api/v2'; // User needs to replace <your-subdomain>
      newFormData.expected_format = JSON.stringify({ "method": "tickets.create", "params": { "subject": "Test Ticket", "comment": { "body": "This is a test ticket." } } }, null, 2);
      newFormData.instructions = 'Integrate with Zendesk tickets, users, and knowledge base. Ensure the Post URL is updated with your subdomain.';
    } else if (category === 'Calendly') {
      newFormData.post_url = 'https://api.calendly.com';
      newFormData.expected_format = JSON.stringify({ "method": "users.me" }, null, 2);
      newFormData.instructions = 'Configure this Calendly MCP to manage scheduling and events.';
    } else if (category === 'Mailchimp') {
      newFormData.post_url = 'https://<dc>.api.mailchimp.com/3.0'; // User needs to replace <dc> with their server prefix
      newFormData.expected_format = JSON.stringify({ "method": "lists.get_lists" }, null, 2);
      newFormData.instructions = 'Integrate with Mailchimp lists, campaigns, and automations. Ensure the Post URL is updated with your server prefix.';
    } else if (category === 'Intercom') {
      newFormData.post_url = 'https://api.intercom.io';
      newFormData.expected_format = JSON.stringify({ "method": "contacts.list" }, null, 2);
      newFormData.instructions = 'Configure this Intercom MCP to manage users, leads, and conversations.';
    } else if (category === 'Custom') {
      newFormData.post_url = '';
      newFormData.expected_format = JSON.stringify({ "example": "json format" }, null, 2);
      newFormData.instructions = 'Configure a custom MCP endpoint.';
    }
    
    setFormData(newFormData);
  };

  const handleServerTypeChange = (serverType: 'local' | 'remote') => {
    const newFormData = { ...formData, server_type: serverType };
    
    if (formData.category === 'Stripe') {
      newFormData.post_url = serverType === 'remote' ? 'https://mcp.stripe.com' : '';
    }
    
    setFormData(newFormData);
  };

  const handleStripeToolToggle = (tool: string, checked: boolean) => {
    const currentTools = formData.stripe_tools || [];
    if (checked) {
      setFormData({ ...formData, stripe_tools: [...currentTools, tool] });
    } else {
      setFormData({ ...formData, stripe_tools: currentTools.filter(t => t !== tool) });
    }
  };

  const handleSave = async () => {
    if (!formData.name || !formData.category) {
      toast({
        title: "Validation Error",
        description: "Please fill in name and category",
        variant: "destructive"
      });
      return;
    }

    // Validate Stripe-specific fields
    if (formData.category === 'Stripe') {
      if (!formData.auth_token) {
        toast({
          title: "Validation Error",
          description: "Stripe Secret Key is required for Stripe MCP",
          variant: "destructive"
        });
        return;
      }
      if (formData.server_type === 'local' && !formData.post_url) {
        toast({
          title: "Validation Error",
          description: "Local server URL is required when using local server type",
          variant: "destructive"
        });
        return;
      }
    } else {
      // For non-Stripe categories, require POST URL
      if (!formData.post_url) {
        toast({
          title: "Validation Error",
          description: "POST URL is required",
          variant: "destructive"
        });
        return;
      }
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
        name: formData.name,
        category: formData.category,
        post_url: formData.post_url,
        auth_token: formData.auth_token || null,
        expected_format: {
          ...expectedFormat,
          ...(formData.category === 'Stripe' && {
            stripe_tools: formData.stripe_tools,
            server_type: formData.server_type
          })
        },
        instructions: formData.instructions || null,
        active: formData.active,
        user_id: user?.id
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
    const stripeConfig = endpoint.expected_format?.stripe_tools ? {
      stripe_tools: endpoint.expected_format.stripe_tools,
      server_type: endpoint.expected_format.server_type || 'remote'
    } : { stripe_tools: [], server_type: 'remote' };

    setFormData({
      name: endpoint.name,
      category: endpoint.category,
      post_url: endpoint.post_url,
      auth_token: endpoint.auth_token || '',
      expected_format: JSON.stringify(endpoint.expected_format || {}, null, 2),
      instructions: endpoint.instructions || '',
      active: endpoint.active,
      ...stripeConfig
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

      const response = await fetch(endpoint.post_url, {
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
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="My MCP Endpoint"
                />
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

            {formData.category === 'Stripe' && (
              <div className="space-y-4 p-4 bg-blue-50 rounded-lg border">
                <h3 className="font-semibold text-blue-900">Stripe MCP Configuration</h3>
                
                <div>
                  <Label htmlFor="server_type">Server Type</Label>
                  <Select 
                    value={formData.server_type} 
                    onValueChange={(value: 'local' | 'remote') => handleServerTypeChange(value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="remote">Remote (https://mcp.stripe.com)</SelectItem>
                      <SelectItem value="local">Local Server</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-gray-600 mt-1">
                    Remote server is hosted by Stripe. Local server requires running npx @stripe/mcp locally.
                  </p>
                </div>

                <div>
                  <Label htmlFor="stripe_secret_key">Stripe Secret Key *</Label>
                  <Input
                    id="stripe_secret_key"
                    type="password"
                    value={formData.auth_token}
                    onChange={(e) => setFormData({ ...formData, auth_token: e.target.value })}
                    placeholder="sk_test_..."
                  />
                  <p className="text-sm text-gray-600 mt-1">
                    Use restricted API keys to limit access to required functionality only.
                  </p>
                </div>

                <div>
                  <Label>Available Tools</Label>
                  <div className="grid grid-cols-2 gap-2 mt-2 max-h-40 overflow-y-auto">
                    {stripeTools.map((tool) => (
                      <div key={tool} className="flex items-center space-x-2">
                        <Checkbox
                          id={tool}
                          checked={formData.stripe_tools?.includes(tool) || false}
                          onCheckedChange={(checked) => handleStripeToolToggle(tool, checked as boolean)}
                        />
                        <Label htmlFor={tool} className="text-sm">
                          {tool}
                        </Label>
                      </div>
                    ))}
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    Select which Stripe tools the agent can access.
                  </p>
                </div>
              </div>
            )}

            {formData.category === 'Stripe' && formData.server_type === 'local' && (
              <div>
                <Label htmlFor="post_url">Local Server URL *</Label>
                <Input
                  id="post_url"
                  value={formData.post_url}
                  onChange={(e) => setFormData({ ...formData, post_url: e.target.value })}
                  placeholder="http://localhost:8000"
                />
                <p className="text-sm text-gray-600 mt-1">
                  URL where your local Stripe MCP server is running.
                </p>
              </div>
            )}

            {formData.category !== 'Stripe' && formData.category !== '' && (
              <div>
                <Label htmlFor="post_url">POST URL *</Label>
                <Input
                  id="post_url"
                  value={formData.post_url}
                  onChange={(e) => setFormData({ ...formData, post_url: e.target.value })}
                  placeholder="https://api.example.com/webhook"
                />
              </div>
            )}

            {formData.category !== 'Stripe' && formData.category !== '' && (
              <div>
                <Label htmlFor="auth_token">Auth Token</Label>
                <Input
                  id="auth_token"
                  type="password"
                  value={formData.auth_token}
                  onChange={(e) => setFormData({ ...formData, auth_token: e.target.value })}
                  placeholder="Bearer token for authentication"
                />
              </div>
            )}

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
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>Instructions</TableHead>
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
                      <code className="text-sm bg-gray-100 px-2 py-1 rounded">
                        {endpoint.post_url || (endpoint.category === 'Stripe' ? 'https://mcp.stripe.com' : 'Not configured')}
                      </code>
                    </TableCell>
                    <TableCell>
                      {endpoint.instructions ? (
                        <span className="text-sm text-gray-600 truncate max-w-xs block">
                          {endpoint.instructions.substring(0, 50)}
                          {endpoint.instructions.length > 50 ? '...' : ''}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">No instructions</span>
                      )}
                    </TableCell>
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
