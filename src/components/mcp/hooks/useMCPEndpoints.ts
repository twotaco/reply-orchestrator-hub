import { useState, useCallback } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import type { MCPEndpoint } from '../types';

export function useMCPEndpoints(user: User | null) {
  const [savedConfiguredActions, setSavedConfiguredActions] = useState<MCPEndpoint[]>([]);
  const [loadingEndpoints, setLoadingEndpoints] = useState<boolean>(true);

  const fetchEndpoints = useCallback(async () => {
    if (!user) {
      setSavedConfiguredActions([]);
      setLoadingEndpoints(false);
      return;
    }
    setLoadingEndpoints(true);
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
      toast({
        title: "Error",
        description: "Failed to fetch configured MCP actions.",
        variant: "destructive"
      });
      setSavedConfiguredActions([]); // Clear data on error
    } finally {
      setLoadingEndpoints(false);
    }
  }, [user]); // supabase and toast are stable dependencies, not needed in array

  const deleteEndpoint = useCallback(async (id: string) => {
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
      fetchEndpoints(); // Refresh the list
    } catch (error) {
      console.error('Error deleting MCP endpoint:', error);
      toast({
        title: "Error",
        description: "Failed to delete MCP endpoint",
        variant: "destructive"
      });
    }
  }, [fetchEndpoints]); // supabase and toast are stable

  const toggleEndpointActive = useCallback(async (id: string, currentActiveState: boolean) => {
    try {
      const { error } = await supabase
        .from('mcp_endpoints')
        .update({ active: !currentActiveState })
        .eq('id', id);

      if (error) throw error;
      fetchEndpoints(); // Refresh the list
    } catch (error) {
      console.error('Error updating endpoint status:', error);
      toast({
        title: "Error",
        description: "Failed to update endpoint status",
        variant: "destructive"
      });
    }
  }, [fetchEndpoints]); // supabase and toast are stable

  return {
    savedConfiguredActions,
    loadingEndpoints,
    fetchEndpoints,
    deleteEndpoint,
    toggleEndpointActive,
  };
}
