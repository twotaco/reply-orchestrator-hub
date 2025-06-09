import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
// import { supabase } from '@/integrations/supabase/client'; // No longer directly used
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
// Input, Label, Textarea, Select family, Switch, Dialog family, Table family, toast, specific icons, Checkbox moved to child components
import { Plus, Edit } from 'lucide-react'; // Trash2, TestTube, Save, X moved
import type { MCPEndpoint } from './types'; // Other specific types moved to child components
import { categoryMapUtil, getPascalCaseCategory } from './utils';
import { useMCPDiscovery } from './hooks/useMCPDiscovery';
import { useMCPEndpoints } from './hooks/useMCPEndpoints';
import { MCPTestModal } from './MCPTestModal';
import { MCPInlineProviderEdit } from './MCPInlineProviderEdit';
import { MCPForm } from './MCPForm';
import { MCPTableComponent } from './MCPTableComponent';

// const categories array is now removed, will be fetched.

// categoryMap definition removed from here, moved outside and renamed to categoryMapUtil within getPascalCaseCategory scope

export function MCPManagement() {
  const { user, role } = useAuth(); // Added role
  const isContributor = role === 'contributor'; // Defined isContributor
  const { discoveredProviders, discoveryLoading, discoveryError, fetchDiscoveryData } = useMCPDiscovery();
  const { savedConfiguredActions, loadingEndpoints, fetchEndpoints, deleteEndpoint, toggleEndpointActive } = useMCPEndpoints(user);
  const [showAddForm, setShowAddForm] = useState(false); // Controls visibility of the configuration section

  // State for Test Payload Modal
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [testingEndpoint, setTestingEndpoint] = useState<MCPEndpoint | null>(null); // Endpoint being prepared for test in modal
  // currentTestPayload, testResponse, testingId were moved to MCPTestModal

  // State for Inline Provider Editing
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  // editingApiKey, editingActionsSelection, editingConnectionParams, loadingConnectionParams are moved to MCPInlineProviderEdit

  // formData, actionFormsData, loadingMainFormConnectionParams are moved to MCPForm.tsx

  useEffect(() => {
    if (user) {
      fetchEndpoints();
      fetchDiscoveryData();
    }
  }, [user, fetchEndpoints, fetchDiscoveryData]);

  // resetForm, handleProviderSelect, handleActionConfigChange, handleSave, handleEdit, handleTest are moved to child components

  if (loadingEndpoints) {
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
          <h1 className="text-3xl font-bold">Email Agent Tools & Connections</h1>
          <p className="text-gray-600 mt-2">Connect your Know Reply AI assistant to the tools and systems it needs to take action on your behalf (like looking up orders, updating bookings, or sending invoices) with Model Context Protocol (MCP) endpoints.</p>
        </div>
        <Button onClick={() => setShowAddForm(true)} disabled={isContributor || showAddForm}>
          <Plus className="h-4 w-4 mr-2" />
          Add a Connection
        </Button>
      </div>

      {isContributor && (
        <p className="my-4 text-orange-600 bg-orange-50 border border-orange-200 p-3 rounded-md">
          As a Contributor, you have view-only access to most of this page. Configuration changes must be made by an Admin. You are permitted to use the 'Test Action' functionality.
        </p>
      )}

      {showAddForm && !isContributor && (
        <MCPForm
          user={user}
          discoveredProviders={discoveredProviders}
          discoveryLoading={discoveryLoading}
          discoveryError={discoveryError}
          savedConfiguredActions={savedConfiguredActions}
          categoryMapUtil={categoryMapUtil}
          getPascalCaseCategory={getPascalCaseCategory}
          onSaveSuccess={() => {
            fetchEndpoints(); // From useMCPEndpoints hook
            setShowAddForm(false);
          }}
          onCancel={() => setShowAddForm(false)}
        />
      )}

     <Card>
        <CardHeader>
          <CardTitle>Configured Connections</CardTitle>
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
                      const lowerCategory = category.toLowerCase();
                      setEditingCategory(lowerCategory);
                      setShowAddForm(false); // Hide main form if inline editing
                      // Other logic moved to MCPInlineProviderEdit's useEffect
                    }}
                    disabled={isContributor} // Added disabled prop
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Configure Provider
                  </Button>
                </div>
                {editingCategory === category.toLowerCase() && !isContributor ? (
                  <MCPInlineProviderEdit
                    editingCategory={editingCategory}
                    onCancel={() => setEditingCategory(null)}
                    onSaveSuccess={() => {
                      fetchEndpoints(); // Refresh data in parent
                      setEditingCategory(null); // Close the form
                    }}
                    user={user}
                    discoveredProviders={discoveredProviders}
                    currentSavedActionsForCategory={actionsInGroup}
                    categoryMapUtil={categoryMapUtil}
                    getPascalCaseCategory={getPascalCaseCategory}
                  />
                ) : (
                  <MCPTableComponent
                    actionsInGroup={actionsInGroup}
                    onTestEndpoint={(endpoint) => {
                      setTestingEndpoint(endpoint);
                      // setTestResponse(null); // MCPTestModal handles this
                      setIsTestModalOpen(true);
                    }}
                    onDeleteEndpoint={deleteEndpoint}
                    onToggleEndpointActive={toggleEndpointActive}
                    isContributor={isContributor} // Passed isContributor prop
                  />
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Test Payload Modal now handled by MCPTestModal component */}
      <MCPTestModal
        isOpen={isTestModalOpen}
        onOpenChange={setIsTestModalOpen}
        endpointToTest={testingEndpoint}
        user={user}
      />
    </div>
  );
}
