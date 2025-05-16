import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { callMethod } from "./frappe-api.js";
import {
  createDocument,
  getDocument,
  updateDocument,
  deleteDocument,
  listDocuments,
  FrappeApiError
} from "./frappe-api.js";
import { getRequiredFields, formatFilters } from "./frappe-helpers.js";
import { FRAPPE_INSTRUCTIONS } from "./frappe-instructions.js";

/**
 * Format error response with detailed information
 */
function formatErrorResponse(error: any, operation: string): any {
  // Include all error diagnostics directly in the response
  const apiKey = process.env.FRAPPE_API_KEY;
  const apiSecret = process.env.FRAPPE_API_SECRET;
  
  // Build a detailed diagnostic message
  let diagnostics = [
    `Error in ${operation}`,
    `Error type: ${typeof error}`,
    `Constructor: ${error.constructor?.name || 'unknown'}`,
    `Is FrappeApiError: ${error instanceof FrappeApiError}`,
    `Error properties: ${Object.keys(error).join(', ')}`,
    `API Key available: ${!!apiKey}`,
    `API Secret available: ${!!apiSecret}`
  ].join('\n');
  
  let errorMessage = '';
  let errorDetails = null;

  // Check for missing credentials first as this is likely the issue
  if (!apiKey || !apiSecret) {
    errorMessage = `Authentication failed: ${!apiKey && !apiSecret ? 'Both API key and API secret are missing' :
                    !apiKey ? 'API key is missing' : 'API secret is missing'}. API key/secret is the only supported authentication method.`;
    errorDetails = {
      error: "Missing credentials",
      apiKeyAvailable: !!apiKey,
      apiSecretAvailable: !!apiSecret,
      authMethod: "API key/secret (token)",
      diagnostics: diagnostics
    };
  }
  // Then check if it's a FrappeApiError
  else if (error instanceof FrappeApiError) {
    errorMessage = error.message;
    // Include the full error object properties for debugging
    errorDetails = {
      statusCode: error.statusCode,
      endpoint: error.endpoint,
      details: error.details,
      message: error.message,
      name: error.name,
      stack: error.stack?.split('\n').slice(0, 3).join('\n'),
      diagnostics: diagnostics,
      authError: false  // Initialize the property
    };
    
    // If it's an authentication error, provide more specific guidance
    if (error.message.includes('Authentication') ||
        error.message.includes('auth') ||
        error.statusCode === 401 ||
        error.statusCode === 403) {
      
      errorMessage = `Authentication error: ${error.message}. Please check your API key and secret.`;
      errorDetails.authError = true;
    }
  }
  // Check for Axios errors
  else if (error.isAxiosError) {
    errorMessage = `API request error: ${error.message}`;
    errorDetails = {
      status: error.response?.status,
      statusText: error.response?.statusText,
      url: error.config?.url,
      method: error.config?.method,
      diagnostics: diagnostics
    };
  }
  // Default error handling
  else {
    errorMessage = `Error in ${operation}: ${error.message || 'Unknown error'}`;
    errorDetails = {
      diagnostics: diagnostics
    };
  }

  return {
    content: [
      {
        type: "text",
        text: errorMessage,
      },
      ...(errorDetails ? [
        {
          type: "text",
          text: `\nDetails: ${JSON.stringify(errorDetails, null, 2)}`,
        }
      ] : [])
    ],
    isError: true,
  };
}

/**
 * Validate document values against required fields
 */
async function validateDocumentValues(doctype: string, values: Record<string, any>): Promise<string[]> {
  try {
    const requiredFields = await getRequiredFields(doctype);
    const missingFields = requiredFields
      .filter(field => !values.hasOwnProperty(field.fieldname))
      .map(field => field.fieldname);

    return missingFields;
  } catch (error) {
    console.error(`Error validating document values for ${doctype}:`, error);
    return []; // Return empty array on error to avoid blocking the operation
  }
}

// Define document tools
export const DOCUMENT_TOOLS = [
  {
    name: "create_document",
    description: "Create a new document in Frappe",
    inputSchema: {
      type: "object",
      properties: {
        doctype: { type: "string", description: "DocType name" },
        values: {
          type: "object",
          description: "Document field values. Required fields must be included. For Link fields, provide the exact document name. For Table fields, provide an array of row objects.",
          additionalProperties: true
        },
      },
      required: ["doctype", "values"],
    },
  },
  {
    name: "get_document",
    description: "Retrieve a document from Frappe",
    inputSchema: {
      type: "object",
      properties: {
        doctype: { type: "string", description: "DocType name" },
        name: { type: "string", description: "Document name (case-sensitive)" },
        fields: {
          type: "array",
          items: { type: "string" },
          description: "Fields to retrieve (optional). If not specified, all fields will be returned.",
        },
      },
      required: ["doctype", "name"],
    },
  },
  {
    name: "update_document",
    description: "Update an existing document in Frappe",
    inputSchema: {
      type: "object",
      properties: {
        doctype: { type: "string", description: "DocType name" },
        name: { type: "string", description: "Document name (case-sensitive)" },
        values: {
          type: "object",
          description: "Document field values to update. Only include fields that need to be updated. For Table fields, provide the entire table data including row IDs for existing rows.",
          additionalProperties: true
        },
      },
      required: ["doctype", "name", "values"],
    },
  },
  {
    name: "delete_document",
    description: "Delete a document from Frappe",
    inputSchema: {
      type: "object",
      properties: {
        doctype: { type: "string", description: "DocType name" },
        name: { type: "string", description: "Document name (case-sensitive)" },
      },
      required: ["doctype", "name"],
    },
  },
  {
    name: "list_documents",
    description: "List documents from Frappe with filters",
    inputSchema: {
      type: "object",
      properties: {
        doctype: { type: "string", description: "DocType name" },
        filters: {
          type: "object",
          description: "Filters to apply (optional). Simple format: {\"field\": \"value\"} or with operators: {\"field\": [\">\", \"value\"]}. Available operators: =, !=, <, >, <=, >=, like, not like, in, not in, is, is not, between.",
          additionalProperties: true
        },
        fields: {
          type: "array",
          items: { type: "string" },
          description: "Fields to retrieve (optional). For better performance, specify only the fields you need.",
        },
        limit: {
          type: "number",
          description: "Maximum number of documents to retrieve (optional). Use with limit_start for pagination.",
        },
        limit_start: {
          type: "number",
          description: "Starting offset for pagination (optional). Use with limit for pagination.",
        },
        order_by: {
          type: "string",
          description: "Field to order by (optional). Format: \"field_name asc\" or \"field_name desc\".",
        },
      },
      required: ["doctype"],
    },
  },
  {
    name: "reconcile_bank_transaction_with_vouchers",
    description: "Reconciles a Bank Transaction document with specified vouchers by calling a specific Frappe method.",
    inputSchema: {
      type: "object",
      properties: {
        bank_transaction_name: {
          type: "string",
          description: "The ID (name) of the Bank Transaction document to reconcile.",
        },
        vouchers: {
          type: "array",
          description: "An array of voucher objects to reconcile against the bank transaction.",
          items: {
            type: "object",
            properties: {
              payment_doctype: {
                type: "string",
                description: "The DocType of the payment voucher (e.g., Payment Entry, Journal Entry).",
              },
              payment_name: {
                type: "string",
                description: "The ID (name) of the payment voucher document.",
              },
              amount: {
                type: "number",
                description: "The amount from the voucher to reconcile.",
              },
            },
            required: ["payment_doctype", "payment_name", "amount"],
          },
        },
      },
      required: ["bank_transaction_name", "vouchers"],
    },
  },
];

// Export a handler function for document tool calls
export async function handleDocumentToolCall(request: any): Promise<any> {
  const { name, arguments: args } = request.params;

  if (!args) {
    return {
      content: [
        {
          type: "text",
          text: "Missing arguments for tool call",
        },
      ],
      isError: true,
    };
  }

  try {
    console.error("Handling document tool:", name, "with args:", args);

    // Handle document operations
    if (name === "create_document") {
      const doctype = args.doctype as string;
      const values = args.values as Record<string, any>;

      if (!doctype || !values) {
        return {
          content: [
            {
              type: "text",
              text: "Missing required parameters: doctype and values",
            },
          ],
          isError: true,
        };
      }

      // Validate required fields
      const missingFields = await validateDocumentValues(doctype, values);
      if (missingFields.length > 0) {
        return {
          content: [
            {
              type: "text",
              text: `Missing required fields: ${missingFields.join(', ')}`,
            },
            {
              type: "text",
              text: "\nTip: Use get_required_fields tool to see all required fields for this DocType.",
            },
          ],
          isError: true,
        };
      }

      try {
        console.error(`Calling createDocument for ${doctype} with values:`, JSON.stringify(values, null, 2));

        let result;
        let authMethod = "token";
        let verificationSuccess = false;
        let verificationMessage = "";

        // Use API key/secret authentication
        result = await createDocument(doctype, values);
        console.error(`Result from createDocument (API key/secret auth):`, JSON.stringify(result, null, 2));
        authMethod = "api_key";

        // Check for verification result
        if (result._verification && result._verification.success === false) {
          verificationSuccess = false;
          verificationMessage = result._verification.message;
          delete result._verification; // Remove internal property before returning to client
        } else {
          verificationSuccess = true;
        }

        // IMPROVED: Return error if verification failed
        if (!verificationSuccess) {
          return {
            content: [
              {
                type: "text",
                text: `Error: Document creation reported success but verification failed. The document may not have been created.\n\nDetails: ${verificationMessage}`,
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text",
              text: `Document created successfully using ${authMethod} authentication:\n\n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      } catch (error) {
        console.error(`Error in create_document handler:`, error);
        return formatErrorResponse(error, `create_document(${doctype})`);
      }
    } else if (name === "get_document") {
      const doctype = args.doctype as string;
      const docName = args.name as string;
      const fields = args.fields as string[] | undefined;

      if (!doctype || !docName) {
        return {
          content: [
            {
              type: "text",
              text: "Missing required parameters: doctype and name",
            },
          ],
          isError: true,
        };
      }

      try {
        let document;
        let authMethod = "token";

        // Use API key/secret authentication
        document = await getDocument(doctype, docName, fields);
        console.error(`Retrieved document using API key/secret auth:`, JSON.stringify(document, null, 2));
        authMethod = "api_key";

        return {
          content: [
            {
              type: "text",
              text: `Document retrieved using ${authMethod} authentication:\n\n${JSON.stringify(document, null, 2)}`,
            },
          ],
        };
      } catch (error) {
        return formatErrorResponse(error, `get_document(${doctype}, ${docName})`);
      }
    } else if (name === "update_document") {
      const doctype = args.doctype as string;
      const docName = args.name as string;
      const values = args.values as Record<string, any>;

      if (!doctype || !docName || !values) {
        return {
          content: [
            {
              type: "text",
              text: "Missing required parameters: doctype, name, and values",
            },
          ],
          isError: true,
        };
      }

      try {
        let result;
        let authMethod = "token";

        // Use API key/secret authentication
        result = await updateDocument(doctype, docName, values);
        console.error(`Result from updateDocument (API key/secret auth):`, JSON.stringify(result, null, 2));
        authMethod = "api_key";

        return {
          content: [
            {
              type: "text",
              text: `Document updated successfully using ${authMethod} authentication:\n\n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      } catch (error) {
        return formatErrorResponse(error, `update_document(${doctype}, ${docName})`);
      }
    } else if (name === "delete_document") {
      const doctype = args.doctype as string;
      const docName = args.name as string;

      if (!doctype || !docName) {
        return {
          content: [
            {
              type: "text",
              text: "Missing required parameters: doctype and name",
            },
          ],
          isError: true,
        };
      }

      try {
        let authMethod = "token";

        // Use API key/secret authentication
        await deleteDocument(doctype, docName);
        console.error(`Document deleted using API key/secret auth`);
        authMethod = "api_key";

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                message: `Document ${doctype}/${docName} deleted successfully using ${authMethod} authentication`
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        return formatErrorResponse(error, `delete_document(${doctype}, ${docName})`);
      }
    } else if (name === "list_documents") {
      const doctype = args.doctype as string;
      const filters = args.filters as Record<string, any> | undefined;
      const fields = args.fields as string[] | undefined;
      const limit = args.limit as number | undefined;
      const order_by = args.order_by as string | undefined;
      const limit_start = args.limit_start as number | undefined;

      if (!doctype) {
        return {
          content: [
            {
              type: "text",
              text: "Missing required parameter: doctype",
            },
          ],
          isError: true,
        };
      }

      try {
        // Format filters if provided
        const formattedFilters = filters ? formatFilters(filters) : undefined;

        let documents;
        let authMethod = "token";

        // Use API key/secret authentication
        documents = await listDocuments(
          doctype,
          formattedFilters,
          fields,
          limit,
          order_by,
          limit_start
        );
        console.error(`Retrieved ${documents.length} documents using API key/secret auth`);
        authMethod = "api_key";

        // Add pagination info if applicable
        let paginationInfo = "";
        if (limit) {
          const startIndex = limit_start || 0;
          const endIndex = startIndex + documents.length;
          paginationInfo = `\n\nShowing items ${startIndex + 1}-${endIndex}`;

          if (documents.length === limit) {
            paginationInfo += ` (more items may be available, use limit_start=${endIndex} to see next page)`;
          }
        }

        return {
          content: [
            {
              type: "text",
              text: `Documents retrieved using ${authMethod} authentication:\n\n${JSON.stringify(documents, null, 2)}${paginationInfo}`,
            },
          ],
        };
      } catch (error) {
        return formatErrorResponse(error, `list_documents(${doctype})`);
      }
    } else if (name === "reconcile_bank_transaction_with_vouchers") {
      const bankTransactionName = args.bank_transaction_name as string;
      const vouchers = args.vouchers as Array<{ payment_doctype: string; payment_name: string; amount: number }>;

      if (!bankTransactionName || !vouchers) {
        return {
          content: [
            {
              type: "text",
              text: "Missing required parameters: bank_transaction_name and vouchers",
            },
          ],
          isError: true,
        };
      }
      if (!Array.isArray(vouchers) || vouchers.some(v => !v.payment_doctype || !v.payment_name || typeof v.amount !== 'number')) {
        return {
          content: [
            {
              type: "text",
              text: "Invalid format for 'vouchers' parameter. It must be an array of objects, each with 'payment_doctype' (string), 'payment_name' (string), and 'amount' (number).",
            },
          ],
          isError: true,
        };
      }

      try {
        const frappeMethod = "erpnext.accounts.doctype.bank_reconciliation_tool.bank_reconciliation_tool.reconcile_vouchers";
        const params = {
          bank_transaction_name: bankTransactionName,
          vouchers: JSON.stringify(vouchers), // Frappe method expects vouchers as a JSON string
        };

        console.error(`Calling Frappe method '${frappeMethod}' with params:`, JSON.stringify(params, null, 2));
        const result = await callMethod(frappeMethod, params);
        console.error(`Result from '${frappeMethod}':`, JSON.stringify(result, null, 2));

        return {
          content: [
            {
              type: "text",
              text: `Bank transaction '${bankTransactionName}' reconciled successfully with vouchers:\n\n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      } catch (error) {
        console.error(`Error in reconcile_bank_transaction_with_vouchers handler:`, error);
        return formatErrorResponse(error, `reconcile_bank_transaction_with_vouchers(${bankTransactionName})`);
      }
    }


    return {
      content: [
        {
          type: "text",
          text: `Document operations module doesn't handle tool: ${name}`,
        },
      ],
      isError: true,
    };
  } catch (error) {
    return formatErrorResponse(error, `document_operations.${name}`);
  }
}

export function setupDocumentTools(server: Server): void {
  // We no longer register tools here
  // Tools are now registered in the central handler in index.ts

  // This function is kept as a no-op to prevent import errors
  console.error("Document tools are now registered in the central handler in index.ts");
}

/**
 * Handle call_method tool call
 */
export async function handleCallMethodToolCall(request: any): Promise<any> {
  const { name, arguments: args } = request.params;

  if (!args) {
    return {
      content: [
        {
          type: "text",
          text: "Missing arguments for tool call",
        },
      ],
      isError: true,
    };
  }

  try {
    console.error(`Handling call_method tool with args:`, args);
    const method = args.method as string;
    const params = args.params as Record<string, any> | undefined;

    if (!method) {
      return {
        content: [
          {
            type: "text",
            text: "Missing required parameter: method",
          },
        ],
        isError: true,
      };
    }

    const result = await callMethod(method, params);
    return {
      content: [
        {
          type: "text",
          text: `Method ${method} called successfully:\n\n${JSON.stringify(result, null, 2)}`,
        },
      ],
    };
  } catch (error) {
    return formatErrorResponse(error, `call_method(${name})`);
  }
}