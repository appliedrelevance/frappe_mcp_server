/**
 * This file contains detailed instructions and examples for using the Frappe API
 * through the MCP server. It provides guidance on common operations and best practices.
 */

/**
 * Common Frappe DocTypes
 * 
 * These are some of the standard DocTypes in Frappe that you might want to interact with:
 * 
 * - User: User accounts in the system
 * - Role: User roles for permission management
 * - DocType: Metadata about document types
 * - DocField: Field definitions for DocTypes
 * - DocPerm: Permission rules for DocTypes
 * - Custom Field: Custom fields added to DocTypes
 * - Custom Script: Client-side scripts for DocTypes
 * - Server Script: Server-side scripts for automation
 * - Workflow: Workflow definitions
 * - Workflow State: States in a workflow
 * - Workflow Action: Actions that transition between workflow states
 */

export const COMMON_DOCTYPES = {
  SYSTEM: [
    'User', 'Role', 'DocType', 'DocField', 'DocPerm', 'Module Def',
    'Custom Field', 'Custom Script', 'Server Script', 'Client Script',
    'Property Setter', 'Print Format', 'Report', 'Page', 'Workflow',
    'Workflow State', 'Workflow Action'
  ],
  CORE: [
    'File', 'Note', 'ToDo', 'Tag', 'Email Queue', 'Email Template',
    'Notification', 'Event', 'Comment', 'Activity Log'
  ]
};

/**
 * Frappe API Usage Instructions
 * 
 * This object contains detailed instructions for common Frappe operations.
 * Each instruction includes a description, example usage, and tips.
 */
export const FRAPPE_INSTRUCTIONS = {
  // Document Operations
  DOCUMENT_OPERATIONS: {
    CREATE: {
      description: "Create a new document in Frappe",
      usage: `
To create a new document, use the create_document tool with the DocType name and field values:

Example:
{
  "doctype": "ToDo",
  "values": {
    "description": "Complete the project",
    "priority": "Medium",
    "status": "Open"
  }
}

Tips:
- Required fields must be included in the values
- For Link fields, provide the exact document name as the value
- For Table fields, provide an array of row objects. **Do not create child documents separately before adding them to the parent document's table field.**
- Child table rows should include all required fields.
- The system will automatically set owner, creation, and modified fields.
- For documents with a naming series (autoname is "naming_series"), do not include the "name" field in the values. The system will generate the name automatically.
      `,
    },
    GET: {
      description: "Retrieve a document from Frappe",
      usage: `
To get a document, use the get_document tool with the DocType name and document name:

Example:
{
  "doctype": "ToDo",
  "name": "TODO-0001",
  "fields": ["description", "status", "priority"] // Optional: specific fields to retrieve
}

Tips:
- If fields are not specified, all fields will be returned
- The document name is case-sensitive
- For standard naming, use the format [DocType]-[Number] (e.g., TODO-0001)
- For documents with custom naming, use the exact document name
      `,
    },
    UPDATE: {
      description: "Update an existing document in Frappe",
      usage: `
To update a document, use the update_document tool with the DocType name, document name, and values to update:

Example:
{
  "doctype": "ToDo",
  "name": "TODO-0001",
  "values": {
    "status": "Completed",
    "priority": "High"
  }
}

Tips:
- Only include fields that need to be updated.
- For Table fields, you need to provide the entire table data, not just the changed rows. **When updating child documents, include the 'name' field for existing rows. Do not attempt to update child documents by creating them separately.**
- The system will automatically update the modified and modified_by fields.
- Some fields may be read-only and cannot be updated.
      `,
    },
    DELETE: {
      description: "Delete a document from Frappe",
      usage: `
To delete a document, use the delete_document tool with the DocType name and document name:

Example:
{
  "doctype": "ToDo",
  "name": "TODO-0001"
}

Tips:
- Deletion may fail if there are dependent documents
- Some documents may be set as not deletable in their DocType configuration
- Deletion permissions are controlled by DocPerm records
      `,
    },
    LIST: {
      description: "List documents from Frappe with filters",
      usage: `
To list documents, use the list_documents tool with the DocType name and optional filters:

Example:
{
  "doctype": "ToDo",
  "filters": {
    "status": "Open",
    "priority": "High"
  },
  "fields": ["name", "description", "status"],
  "limit": 10,
  "limit_start": 0,
  "order_by": "creation desc"
}

Filter Formats:
1. Simple equality: { "status": "Open" }
2. Operators: { "creation": [">=", "2023-01-01"] }
3. Multiple conditions: { "status": "Open", "priority": "High" }
4. OR conditions: [ ["status", "=", "Open"], ["status", "=", "In Progress"] ]

Available operators:
- "=", "!=", "<", ">", "<=", ">=", "like", "not like"
- "in", "not in" (for arrays)
- "is", "is not" (for null values)
- "between" (for date ranges)

Tips:
- Before using the \`list_documents\` tool with filters, the schema for the target doctype **must** be retrieved (e.g., using a \`get_doctype_schema\` tool or equivalent functionality). This step is crucial to identify the correct field names for the filter conditions, preventing errors due to invalid field references.
- Use limit and limit_start for pagination
- order_by accepts field name with optional "asc" or "desc" direction
- If fields are not specified, standard fields will be returned
- Complex filters can be created using arrays for OR conditions
      `,
    },
  },

  // Schema Operations
  SCHEMA_OPERATIONS: {
    GET_DOCTYPE_SCHEMA: {
      description: "Get the complete schema for a DocType",
      usage: `
To get a DocType schema, use the get_doctype_schema tool with the DocType name:

Example:
{
  "doctype": "ToDo"
}

The response includes:
- Field definitions with types, labels, and validation rules
- Permissions information
- Naming configuration
- Workflow information (if applicable)

Tips:
- Use this to understand the structure of a DocType before creating or updating documents
- Check required fields, field types, and validation rules
- Examine linked DocTypes for reference fields
- Review permissions to ensure operations will succeed
      `,
    },
    GET_FIELD_OPTIONS: {
      description: "Get available options for a Link or Select field",
      usage: `
To get field options, use the get_field_options tool with the DocType name and field name:

Example:
{
  "doctype": "ToDo",
  "fieldname": "priority",
  "filters": {
    "enabled": 1
  }
}

Tips:
- For Link fields, this returns documents from the linked DocType
- For Select fields, this returns the predefined options
- Use filters to narrow down the options for Link fields
- The response includes both value and label for each option
      `,
    },
    FIND_DOCTYPE: {
      description: "Find DocTypes in the system",
      usage: `
To find DocTypes, use the list_documents tool with DocType as the doctype:

Example:
{
  "doctype": "DocType",
  "filters": {
    "istable": 0,
    "issingle": 0
  },
  "fields": ["name", "module", "description"],
  "limit": 20
}

Common filters for DocTypes:
- istable: 0/1 (whether it's a child table)
- issingle: 0/1 (whether it's a single document)
- module: "Core" (filter by module)
- custom: 0/1 (whether it's a custom DocType)
- name: ["like", "%User%"] (search by name)

Tips:
- Use this to discover available DocTypes in the system
- Filter by module to find related DocTypes
- Check istable=0 and issingle=0 for regular DocTypes
- Check custom=1 for custom DocTypes
      `,
    },
  },

  // Advanced Operations
  ADVANCED_OPERATIONS: {
    WORKING_WITH_CHILD_TABLES: {
      description: "Working with child tables (Table fields)",
      usage: `
Child tables are handled as arrays of row objects when creating or updating documents:

Example (Creating a document with child table):
{
  "doctype": "Sales Order",
  "values": {
    "customer": "Customer Name",
    "delivery_date": "2023-12-31",
    "items": [
      {
        "item_code": "ITEM-001",
        "qty": 5,
        "rate": 100
      },
      {
        "item_code": "ITEM-002",
        "qty": 2,
        "rate": 200
      }
    ]
  }
}

Example (Updating a child table):
{
  "doctype": "Sales Order",
  "name": "SO-0001",
  "values": {
    "items": [
      {
        "name": "existing-row-id-1", // Include row ID for existing rows
        "qty": 10 // Updated quantity
      },
      {
        "item_code": "ITEM-003", // New row without name field
        "qty": 3,
        "rate": 150
      }
    ]
  }
}

Tips:
- When updating, include the row "name" for existing rows
- Rows without a "name" field will be added as new rows
- Rows in the database but not in the update will be deleted
- Always include all required fields for new rows
      `,
    },
    HANDLING_FILE_ATTACHMENTS: {
      description: "Handling file attachments",
      usage: `
Files in Frappe are stored as File documents. To attach a file to a document:

1. First, create a File document:
{
  "doctype": "File",
  "values": {
    "file_name": "document.pdf",
    "is_private": 1,
    "content": "[base64 encoded content]",
    "attached_to_doctype": "ToDo",
    "attached_to_name": "TODO-0001"
  }
}

2. The file will automatically be attached to the specified document

Tips:
- Use base64 encoding for the file content
- Set is_private to 1 for private files, 0 for public files
- The attached_to_doctype and attached_to_name fields link the file to a document
- To get attached files, list File documents with filters for attached_to_doctype and attached_to_name
      `,
    },
    WORKING_WITH_WORKFLOWS: {
      description: "Working with workflows",
      usage: `
Documents with workflows have additional fields for tracking the workflow state:

1. Check if a DocType has a workflow:
{
  "doctype": "DocType",
  "name": "ToDo",
  "fields": ["name", "workflow_state"]
}

2. Get available workflow states:
{
  "doctype": "Workflow",
  "filters": {
    "document_type": "ToDo"
  }
}

3. Update a document's workflow state:
{
  "doctype": "ToDo",
  "name": "TODO-0001",
  "values": {
    "workflow_state": "Approved"
  }
}

Tips:
- Workflow transitions may have permission requirements
- Some states may require additional fields to be filled
- Workflow actions may trigger notifications or other automations
- Check the Workflow DocType for the complete workflow definition
      `,
    },
  },

  // Common Patterns and Best Practices
  BEST_PRACTICES: {
    HANDLING_ERRORS: {
      description: "Handling common errors",
      usage: `
Common Frappe API errors and how to handle them:

1. Document not found:
   - Check if the document exists
   - Verify the document name is correct (case-sensitive)
   - Ensure you have permission to access the document

2. Permission denied:
   - Check if you have the required permissions
   - Verify the API key has sufficient privileges
   - Check if the document is restricted by user permissions

3. Validation errors:
   - Required fields are missing
   - Field value doesn't match validation rules
   - Linked document doesn't exist
   - Unique constraint violation

4. Workflow errors:
   - Invalid workflow state transition
   - Missing workflow transition permission

Tips:
- Always check the error message for specific details
- Use get_doctype_schema to understand field requirements
- Test operations with minimal data first
- Handle errors gracefully in your application
      `,
    },
    EFFICIENT_QUERYING: {
      description: "Efficient querying patterns",
      usage: `
Tips for efficient querying in Frappe:

1. Always specify only the fields you need:
{
  "doctype": "ToDo",
  "fields": ["name", "description", "status"],
  "limit": 10
}

2. Use appropriate filters to reduce result set:
{
  "doctype": "ToDo",
  "filters": {
    "status": "Open",
    "owner": "current_user"
  }
}

3. Use pagination for large result sets:
{
  "doctype": "ToDo",
  "limit": 20,
  "limit_start": 0,
  "order_by": "modified desc"
}
Then increment limit_start by limit for each page.

4. Use indexed fields in filters when possible:
- name
- modified
- creation
- owner
- docstatus
- Fields marked as "in_standard_filter" or "in_list_view"

5. Avoid complex OR conditions when possible

6. For reporting, consider using Frappe Reports instead of raw queries
      `,
    },
    NAMING_CONVENTIONS: {
      description: "Understanding Frappe naming conventions",
      usage: `
Frappe uses several naming conventions for documents:

1. Standard naming: [DocType]-[Number] (e.g., TODO-0001)
   - Automatically generated when autoname is "naming_series"

2. Field-based naming: Uses a field value as the name
   - When autoname is "field:[fieldname]"

3. Format-based naming: Uses a pattern with fields
   - When autoname is like "HR-EMP-.YYYY.-.#####"
   - Supports date formatting (YYYY, MM, DD) and sequences (#)

4. Prompt naming: User provides the name
   - When autoname is "prompt"

5. Custom naming: Programmatically generated
   - When autoname is "custom"

Tips:
- Check the DocType's autoname field to understand its naming convention
- Names are case-sensitive and must be unique within a DocType
- When creating documents, you can often omit the name for auto-named DocTypes
- For manually named DocTypes, always provide a unique name
      `,
    },
    USER_FRIENDLY_DISPLAY_NAMES: {
      description: "Using user-friendly names vs. internal IDs",
      usage: `
When presenting information to the user, generating summaries, or updating descriptive documentation (such as markdown files):
*   Prioritize using user-friendly display names for Frappe documents (e.g., the \`account_name\` for an Account, \`item_name\` for an Item, \`full_name\` for a User) instead of their internal \`name\` (ID).
*   If you only have the document's internal \`name\` (ID), and need its display name for descriptive purposes, attempt to fetch the document to retrieve the appropriate display field.
*   **Important Distinction:** For all direct API interactions with Frappe (e.g., creating documents, updating documents, setting link fields, applying filters via \`list_documents\`), you **must** continue to use the internal Frappe \`name\` (ID) of the document in the relevant data fields to ensure correct system operation.

Example:
If you have an Account with \`name\` = "001-ACC" and \`account_name\` = "Sales Revenue Account".
- When showing this account in a report: Display "Sales Revenue Account".
- When setting this account in a Journal Entry's \`account\` field (a Link field): Use "001-ACC".
      `,
    },
  }
};

/**
 * Helper function to get instructions for a specific operation
 */
export function getInstructions(category: string, operation: string): string {
  const categoryData = (FRAPPE_INSTRUCTIONS as any)[category];
  if (!categoryData) {
    return `Category '${category}' not found in instructions.`;
  }

  const operationData = categoryData[operation];
  if (!operationData) {
    return `Operation '${operation}' not found in category '${category}'.`;
  }

  return `${operationData.description}\n\n${operationData.usage}`;
}

/**
 * Helper function to get a list of common DocTypes
 */
export function getCommonDocTypes(category: string): string[] {
  return COMMON_DOCTYPES[category as keyof typeof COMMON_DOCTYPES] || [];
}

// Define helper tools
export const HELPER_TOOLS = [
  {
    name: "find_doctypes",
    description: "Find DocTypes in the system matching a search term",
    inputSchema: {
      type: "object",
      properties: {
        search_term: { type: "string", description: "Search term to look for in DocType names" },
        module: { type: "string", description: "Filter by module name (optional)" },
        is_table: { type: "boolean", description: "Filter by table DocTypes (optional)" },
        is_single: { type: "boolean", description: "Filter by single DocTypes (optional)" },
        is_custom: { type: "boolean", description: "Filter by custom DocTypes (optional)" },
        limit: { type: "number", description: "Maximum number of results (optional, default 20)" }
      },
      required: []
    }
  },
  {
    name: "get_module_list",
    description: "Get a list of all modules in the system",
    inputSchema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "get_doctypes_in_module",
    description: "Get a list of DocTypes in a specific module",
    inputSchema: {
      type: "object",
      properties: {
        module: { type: "string", description: "Module name" }
      },
      required: ["module"]
    }
  },
  {
    name: "check_doctype_exists",
    description: "Check if a DocType exists in the system",
    inputSchema: {
      type: "object",
      properties: {
        doctype: { type: "string", description: "DocType name to check" }
      },
      required: ["doctype"]
    }
  },
  {
    name: "check_document_exists",
    description: "Check if a document exists",
    inputSchema: {
      type: "object",
      properties: {
        doctype: { type: "string", description: "DocType name" },
        name: { type: "string", description: "Document name to check" }
      },
      required: ["doctype", "name"]
    }
  },
  {
    name: "get_document_count",
    description: "Get a count of documents matching filters",
    inputSchema: {
      type: "object",
      properties: {
        doctype: { type: "string", description: "DocType name" },
        filters: {
          type: "object",
          description: "Filters to apply (optional)",
          additionalProperties: true
        }
      },
      required: ["doctype"]
    }
  },
  {
    name: "get_naming_info",
    description: "Get the naming series information for a DocType",
    inputSchema: {
      type: "object",
      properties: {
        doctype: { type: "string", description: "DocType name" }
      },
      required: ["doctype"]
    }
  },
  {
    name: "get_required_fields",
    description: "Get a list of required fields for a DocType",
    inputSchema: {
      type: "object",
      properties: {
        doctype: { type: "string", description: "DocType name" }
      },
      required: ["doctype"]
    }
  },
  {
    name: "get_api_instructions",
    description: "Get detailed instructions for using the Frappe API",
    inputSchema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description: "Instruction category (DOCUMENT_OPERATIONS, SCHEMA_OPERATIONS, ADVANCED_OPERATIONS, BEST_PRACTICES)"
        },
        operation: {
          type: "string",
          description: "Operation name (e.g., CREATE, GET, UPDATE, DELETE, LIST, GET_DOCTYPE_SCHEMA, etc.)"
        }
      },
      required: ["category", "operation"]
    }
  }
];