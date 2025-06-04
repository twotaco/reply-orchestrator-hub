// This file will contain utility functions and constants for MCP.

export const categoryMapUtil: { [key: string]: string } = {
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
  'wordpress': 'WordPress',
  'zendesk': 'Zendesk'
};

export function getPascalCaseCategory(providerName: string): string {
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
