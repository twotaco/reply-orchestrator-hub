
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

interface MCPEndpoint {
  id: string;
  name: string;
  category: string;
  post_url: string;
  auth_token?: string;
  expected_format?: any;
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
  active: boolean;
}

const categories = [
  'Stripe',
  'Supabase',
  'Shopify',
  'Custom'
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
    active: true
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
      active: true
    });
    setEditingId(null);
    setShowAddForm(false);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.category || !formData.post_url) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
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
        expected_format: expectedFormat,
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
    setFormData({
      name: endpoint.name,
      category: endpoint.category,
      post_url: endpoint.post_url,
      auth_token: endpoint.auth_token || '',
      expected_format: JSON.stringify(endpoint.expected_format || {}, null, 2),
      active: endpoint.active
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
                <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
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

            <div>
              <Label htmlFor="post_url">POST URL *</Label>
              <Input
                id="post_url"
                value={formData.post_url}
                onChange={(e) => setFormData({ ...formData, post_url: e.target.value })}
                placeholder="https://api.example.com/webhook"
              />
            </div>

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
                        {endpoint.post_url}
                      </code>
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
