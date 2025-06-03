-- Migration script to move auth_tokens from mcp_endpoints to mcp_connection_params

-- Common Table Expression (CTE) to select relevant endpoint data and determine the effective provider name
WITH endpoint_tokens AS (
    SELECT
        user_id,
        -- Use provider_name if it's not null and not empty, otherwise fall back to LOWER(category)
        -- Ensure the result is not an empty string. If both are empty/null, this row will be filtered out later.
        NULLIF(TRIM(COALESCE(NULLIF(TRIM(provider_name), ''), LOWER(category))), '') AS effective_provider_name,
        auth_token,
        updated_at
    FROM
        public.mcp_endpoints
    WHERE
        auth_token IS NOT NULL AND TRIM(auth_token) <> '' -- Only consider rows with a non-empty auth_token
),

-- CTE to rank tokens by most recent updated_at for each user_id and effective_provider_name
ranked_endpoint_tokens AS (
    SELECT
        user_id,
        effective_provider_name,
        auth_token,
        updated_at,
        ROW_NUMBER() OVER (PARTITION BY user_id, effective_provider_name ORDER BY updated_at DESC) as rn
    FROM
        endpoint_tokens
    WHERE
        effective_provider_name IS NOT NULL -- Filter out any rows where provider could not be determined
)

-- Insert into mcp_connection_params, handling conflicts
INSERT INTO public.mcp_connection_params (user_id, provider_name, connection_values, created_at, updated_at)
SELECT
    user_id,
    effective_provider_name,
    jsonb_build_object('token', auth_token) AS connection_values,
    NOW() AS created_at, -- Set created_at to the time of migration
    updated_at -- Preserve the original updated_at from mcp_endpoints as the initial updated_at
FROM
    ranked_endpoint_tokens
WHERE
    rn = 1 -- Select only the most recent token for each user/provider combination
ON CONFLICT (user_id, provider_name) DO NOTHING;

-- Example of how to check if the migration worked (optional, for development/testing):
/*
SELECT
    ep.user_id,
    COALESCE(NULLIF(TRIM(ep.provider_name), ''), LOWER(ep.category)) as original_provider_ref,
    ep.auth_token as old_token,
    ep.updated_at as old_updated_at,
    cp.provider_name as new_provider_name,
    cp.connection_values as new_connection_values,
    cp.created_at as new_created_at,
    cp.updated_at as new_updated_at
FROM public.mcp_endpoints ep
LEFT JOIN public.mcp_connection_params cp
ON ep.user_id = cp.user_id AND COALESCE(NULLIF(TRIM(ep.provider_name), ''), LOWER(ep.category)) = cp.provider_name
WHERE ep.auth_token IS NOT NULL AND TRIM(ep.auth_token) <> '';

SELECT * FROM public.mcp_connection_params;
*/
