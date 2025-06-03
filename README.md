# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/6fdf197f-90b4-492e-bd58-aefb2d22df15

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/6fdf197f-90b4-492e-bd58-aefb2d22df15) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/6fdf197f-90b4-492e-bd58-aefb2d22df15) and click on Share -> Publish.

## MCP Integration Details

This section outlines how the application integrates with external services via the Model Context Protocol (MCP), focusing on the management of connection parameters.

### 1. Overview
Provider-specific connection parameters (e.g., API keys, base URLs, client secrets) are now managed separately from individual action configurations. This centralized approach enhances security and simplifies management of credentials.

### 2. Discovery Mechanism
The client application fetches a list of available providers and their capabilities from the MCP server's `/discover` endpoint. A key part of this discovery data is the `connection_schema` for each provider.

*   **`connection_schema`**: This JSON object defines the specific parameters required to establish a connection with a provider. For example:
    *   Stripe might require: `{ "token": { "display_name": "API Key", "type": "password" } }`
    *   WooCommerce might require: `{ "baseUrl": { "display_name": "Base URL" }, "consumerKey": { "display_name": "Consumer Key" }, "consumerSecret": { "display_name": "Consumer Secret", "type": "password" } }`
    The schema includes details like `display_name`, `type` (e.g., `text`, `password`), `placeholder`, and `description` to aid in UI rendering.

### 3. Database Changes
To support this new architecture, database changes have been implemented:

*   **New Table: `mcp_connection_params`**
    *   **Purpose:** Stores user-specific connection values for each third-party provider.
    *   **Key Columns:**
        *   `id` (uuid, PK)
        *   `user_id` (uuid, FK to `auth.users.id`): Links the parameters to a user.
        *   `provider_name` (text): The unique identifier for the provider (e.g., "stripe", "woocommerce").
        *   `connection_values` (jsonb): A JSONB object storing the actual encrypted connection parameters as defined by the provider's `connection_schema` (e.g., `{"token": "sk_encrypted_..."}`).
        *   `created_at`, `updated_at` (timestamptz).
    *   A unique constraint exists on (`user_id`, `provider_name`).

*   **Modified Table: `mcp_endpoints`**
    *   The `auth_token` column has been **removed**.
    *   This table now exclusively stores action-specific details such as the action's name (e.g., "create_customer"), user-defined display name, instructions for the AI, sample payload (`expected_format`), and its active status. It no longer holds any direct authentication credentials.

### 4. Client-Side UI
The client application features a user interface that:
*   Dynamically renders input forms based on the `connection_schema` received from the `/discover` endpoint for each provider.
*   Allows users to securely input and save their connection parameters, which are then stored in the `mcp_connection_params` table.
*   This applies to both the main "Add MCP Endpoint" form and the inline "Configure Provider" section in the MCP Management UI.

### 5. MCP API Call Structure
When the client application (or subsequently the AI model via a tool) makes a call to an MCP server action (e.g., `POST /mcp/{provider_name}/{action_name}`), the request body is structured as follows:

```json
{
  "args": {
    // Action-specific arguments, e.g., customer email, order ID
    "email": "test@example.com"
  },
  "auth": {
    // Connection parameters for the provider
    // e.g., for Stripe: "token": "sk_..."
    // e.g., for WooCommerce: "baseUrl": "...", "consumerKey": "...", "consumerSecret": "..."
  }
}
```
*   The `args` object contains parameters specific to the action being called.
*   The `auth` object is now populated with the entire `connection_values` JSONB object fetched from the `mcp_connection_params` table for the respective `provider_name`. The MCP server then uses these parameters to authenticate with the third-party service.

This separation ensures that the AI only needs to know the `provider_name` and `action_name` to invoke a tool, while the underlying authentication is handled securely by the MCP server using the centrally managed connection parameters.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/tips-tricks/custom-domain#step-by-step-guide)
