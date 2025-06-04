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

/**
 * Generates an example JSON-like object from a Zod schema representation.
 * The schema is expected to be a plain JavaScript object, not a Zod instance.
 * This function is designed to work with the structure produced by exporting
 * a Zod schema (e.g., as stored in MCPEndpoint.expected_format).
 *
 * @param schema The Zod schema object (plain JS representation).
 * @returns A JavaScript object or primitive representing an example payload.
 */
export function generateExamplePayloadFromSchema(schema: any): any {
  if (!schema || typeof schema !== 'object') {
    // console.warn("generateExamplePayloadFromSchema: Schema is null, undefined, or not an object. Returning null.");
    return null;
  }

  function generateFromNode(node: any, path: string = 'root'): any {
    if (!node || typeof node !== 'object') {
      // This might happen if a part of the schema is malformed or just a primitive (e.g. inside ZodLiteral)
      // console.warn(`generateFromNode: Encountered non-object node at path ${path}. Node:`, node);
      return node; // Return the primitive if it's a literal value, or null/undefined
    }

    const typeName = node.typeName;
    // console.log(`Processing path: ${path}, typeName: ${typeName}`);

    switch (typeName) {
      case 'ZodObject': {
        const result: { [key: string]: any } = {};
        if (node.shape && typeof node.shape === 'object') {
          for (const key in node.shape) {
            // The schema structure from the issue shows schema.shape.key IS the next node.
            result[key] = generateFromNode(node.shape[key], `${path}.${key}`);
          }
        } else {
          // console.warn(`generateFromNode: ZodObject at ${path} has no shape or shape is not an object. Node:`, node);
        }
        return result;
      }
      case 'ZodString': {
        // Attempt to provide more specific examples based on checks
        if (node.checks && Array.isArray(node.checks)) {
          for (const check of node.checks) {
            if (check.kind === 'email') return 'user@example.com';
            if (check.kind === 'url') return 'https://example.com';
            if (check.kind === 'uuid') return 'a1b2c3d4-e5f6-7890-1234-567890abcdef';
            // Add more common format checks if needed (e.g., datetime, cuid)
          }
        }
        return node.description ? `string_value_for_${node.description.toLowerCase().replace(/\s+/g, '_')}` : "example_string";
      }
      case 'ZodNumber':
      case 'ZodBigInt': // Treat BigInt as number for example purposes
        return 0;
      case 'ZodBoolean':
        return true;
      case 'ZodDate':
        return new Date().toISOString();
      case 'ZodArray': {
        // node.type is the schema for the array elements
        if (node.type) {
          return [generateFromNode(node.type, `${path}.element`)];
        } else if (node._def && node._def.type) { // Fallback for slightly different Zod structures
           return [generateFromNode(node._def.type, `${path}.element`)];
        }
        // console.warn(`generateFromNode: ZodArray at ${path} has no element type (node.type or node._def.type). Node:`, node);
        return [];
      }
      case 'ZodUnion':
      case 'ZodDiscriminatedUnion': // Treat similarly for example generation
        if (node.options && Array.isArray(node.options) && node.options.length > 0) {
          // Prefer simple types first
          const simplePreferred = ['ZodString', 'ZodNumber', 'ZodBoolean', 'ZodLiteral', 'ZodEnum'];
          for (const preferredType of simplePreferred) {
            const option = node.options.find((opt: any) => opt && opt.typeName === preferredType);
            if (option) return generateFromNode(option, `${path}.unionOption[${preferredType}]`);
          }
          // Then prefer objects or arrays
          const complexPreferred = ['ZodObject', 'ZodArray'];
           for (const preferredType of complexPreferred) {
            const option = node.options.find((opt: any) => opt && opt.typeName === preferredType);
            if (option) return generateFromNode(option, `${path}.unionOption[${preferredType}]`);
          }
          // Otherwise, just pick the first one
          return generateFromNode(node.options[0], `${path}.unionOption[0]`);
        }
        // console.warn(`generateFromNode: ZodUnion/ZodDiscriminatedUnion at ${path} has no options or empty options. Node:`, node);
        return null; // Or some placeholder
      case 'ZodOptional':
      case 'ZodNullable':
        // node.unwrap should give the inner schema definition
        return node.unwrap ? generateFromNode(node.unwrap(), `${path}.optionalNullableUnwrap`) :
               node.innerType ? generateFromNode(node.innerType, `${path}.optionalNullableInner`) : // Zod < v3.22 style
               node._def && node._def.innerType ? generateFromNode(node._def.innerType, `${path}.defOptionalNullableInner`) : null;
      case 'ZodDefault':
        // node._def.innerType contains the actual schema part
        return node._def && node._def.innerType ? generateFromNode(node._def.innerType, `${path}.defaultInner`) : null;
      case 'ZodEnum':
        // node.options (older Zod) or node._def.values (newer Zod) should contain the enum values
        if (node.options && Array.isArray(node.options) && node.options.length > 0) return node.options[0];
        if (node._def && node._def.values && Array.isArray(node._def.values) && node._def.values.length > 0) return node._def.values[0];
        // console.warn(`generateFromNode: ZodEnum at ${path} has no options/values. Node:`, node);
        return "enum_value";
      case 'ZodLiteral':
        // node.value (older Zod) or node._def.value (newer Zod)
        return node.value !== undefined ? node.value : (node._def ? node._def.value : "literal_value");
      case 'ZodEffects': // e.g., transform, preprocess, refine
        // node.schema (older Zod) or node._def.schema (newer Zod) should point to the underlying schema
        return node.schema ? generateFromNode(node.schema, `${path}.effectsSchema`) :
               node._def && node._def.schema ? generateFromNode(node._def.schema, `${path}.defEffectsSchema`) : null;
      case 'ZodNativeEnum': // For enums defined with TypeScript's enum keyword
        // The structure might involve node.enum or node._def.values (which is an object here, not array)
        if (node.enum && typeof node.enum === 'object' && Object.keys(node.enum).length > 0) {
           // Return the first value of the enum. Values can be string or number.
           const enumKeys = Object.keys(node.enum);
           // Filter out number keys if it's a mixed string/number enum due to TS compilation
           const stringKey = enumKeys.find(k => typeof node.enum[k] === 'string');
           if (stringKey) return node.enum[stringKey];
           const numKey = enumKeys.find(k => typeof node.enum[k] === 'number');
           if (numKey) return node.enum[numKey];
        }
        if (node._def && node._def.values && typeof node._def.values === 'object' && Object.keys(node._def.values).length > 0) {
           const firstKey = Object.keys(node._def.values)[0];
           return node._def.values[firstKey];
        }
        // console.warn(`generateFromNode: ZodNativeEnum at ${path} has no recognizable enum values. Node:`, node);
        return "native_enum_value";
      case 'ZodRecord': // For objects with arbitrary string keys, e.g. Record<string, number>
        // node._def.keyType is the schema for keys (usually ZodString)
        // node._def.valueType is the schema for values
        if (node._def && node._def.valueType) {
          const exampleKey = "example_key"; // Keys are typically strings
          return { [exampleKey]: generateFromNode(node._def.valueType, `${path}.${exampleKey}`) };
        }
        // console.warn(`generateFromNode: ZodRecord at ${path} has no valueType. Node:`, node);
        return { "example_key": "example_value" };
      case 'ZodTuple':
        if (node.items && Array.isArray(node.items)) {
          return node.items.map((itemSchema: any, index: number) => generateFromNode(itemSchema, `${path}.tupleItem[${index}]`));
        }
        if (node._def && node._def.items && Array.isArray(node._def.items)) {
          return node._def.items.map((itemSchema: any, index: number) => generateFromNode(itemSchema, `${path}.defTupleItem[${index}]`));
        }
        // console.warn(`generateFromNode: ZodTuple at ${path} has no items. Node:`, node);
        return [];
      case 'ZodIntersection':
        // For intersections, try to merge examples. A simple approach is to generate from both and merge.
        // This can be complex. For now, just use the first part.
        if (node._def && node._def.left) { // Assuming structure like { _def: { left: schemaA, right: schemaB } }
          // A more robust approach would merge properties of two ZodObject examples.
          // For simplicity, we'll just take the left side for now.
          // console.warn(`generateFromNode: ZodIntersection at ${path}. Taking left side. Node:`, node);
          return generateFromNode(node._def.left, `${path}.intersectionLeft`);
        }
        // console.warn(`generateFromNode: ZodIntersection at ${path} could not be processed. Node:`, node);
        return null;
      case 'ZodAny':
      case 'ZodUnknown':
        return "any_value";
      case 'ZodNever':
        return undefined; // Or throw error, as 'never' should not be instantiable
      case 'ZodNull':
        return null;
      case 'ZodUndefined':
        return undefined;
      case 'ZodVoid': // Typically for function return types, not data structures
        return undefined;
      // TODO: Add more Zod types as needed: ZodPipeline, ZodFunction, ZodLazy, ZodBranded, ZodReadonly etc.
      default:
        console.warn(`generateExamplePayloadFromSchema: Unknown Zod typeName '${typeName}' at path '${path}'. Node:`, node);
        return `unknown_type: ${typeName}`;
    }
  }

  return generateFromNode(schema);
}
