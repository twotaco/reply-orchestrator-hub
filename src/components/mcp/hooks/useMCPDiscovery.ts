import { useState, useCallback } from 'react';
import type { DiscoveredProvider } from '../types';

export function useMCPDiscovery() {
  const [discoveredProviders, setDiscoveredProviders] = useState<DiscoveredProvider[] | null>(null);
  const [discoveryLoading, setDiscoveryLoading] = useState<boolean>(true);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);

  const fetchDiscoveryData = useCallback(async () => {
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
    } catch (error: any) {
      console.error('Detailed error fetching MCP discovery data:', error);
      setDiscoveryError(`Failed to fetch MCP discovery data. Details: ${error.message}. Check console for more info.`);
    } finally {
      setDiscoveryLoading(false);
    }
  }, []); // Empty dependency array means this function is created once and never changes.

  return { discoveredProviders, discoveryLoading, discoveryError, fetchDiscoveryData };
}
