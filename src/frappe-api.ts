import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from "axios";
import { formatFilters } from "./frappe-helpers.js";
import { FrappeApp } from "frappe-js-sdk";

// Authentication state tracking
let isAuthenticated = false;
let authenticationInProgress = false;
let lastAuthAttempt = 0;
const AUTH_TIMEOUT = 1000 * 60 * 30; // 30 minutes

/**
 * Error class for Frappe API errors
 */
export class FrappeApiError extends Error {
  statusCode?: number;
  endpoint?: string;
  details?: any;

  constructor(message: string, statusCode?: number, endpoint?: string, details?: any) {
    super(message);
    this.name = "FrappeApiError";
    this.statusCode = statusCode;
    this.endpoint = endpoint;
    this.details = details;
  }

  static fromAxiosError(error: AxiosError, operation: string): FrappeApiError {
    const statusCode = error.response?.status;
    const endpoint = error.config?.url || "unknown";
    let message = `Frappe API error during ${operation}: ${error.message}`;
    let details = null;

    // Extract more detailed error information from Frappe's response
    if (error.response?.data) {
      const data = error.response.data as any;
      if (data.exception) {
        message = `Frappe exception during ${operation}: ${data.exception}`;
        details = data;
      } else if (data._server_messages) {
        try {
          // Server messages are often JSON strings inside a string
          const serverMessages = JSON.parse(data._server_messages);
          const parsedMessages = Array.isArray(serverMessages)
            ? serverMessages.map((msg: string) => {
              try {
                return JSON.parse(msg);
              } catch {
                return msg;
              }
            })
            : [serverMessages];

          message = `Frappe server message during ${operation}: ${parsedMessages.map((m: any) => m.message || m).join("; ")}`;
          details = { serverMessages: parsedMessages };
        } catch (e) {
          message = `Frappe server message during ${operation}: ${data._server_messages}`;
          details = { serverMessages: data._server_messages };
        }
      } else if (data.message) {
        message = `Frappe API error during ${operation}: ${data.message}`;
        details = data;
      }
    }

    return new FrappeApiError(message, statusCode, endpoint, details);
  }
}

// Initialize Frappe JS SDK
console.error(`Initializing Frappe JS SDK with URL: ${process.env.FRAPPE_URL || "http://localhost:8000"}`);
console.error(`Using API Key: ${process.env.FRAPPE_API_KEY ? process.env.FRAPPE_API_KEY.substring(0, 4) + '...' : 'not set'}`);
console.error(`Using API Secret: ${process.env.FRAPPE_API_SECRET ? '***' : 'not set'}`);
console.error(`Username available: ${process.env.FRAPPE_USERNAME ? 'yes' : 'no'}`);
console.error(`Password available: ${process.env.FRAPPE_PASSWORD ? 'yes' : 'no'}`);

// Token-based authentication (primary method)
const frappe = new FrappeApp(process.env.FRAPPE_URL || "http://localhost:8000", {
  useToken: true,
  token: () => `${process.env.FRAPPE_API_KEY}:${process.env.FRAPPE_API_SECRET}`,
  type: "token", // For API key/secret pairs
});

// Password-based authentication (fallback method)
const frappePassword = new FrappeApp(process.env.FRAPPE_URL || "http://localhost:8000");

// Add request interceptor to include X-Press-Team header and log requests
frappe.axios.interceptors.request.use(config => {
  config.headers = config.headers || {};
  config.headers['X-Press-Team'] = process.env.FRAPPE_TEAM_NAME || "";
  console.error(`Making request to: ${config.url}`);
  console.error(`Request method: ${config.method}`);
  console.error(`Request headers:`, JSON.stringify(config.headers, null, 2));
  if (config.data) {
    console.error(`Request data:`, JSON.stringify(config.data, null, 2));
  }
  return config;
});
// Add response interceptor to log responses
frappe.axios.interceptors.response.use(
  response => {
    console.error(`Response status: ${response.status}`);
    console.error(`Response headers:`, JSON.stringify(response.headers, null, 2));
    console.error(`Response data:`, JSON.stringify(response.data, null, 2));
    return response;
  },
  error => {
    console.error(`Response error:`, error);
    if (error.response) {
      console.error(`Error status: ${error.response.status}`);
      console.error(`Error data:`, JSON.stringify(error.response.data, null, 2));
    }
    return Promise.reject(error);
  }
);

// Add the same interceptors to the password-based client
frappePassword.axios.interceptors.request.use(config => {
  config.headers = config.headers || {};
  config.headers['X-Press-Team'] = process.env.FRAPPE_TEAM_NAME || "";
  console.error(`[Password Auth] Making request to: ${config.url}`);
  console.error(`[Password Auth] Request method: ${config.method}`);
  console.error(`[Password Auth] Request headers:`, JSON.stringify(config.headers, null, 2));
  if (config.data) {
    console.error(`[Password Auth] Request data:`, JSON.stringify(config.data, null, 2));
  }
  return config;
});

frappePassword.axios.interceptors.response.use(
  response => {
    console.error(`[Password Auth] Response status: ${response.status}`);
    console.error(`[Password Auth] Response headers:`, JSON.stringify(response.headers, null, 2));
    console.error(`[Password Auth] Response data:`, JSON.stringify(response.data, null, 2));
    return response;
  },
  error => {
    console.error(`[Password Auth] Response error:`, error);
    if (error.response) {
      console.error(`[Password Auth] Error status: ${error.response.status}`);
      console.error(`[Password Auth] Error data:`, JSON.stringify(error.response.data, null, 2));
    }
    return Promise.reject(error);
  }
);

/**
 * Authenticate with username and password
 */
export async function authenticateWithPassword(): Promise<boolean> {
  // Don't authenticate if already in progress
  if (authenticationInProgress) {
    console.error("Authentication already in progress, waiting...");
    // Wait for current authentication to complete
    while (authenticationInProgress) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return isAuthenticated;
  }

  // Check if we've authenticated recently
  const now = Date.now();
  if (isAuthenticated && (now - lastAuthAttempt < AUTH_TIMEOUT)) {
    console.error("Using existing authentication session");
    return true;
  }

  // Start authentication
  authenticationInProgress = true;

  try {
    if (!process.env.FRAPPE_USERNAME || !process.env.FRAPPE_PASSWORD) {
      console.error("Username or password not provided in environment variables");
      isAuthenticated = false;
      return false;
    }

    console.error(`Attempting to login with username: ${process.env.FRAPPE_USERNAME}`);

    const response = await frappePassword.auth().loginWithUsernamePassword({
      username: process.env.FRAPPE_USERNAME,
      password: process.env.FRAPPE_PASSWORD
    });

    console.error("Login response:", JSON.stringify(response, null, 2));
    isAuthenticated = true;
    lastAuthAttempt = now;
    return true;
  } catch (error) {
    console.error("Error authenticating with username/password:", error);
    isAuthenticated = false;
    return false;
  } finally {
    authenticationInProgress = false;
  }
}



/**
 * Helper function to handle API errors
 */
function handleApiError(error: any, operation: string): never {
  if (axios.isAxiosError(error)) {
    throw FrappeApiError.fromAxiosError(error, operation);
  } else {
    throw new FrappeApiError(`Error during ${operation}: ${(error as Error).message}`);
  }
}

// Document operations
export async function getDocument(
  doctype: string,
  name: string,
  fields?: string[]
): Promise<any> {
  try {
    if (!doctype) throw new Error("DocType is required");
    if (!name) throw new Error("Document name is required");

    const fieldsParam = fields ? `?fields=${JSON.stringify(fields)}` : "";
    // const response = await api.get(  // replaced with frappe
    const response = await frappe.db().getDoc(
      doctype,
      name
    );

    if (!response) { // changed from response.data.data to response
      throw new Error(`Invalid response format for document ${doctype}/${name}`);
    }

    return response; // changed from response.data.data to response
  } catch (error) {
    return handleApiError(error, `get_document(${doctype}, ${name})`);
  }
}

/**
 * Get a document using password authentication
 */
export async function getDocumentWithAuth(
  doctype: string,
  name: string,
  fields?: string[]
): Promise<any> {
  try {
    if (!doctype) throw new Error("DocType is required");
    if (!name) throw new Error("Document name is required");

    // Ensure we're authenticated
    const authSuccess = await authenticateWithPassword();
    if (!authSuccess) {
      throw new Error("Failed to authenticate with username/password");
    }

    console.error(`Getting document ${doctype}/${name} using password auth`);

    const response = await frappePassword.db().getDoc(
      doctype,
      name
    );

    console.error(`Get document response (password auth):`,
      JSON.stringify(response, null, 2));

    if (!response) {
      throw new Error(`Invalid response format for document ${doctype}/${name}`);
    }

    return response;
  } catch (error) {
    console.error(`Error in getDocumentWithAuth:`, error);
    return handleApiError(error, `get_document_with_auth(${doctype}, ${name})`);
  }
}

/**
 * Verify that a document was successfully created
 */
async function verifyDocumentCreation(
  doctype: string,
  values: Record<string, any>,
  creationResponse: any
): Promise<{ success: boolean; message: string }> {
  try {
    // First check if we have a name in the response
    if (!creationResponse.name) {
      return { success: false, message: "Response does not contain a document name" };
    }

    // Try to fetch the document directly by name
    try {
      const document = await frappe.db().getDoc(doctype, creationResponse.name);
      if (document && document.name === creationResponse.name) {
        return { success: true, message: "Document verified by direct fetch" };
      }
    } catch (error) {
      console.error(`Error fetching document by name during verification:`, error);
      // Continue with alternative verification methods
    }

    // Try to find the document by filtering
    const filters: Record<string, any> = {};

    // Use the most unique fields for filtering
    if (values.name) {
      filters['name'] = ['=', values.name];
    } else if (values.title) {
      filters['title'] = ['=', values.title];
    } else if (values.description) {
      // Use a substring of the description to avoid issues with long text
      filters['description'] = ['like', `%${values.description.substring(0, 20)}%`];
    }

    if (Object.keys(filters).length > 0) {
      const documents = await frappe.db().getDocList(doctype, {
        filters: filters as any[],
        limit: 5
      });

      if (documents && documents.length > 0) {
        // Check if any of the returned documents match our expected name
        const matchingDoc = documents.find(doc => doc.name === creationResponse.name);
        if (matchingDoc) {
          return { success: true, message: "Document verified by filter search" };
        }

        // If we found documents but none match our expected name, that's suspicious
        return {
          success: false,
          message: `Found ${documents.length} documents matching filters, but none match the expected name ${creationResponse.name}`
        };
      }

      return {
        success: false,
        message: "No documents found matching the creation filters"
      };
    }

    // If we couldn't verify with filters, return a warning
    return {
      success: false,
      message: "Could not verify document creation - no suitable filters available"
    };
  } catch (verifyError) {
    return {
      success: false,
      message: `Error during verification: ${(verifyError as Error).message}`
    };
  }
}

/**
 * Create a document with retry logic
 */
async function createDocumentWithRetry(
  doctype: string,
  values: Record<string, any>,
  maxRetries = 3
): Promise<any> {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.error(`Attempt ${attempt} to create document of type ${doctype}`);

      const result = await frappe.db().createDoc(doctype, values);

      // Verify document creation
      const verificationResult = await verifyDocumentCreation(doctype, values, result);
      if (verificationResult.success) {
        console.error(`Document creation verified on attempt ${attempt}`);
        return { ...result, _verification: verificationResult };
      }

      // If verification failed, throw an error to trigger retry
      lastError = new Error(`Verification failed: ${verificationResult.message}`);
      console.error(`Verification failed on attempt ${attempt}: ${verificationResult.message}`);

      // Wait before retrying (exponential backoff)
      const delay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s, etc.
      await new Promise(resolve => setTimeout(resolve, delay));
    } catch (error) {
      lastError = error;
      console.error(`Error on attempt ${attempt}:`, error);

      // Wait before retrying
      const delay = Math.pow(2, attempt - 1) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // If we've exhausted all retries, throw the last error
  throw lastError || new Error(`Failed to create document after ${maxRetries} attempts`);
}

/**
 * Log operation for transaction-like pattern
 */
async function logOperation(
  operationId: string,
  status: 'start' | 'success' | 'failure' | 'error',
  data: any
): Promise<void> {
  // This could write to a local log file, a database, or even a separate API
  console.error(`[Operation ${operationId}] ${status}:`, JSON.stringify(data, null, 2));

  // In a production system, you might want to persist this information
  // to help with debugging and recovery
}

/**
 * Create a document with transaction-like pattern
 */
async function createDocumentTransactional(
  doctype: string,
  values: Record<string, any>
): Promise<any> {
  // 1. Create a temporary log entry to track this operation
  const operationId = `create_${doctype}_${Date.now()}`;
  try {
    // Log the operation start
    await logOperation(operationId, 'start', { doctype, values });

    // 2. Attempt to create the document
    const result = await createDocumentWithRetry(doctype, values);

    // 3. Verify the document was created
    const verificationResult = await verifyDocumentCreation(doctype, values, result);

    // 4. Log the operation result
    await logOperation(operationId, verificationResult.success ? 'success' : 'failure', {
      result,
      verification: verificationResult
    });

    // 5. Return the result with verification info
    return {
      ...result,
      _verification: verificationResult
    };
  } catch (error) {
    // Log the operation error
    await logOperation(operationId, 'error', { error: (error as Error).message });
    throw error;
  }
}

export async function createDocument(
  doctype: string,
  values: Record<string, any>
): Promise<any> {
  try {
    if (!doctype) throw new Error("DocType is required");
    if (!values || Object.keys(values).length === 0) {
      throw new Error("Document values are required");
    }

    console.error(`Creating document of type ${doctype} with values:`, JSON.stringify(values, null, 2));

    const response = await frappe.db().createDoc(doctype, values);

    console.error(`Create document response:`, JSON.stringify(response, null, 2));

    if (!response) {
      throw new Error(`Invalid response format for creating ${doctype}`);
    }

    // IMPROVED VERIFICATION: Make this a required step, not just a try-catch
    const verificationResult = await verifyDocumentCreation(doctype, values, response);
    if (!verificationResult.success) {
      console.error(`Document creation verification failed: ${verificationResult.message}`);
      // Return the response but include verification info
      return { ...response, _verification: verificationResult };
    }

    return response;
  } catch (error) {
    console.error(`Error in createDocument:`, error);
    return handleApiError(error, `create_document(${doctype})`);
  }
}

/**
 * Create a document using password authentication
 */
export async function createDocumentWithAuth(
  doctype: string,
  values: Record<string, any>
): Promise<any> {
  try {
    if (!doctype) throw new Error("DocType is required");
    if (!values || Object.keys(values).length === 0) {
      throw new Error("Document values are required");
    }

    // Ensure we're authenticated
    const authSuccess = await authenticateWithPassword();
    if (!authSuccess) {
      throw new Error("Failed to authenticate with username/password");
    }

    console.error(`Creating document of type ${doctype} with values using password auth:`,
      JSON.stringify(values, null, 2));

    const response = await frappePassword.db().createDoc(doctype, values);

    console.error(`Create document response (password auth):`,
      JSON.stringify(response, null, 2));

    if (!response) {
      throw new Error(`Invalid response format for creating ${doctype}`);
    }

    // IMPROVED VERIFICATION: Make this a required step, not just a try-catch
    // Use a modified version of verifyDocumentCreation that uses frappePassword
    const verificationResult = await (async () => {
      try {
        // First check if we have a name in the response
        if (!response.name) {
          return { success: false, message: "Response does not contain a document name" };
        }

        // Try to fetch the document directly by name
        try {
          const document = await frappePassword.db().getDoc(doctype, response.name);
          if (document && document.name === response.name) {
            return { success: true, message: "Document verified by direct fetch (password auth)" };
          }
        } catch (error) {
          console.error(`Error fetching document by name during verification (password auth):`, error);
          // Continue with alternative verification methods
        }

        // Try to find the document by filtering
        const filters: Record<string, any> = {};

        // Use the most unique fields for filtering
        if (values.name) {
          filters['name'] = ['=', values.name];
        } else if (values.title) {
          filters['title'] = ['=', values.title];
        } else if (values.description) {
          // Use a substring of the description to avoid issues with long text
          filters['description'] = ['like', `%${values.description.substring(0, 20)}%`];
        }

        if (Object.keys(filters).length > 0) {
          const documents = await frappePassword.db().getDocList(doctype, {
            filters: filters as any[],
            limit: 5
          });

          if (documents && documents.length > 0) {
            // Check if any of the returned documents match our expected name
            const matchingDoc = documents.find(doc => doc.name === response.name);
            if (matchingDoc) {
              return { success: true, message: "Document verified by filter search (password auth)" };
            }

            // If we found documents but none match our expected name, that's suspicious
            return {
              success: false,
              message: `Found ${documents.length} documents matching filters, but none match the expected name ${response.name} (password auth)`
            };
          }

          return {
            success: false,
            message: "No documents found matching the creation filters (password auth)"
          };
        }

        // If we couldn't verify with filters, return a warning
        return {
          success: false,
          message: "Could not verify document creation - no suitable filters available (password auth)"
        };
      } catch (verifyError) {
        return {
          success: false,
          message: `Error during verification (password auth): ${(verifyError as Error).message}`
        };
      }
    })();

    if (!verificationResult.success) {
      console.error(`Document creation verification failed (password auth): ${verificationResult.message}`);
      // Return the response but include verification info
      return { ...response, _verification: verificationResult };
    }

    return response;
  } catch (error) {
    console.error(`Error in createDocumentWithAuth:`, error);
    return handleApiError(error, `create_document_with_auth(${doctype})`);
  }
}

export async function updateDocument(
  doctype: string,
  name: string,
  values: Record<string, any>
): Promise<any> {
  try {
    if (!doctype) throw new Error("DocType is required");
    if (!name) throw new Error("Document name is required");
    if (!values || Object.keys(values).length === 0) {
      throw new Error("Update values are required");
    }

    // const response = await api.put( // replaced with frappe
    const response = await frappe.db().updateDoc(doctype, name, values);


    if (!response) { // changed from response.data.data to response
      throw new Error(`Invalid response format for updating ${doctype}/${name}`);
    }

    return response; // changed from response.data.data to response
  } catch (error) {
    return handleApiError(error, `update_document(${doctype}, ${name})`);
  }
}

/**
 * Update a document using password authentication
 */
export async function updateDocumentWithAuth(
  doctype: string,
  name: string,
  values: Record<string, any>
): Promise<any> {
  try {
    if (!doctype) throw new Error("DocType is required");
    if (!name) throw new Error("Document name is required");
    if (!values || Object.keys(values).length === 0) {
      throw new Error("Update values are required");
    }

    // Ensure we're authenticated
    const authSuccess = await authenticateWithPassword();
    if (!authSuccess) {
      throw new Error("Failed to authenticate with username/password");
    }

    console.error(`Updating document ${doctype}/${name} with values using password auth:`,
      JSON.stringify(values, null, 2));

    const response = await frappePassword.db().updateDoc(doctype, name, values);

    console.error(`Update document response (password auth):`,
      JSON.stringify(response, null, 2));

    if (!response) {
      throw new Error(`Invalid response format for updating ${doctype}/${name}`);
    }

    return response;
  } catch (error) {
    console.error(`Error in updateDocumentWithAuth:`, error);
    return handleApiError(error, `update_document_with_auth(${doctype}, ${name})`);
  }
}

export async function deleteDocument(
  doctype: string,
  name: string
): Promise<any> {
  try {
    if (!doctype) throw new Error("DocType is required");
    if (!name) throw new Error("Document name is required");

    // const response = await api.delete( // replaced with frappe
    const response = await frappe.db().deleteDoc(doctype, name);


    if (!response) { // changed from response.data.data to response
      return response; // changed from response.data.data to response
    }
    return response;

  } catch (error) {
    return handleApiError(error, `delete_document(${doctype}, ${name})`);
  }
}

/**
 * Delete a document using password authentication
 */
export async function deleteDocumentWithAuth(
  doctype: string,
  name: string
): Promise<any> {
  try {
    if (!doctype) throw new Error("DocType is required");
    if (!name) throw new Error("Document name is required");

    // Ensure we're authenticated
    const authSuccess = await authenticateWithPassword();
    if (!authSuccess) {
      throw new Error("Failed to authenticate with username/password");
    }

    console.error(`Deleting document ${doctype}/${name} using password auth`);

    const response = await frappePassword.db().deleteDoc(doctype, name);

    console.error(`Delete document response (password auth):`,
      JSON.stringify(response, null, 2));

    if (!response) {
      return response;
    }
    return response;

  } catch (error) {
    console.error(`Error in deleteDocumentWithAuth:`, error);
    return handleApiError(error, `delete_document_with_auth(${doctype}, ${name})`);
  }
}

export async function listDocuments(
  doctype: string,
  filters?: Record<string, any>,
  fields?: string[],
  limit?: number,
  order_by?: string,
  limit_start?: number
): Promise<any[]> {
  try {
    if (!doctype) throw new Error("DocType is required");

    const params: Record<string, string> = {};

    let order_dir: "asc" | "desc" = "asc"
    if (order_by?.endsWith(" desc")) {
      order_dir = "desc";
      order_by = order_by.split(" ")[0];
    } else
      if (order_by?.endsWith(" asc")) {
        order_dir = "asc";
        order_by = order_by.split(" ")[0];
      }

    if (filters) params.filters = JSON.stringify(filters);
    if (fields) params.fields = JSON.stringify(fields);
    if (limit !== undefined) params.limit = limit.toString();
    if (order_by) params.order_by = order_by;
    if (limit_start !== undefined) params.limit_start = limit_start.toString();

    console.error(`[DEBUG] Requesting documents for ${doctype} with params:`, params);

    const response = await frappe.db().getDocList(doctype, {
      fields: fields,
      filters: filters as any[], // Cast filters to any[] to bypass type checking
      orderBy: order_by ? { field: order_by, order: order_dir } : undefined,
      limit_start: limit_start,
      limit: limit
    });

    if (!response) {
      throw new Error(`Invalid response format for listing ${doctype}`);
    }

    console.error(`[DEBUG] Retrieved ${response.length} ${doctype} documents`);

    return response;
  } catch (error) {
    return handleApiError(error, `list_documents(${doctype})`);
  }
}

/**
 * List documents using password authentication
 */
export async function listDocumentsWithAuth(
  doctype: string,
  filters?: Record<string, any>,
  fields?: string[],
  limit?: number,
  order_by?: string,
  limit_start?: number
): Promise<any[]> {
  try {
    if (!doctype) throw new Error("DocType is required");

    // Ensure we're authenticated
    const authSuccess = await authenticateWithPassword();
    if (!authSuccess) {
      throw new Error("Failed to authenticate with username/password");
    }

    const params: Record<string, string> = {};

    let order_dir: "asc" | "desc" = "asc"
    if (order_by?.endsWith(" desc")) {
      order_dir = "desc";
      order_by = order_by.split(" ")[0];
    } else
      if (order_by?.endsWith(" asc")) {
        order_dir = "asc";
        order_by = order_by.split(" ")[0];
      }

    if (filters) params.filters = JSON.stringify(filters);
    if (fields) params.fields = JSON.stringify(fields);
    if (limit !== undefined) params.limit = limit.toString();
    if (order_by) params.order_by = order_by;
    if (limit_start !== undefined) params.limit_start = limit_start.toString();

    console.error(`[Password Auth] Requesting documents for ${doctype} with params:`, params);

    const response = await frappePassword.db().getDocList(doctype, {
      fields: fields,
      filters: filters as any[], // Cast filters to any[] to bypass type checking
      orderBy: order_by ? { field: order_by, order: order_dir } : undefined,
      limit_start: limit_start,
      limit: limit
    });

    if (!response) {
      throw new Error(`Invalid response format for listing ${doctype}`);
    }

    console.error(`[Password Auth] Retrieved ${response.length} ${doctype} documents`);

    return response;
  } catch (error) {
    console.error(`Error in listDocumentsWithAuth:`, error);
    return handleApiError(error, `list_documents_with_auth(${doctype})`);
  }
}

/**
 * Execute a Frappe method call
 * @param method The method name to call
 * @param params The parameters to pass to the method
 * @returns The method response
 */
export async function callMethod(
  method: string,
  params?: Record<string, any>
): Promise<any> {
  try {
    if (!method) throw new Error("Method name is required");

    // const response = await api.post(`/api/method/${method}`, params || {}); // replaced with frappe
    const response = await frappe.call().post(method, params);


    if (!response) { // changed from response.data.message to response
      throw new Error(`Invalid response format for method ${method}`);
    }

    return response; // changed from response.data.message to response
  } catch (error) {
    return handleApiError(error, `call_method(${method})`);
  }
}

// Schema operations
/**
 * Get the schema for a DocType
 * @param doctype The DocType name
 * @returns The DocType schema
 */
export async function getDocTypeSchema(doctype: string): Promise<any> {
  try {
    if (!doctype) throw new Error("DocType name is required");

    // Primary approach: Use the standard API endpoint
    console.error(`Using standard API endpoint for ${doctype}`);
    let response;
    try {
      // response = await api.get( // replaced with frappe
      response = await frappe.call().get('frappe.get_meta', { doctype: doctype }); // Use frappe.call().get to call frappe.get_meta
      console.error(`Got response from standard API endpoint for ${doctype}`);
      console.error(`Raw response data:`, JSON.stringify(response?.data, null, 2)); // Log raw response data
    } catch (error) {
      console.error(`Error using standard API endpoint for ${doctype}:`, error);
      // Fallback to document API
    }

    // Directly use response data from standard API endpoint (/api/v2/doctype/{doctype}/meta)
    const docTypeData = response; // changed from response?.data?.data to response
    console.error(`Using /api/v2/doctype/{doctype}/meta format`);

    if (docTypeData) {
      // If we got schema data from standard API, process and return it
      const doctypeInfo = docTypeData.doctype || {};
      return {
        name: doctype,
        label: doctypeInfo.name || doctype,
        description: doctypeInfo.description,
        module: doctypeInfo.module,
        issingle: doctypeInfo.issingle === 1,
        istable: doctypeInfo.istable === 1,
        custom: doctypeInfo.custom === 1,
        fields: (docTypeData.fields || []).map((field: any) => ({
          fieldname: field.fieldname,
          label: field.label,
          fieldtype: field.fieldtype,
          required: field.reqd === 1,
          description: field.description,
          default: field.default,
          options: field.options,
          // Include validation information
          min_length: field.min_length,
          max_length: field.max_length,
          min_value: field.min_value,
          max_value: field.max_value,
          // Include linked DocType information if applicable
          linked_doctype: field.fieldtype === "Link" ? field.options : null,
          // Include child table information if applicable
          child_doctype: field.fieldtype === "Table" ? field.options : null,
          // Include additional field metadata
          in_list_view: field.in_list_view === 1,
          in_standard_filter: field.in_standard_filter === 1,
          in_global_search: field.in_global_search === 1,
          bold: field.bold === 1,
          hidden: field.hidden === 1,
          read_only: field.read_only === 1,
          allow_on_submit: field.allow_on_submit === 1,
          set_only_once: field.set_only_once === 1,
          allow_bulk_edit: field.allow_bulk_edit === 1,
          translatable: field.translatable === 1,
        })),
        // Include permissions information
        permissions: docTypeData.permissions || [],
        // Include naming information
        autoname: doctypeInfo.autoname,
        name_case: doctypeInfo.name_case,
        // Include workflow information if available
        workflow: docTypeData.workflow || null,
        // Include additional metadata
        is_submittable: doctypeInfo.is_submittable === 1,
        quick_entry: doctypeInfo.quick_entry === 1,
        track_changes: doctypeInfo.track_changes === 1,
        track_views: doctypeInfo.track_views === 1,
        has_web_view: doctypeInfo.has_web_view === 1,
        allow_rename: doctypeInfo.allow_rename === 1,
        allow_copy: doctypeInfo.allow_copy === 1,
        allow_import: doctypeInfo.allow_import === 1,
        allow_events_in_timeline: doctypeInfo.allow_events_in_timeline === 1,
        allow_auto_repeat: doctypeInfo.allow_auto_repeat === 1,
        document_type: doctypeInfo.document_type,
        icon: doctypeInfo.icon,
        max_attachments: doctypeInfo.max_attachments,
      };
    }


    // Fallback to Document API if standard API failed or didn't return schema data
    console.error(`Falling back to document API for ${doctype}`);
    try {
      console.error(`Using document API to get schema for ${doctype}`);

      // 1. Get the DocType document
      console.error(`Fetching DocType document for ${doctype}`);
      const doctypeDoc = await getDocument("DocType", doctype);
      console.error(`DocType document response:`, JSON.stringify(doctypeDoc).substring(0, 200) + "...");
      console.error(`Full DocType document response:`, doctypeDoc); // Log full response

      if (!doctypeDoc) {
        throw new Error(`DocType ${doctype} not found`);
      }

      console.error(`DocTypeDoc.fields before schema construction:`, doctypeDoc.fields); // Log fields
      console.error(`DocTypeDoc.permissions before schema construction:`, doctypeDoc.permissions); // Log permissions

      return {
        name: doctype,
        label: doctypeDoc.name || doctype,
        description: doctypeDoc.description,
        module: doctypeDoc.module,
        issingle: doctypeDoc.issingle === 1,
        istable: doctypeDoc.istable === 1,
        custom: doctypeDoc.custom === 1,
        fields: doctypeDoc.fields || [], // Use fields from doctypeDoc if available, otherwise default to empty array
        permissions: doctypeDoc.permissions || [], // Use permissions from doctypeDoc if available, otherwise default to empty array
        autoname: doctypeDoc.autoname,
        name_case: doctypeDoc.name_case,
        workflow: null,
        is_submittable: doctypeDoc.is_submittable === 1,
        quick_entry: doctypeDoc.quick_entry === 1,
        track_changes: doctypeDoc.track_changes === 1,
        track_views: doctypeDoc.track_views === 1,
        has_web_view: doctypeDoc.has_web_view === 1,
        allow_rename: doctypeDoc.allow_rename === 1,
        allow_copy: doctypeDoc.allow_copy === 1,
        allow_import: doctypeDoc.allow_import === 1,
        allow_events_in_timeline: doctypeDoc.allow_events_in_timeline === 1,
        allow_auto_repeat: doctypeDoc.allow_auto_repeat === 1,
        document_type: doctypeDoc.document_type,
        icon: doctypeDoc.icon,
        max_attachments: doctypeDoc.max_attachments,
      };


    } catch (error) {
      console.error(`Error using document API for ${doctype}:`, error);
      // If document API also fails, then we cannot retrieve the schema
    }


    throw new Error(`Could not retrieve schema for DocType ${doctype} using any available method`);
  } catch (error) {
    return handleApiError(error, `get_doctype_schema(${doctype})`);
  }
}

export async function getFieldOptions(
  doctype: string,
  fieldname: string,
  filters?: Record<string, any>
): Promise<Array<{ value: string; label: string }>> {
  try {
    if (!doctype) throw new Error("DocType name is required");
    if (!fieldname) throw new Error("Field name is required");

    // First get the field metadata to determine the type and linked DocType
    const schema = await getDocTypeSchema(doctype);

    if (!schema || !schema.fields || !Array.isArray(schema.fields)) {
      throw new Error(`Invalid schema returned for DocType ${doctype}`);
    }

    const field = schema.fields.find((f: any) => f.fieldname === fieldname);

    if (!field) {
      throw new Error(`Field ${fieldname} not found in DocType ${doctype}`);
    }

    if (field.fieldtype === "Link") {
      // For Link fields, get the list of documents from the linked DocType
      const linkedDocType = field.options;
      if (!linkedDocType) {
        throw new Error(`Link field ${fieldname} has no options (linked DocType) specified`);
      }

      console.error(`Getting options for Link field ${fieldname} from DocType ${linkedDocType}`);

      try {
        // Try to get the title field for the linked DocType
        const linkedSchema = await getDocTypeSchema(linkedDocType);
        const titleField = linkedSchema.fields.find((f: any) => f.fieldname === "title" || f.bold === 1);
        const displayFields = titleField ? ["name", titleField.fieldname] : ["name"];

        // const response = await api.get(`/api/resource/${encodeURIComponent(linkedDocType)}`, { // replaced with frappe
        const response = await frappe.db().getDocList(linkedDocType, { limit: 50, fields: displayFields, filters: filters as any });


        if (!response) { // changed from response.data.data to response
          throw new Error(`Invalid response for DocType ${linkedDocType}`);
        }

        return response.map((item: any) => { // changed from response.data.data.map to response.map
          const label = titleField && item[titleField.fieldname]
            ? `${item.name} - ${item[titleField.fieldname]}`
            : item.name;

          return {
            value: item.name,
            label: label,
          };
        });
      } catch (error) {
        console.error(`Error fetching options for Link field ${fieldname}:`, error);
        // Try a simpler approach as fallback
        // const response = await api.get(`/api/resource/${encodeURIComponent(linkedDocType)}`, { // replaced with frappe
        const response = await frappe.db().getDocList(linkedDocType, { limit: 50, fields: ["name"], filters: filters as any });


        if (!response) { // changed from response.data.data to response
          throw new Error(`Invalid response for DocType ${linkedDocType}`);
        }

        return response.map((item: any) => ({ // changed from response.data.data.map to response.map
          value: item.name,
          label: item.name,
        }));
      }
    } else if (field.fieldtype === "Select") {
      // For Select fields, parse the options string
      console.error(`Getting options for Select field ${fieldname}: ${field.options}`);

      if (!field.options) {
        return [];
      }

      return field.options.split("\n")
        .filter((option: string) => option.trim() !== '')
        .map((option: string) => ({
          value: option.trim(),
          label: option.trim(),
        }));
    } else if (field.fieldtype === "Table") {
      // For Table fields, return an empty array with a message
      console.error(`Field ${fieldname} is a Table field, no options available`);
      return [];
    } else {
      console.error(`Field ${fieldname} is type ${field.fieldtype}, not Link or Select`);
      return [];
    }
  } catch (error) {
    console.error(`Error in getFieldOptions for ${doctype}.${fieldname}:`, error);
    if (axios.isAxiosError(error)) {
      throw FrappeApiError.fromAxiosError(error, `get_field_options(${doctype}, ${fieldname})`);
    } else {
      throw new FrappeApiError(`Error getting field options for ${doctype}.${fieldname}: ${(error as Error).message}`);
    }
  }
}

/**
 * Get a list of all DocTypes in the system
 * @returns Array of DocType names
 */
export async function getAllDocTypes(): Promise<string[]> {
  try {
    // const response = await api.get('/api/resource/DocType', { // replaced with frappe
    const response = await frappe.db().getDocList('DocType', { limit: 1000, fields: ["name"] });


    if (!response) { // changed from response.data.data to response
      throw new Error('Invalid response format for DocType list');
    }

    return response.map((item: any) => item.name); // changed from response.data.data.map to response.map
  } catch (error) {
    return handleApiError(error, 'get_all_doctypes');
  }
}

/**
 * Get a list of all modules in the system
 * @returns Array of module names
 */
export async function getAllModules(): Promise<string[]> {
  try {
    // const response = await api.get('/api/resource/Module Def', { // replaced with frappe
    const response = await frappe.db().getDocList('Module Def', { limit: 100, fields: ["name", "module_name"] });


    if (!response) { // changed from response.data.data to response
      throw new Error('Invalid response format for Module list');
    }

    return response.map((item: any) => item.name || item.module_name); // changed from response.data.data.map to response.map
  } catch (error) {
    return handleApiError(error, 'get_all_modules');
  }
}

/**
 * Check the health of the Frappe API connection
 * @returns Health status information
 */
export async function checkFrappeApiHealth(): Promise<{
  healthy: boolean;
  tokenAuth: boolean;
  passwordAuth: boolean;
  message: string;
}> {
  const result = {
    healthy: false,
    tokenAuth: false,
    passwordAuth: false,
    message: ""
  };

  try {
    // Try token authentication
    try {
      const tokenResponse = await frappe.db().getDocList("DocType", { limit: 1 });
      result.tokenAuth = true;
    } catch (tokenError) {
      console.error("Token authentication health check failed:", tokenError);
      result.tokenAuth = false;
    }

    // Try password authentication
    try {
      const authSuccess = await authenticateWithPassword();
      if (authSuccess) {
        const passwordResponse = await frappePassword.db().getDocList("DocType", { limit: 1 });
        result.passwordAuth = true;
      }
    } catch (passwordError) {
      console.error("Password authentication health check failed:", passwordError);
      result.passwordAuth = false;
    }

    // Set overall health status
    result.healthy = result.tokenAuth || result.passwordAuth;
    result.message = result.healthy
      ? `API connection healthy. Token auth: ${result.tokenAuth}, Password auth: ${result.passwordAuth}`
      : "API connection unhealthy. Both authentication methods failed.";

    return result;
  } catch (error) {
    result.message = `Health check failed: ${(error as Error).message}`;
    return result;
  }
}