[![MseeP.ai Security Assessment Badge](https://mseep.net/pr/appliedrelevance-frappe-mcp-server-badge.png)](https://mseep.ai/app/appliedrelevance-frappe-mcp-server)

# Frappe MCP Server

A Model Context Protocol (MCP) server for Frappe Framework that exposes Frappe's functionality to AI assistants through the official REST API, with a focus on document CRUD operations, schema handling, and detailed API instructions.

## Overview

This MCP server allows AI assistants to interact with Frappe applications through a standardized interface using the official Frappe REST API. It provides tools for:

- Document operations (create, read, update, delete, list)
- Schema and metadata handling
- DocType discovery and exploration
- Detailed API usage instructions and examples

The server includes comprehensive error handling, validation, and helpful responses to make it easier for AI assistants to work with Frappe.

## Installation

### Prerequisites

- Node.js 18 or higher
- A running Frappe instance (version 15 or higher)
- API key and secret from Frappe (**required**)

### Setup

1. Install via npm:

```bash
npm install -g frappe-mcp-server
```

Alternatively, run directly with npx:

```bash
npx frappe-mcp-server
```

(no installation needed)

## Configuration

The server is configured using environment variables:

- `FRAPPE_URL`: The URL of your Frappe instance (default: `http://localhost:8000`)
- `FRAPPE_API_KEY`: Your Frappe API key (**required**)
- `FRAPPE_API_SECRET`: Your Frappe API secret (**required**)

> **Important**: API key/secret authentication is the only supported authentication method. Both `FRAPPE_API_KEY` and `FRAPPE_API_SECRET` must be provided for the server to function properly. Username/password authentication is not supported.

### Authentication

This MCP server **only supports API key/secret authentication** via the Frappe REST API. Username/password authentication is not supported.

#### Getting API Credentials

To get API credentials from your Frappe instance:

1. Go to User > API Access > New API Key
2. Select the user for whom you want to create the key
3. Click "Generate Keys"
4. Copy the API Key and API Secret

#### Authentication Troubleshooting

If you encounter authentication errors:

1. Verify that both `FRAPPE_API_KEY` and `FRAPPE_API_SECRET` environment variables are set correctly
2. Ensure the API key is active and not expired in your Frappe instance
3. Check that the user associated with the API key has the necessary permissions
4. Verify the Frappe URL is correct and accessible

The server provides detailed error messages to help diagnose authentication issues.

## Usage

### Starting the Server

```bash
npx frappe-mcp-server
```

Or with environment variables:

```bash
FRAPPE_URL=https://your-frappe-instance.com FRAPPE_API_KEY=your_api_key FRAPPE_API_SECRET=your_api_secret npx frappe-mcp-server
```

### Integrating with AI Assistants

To use this MCP server with an AI assistant, you need to configure the assistant to connect to this server. The exact configuration depends on the AI assistant platform you're using.

For Claude, add the following to your MCP settings configuration file:

```json
{
  "mcpServers": {
    "frappe": {
      "command": "npx",
      "args": ["frappe-mcp-server"], // Assumes frappe-mcp-server is in MCP server path
      "env": {
        "FRAPPE_URL": "https://your-frappe-instance.com",
        "FRAPPE_API_KEY": "your_api_key", // REQUIRED
        "FRAPPE_API_SECRET": "your_api_secret" // REQUIRED
      },
      "disabled": false,
      "alwaysAllow": []
    }
  }
}
```

> **Note**: Both `FRAPPE_API_KEY` and `FRAPPE_API_SECRET` environment variables are required. The server will start without them but most operations will fail with authentication errors.

## Available Tools

### Document Operations

- `create_document`: Create a new document in Frappe
- `get_document`: Retrieve a document from Frappe
- `update_document`: Update an existing document in Frappe
- `delete_document`: Delete a document from Frappe
- `list_documents`: List documents from Frappe with filters

### Schema Operations

- `get_doctype_schema`: Get the complete schema for a DocType including field definitions, validations, and linked DocTypes
- `get_field_options`: Get available options for a Link or Select field
- `get_frappe_usage_info`: Get combined information about a DocType or workflow, including schema metadata, static hints, and app-provided usage guidance

### Helper Tools

- `find_doctypes`: Find DocTypes in the system matching a search term
- `get_module_list`: Get a list of all modules in the system
- `get_doctypes_in_module`: Get a list of DocTypes in a specific module
- `check_doctype_exists`: Check if a DocType exists in the system
- `check_document_exists`: Check if a document exists
- `get_document_count`: Get a count of documents matching filters
- `get_naming_info`: Get the naming series information for a DocType
- `get_required_fields`: Get a list of required fields for a DocType
- `get_api_instructions`: Get detailed instructions for using the Frappe API

## Available Resources

### Schema Resources

- `schema://{doctype}`: Schema information for a DocType
- `schema://{doctype}/{fieldname}/options`: Available options for a Link or Select field
- `schema://modules`: List of all modules in the system
- `schema://doctypes`: List of all DocTypes in the system

## Features

### Usage Information Enhancement

The server provides comprehensive usage information by combining three sources:

1. **Frappe Metadata**: Schema information retrieved directly from the Frappe API
2. **Static Hints**: Supplementary context stored in JSON files within the `static_hints/` directory
3. **Custom App Introspection**: Usage instructions provided directly by custom Frappe apps

This enhancement enables AI assistants to better understand Frappe modules, making them more effective at assisting users with Frappe-based applications.

For more details, see [Usage Information Enhancement](docs/usage_info_enhancement.md).

## Examples

### Creating a Document

```javascript
// Example of using the create_document tool
const result = await useToolWithMcp("frappe", "create_document", {
  doctype: "Customer",
  values: {
    customer_name: "John Doe",
    customer_type: "Individual",
    customer_group: "All Customer Groups",
    territory: "All Territories",
  },
});
```

### Getting a Document

```javascript
// Example of using the get_document tool
const customer = await useToolWithMcp("frappe", "get_document", {
  doctype: "Customer",
  name: "CUST-00001",
  fields: ["customer_name", "customer_type", "email_id"], // Optional: specific fields
});
```

### Listing Documents with Filters

```javascript
// Example of using the list_documents tool with filters
const customers = await useToolWithMcp("frappe", "list_documents", {
  doctype: "Customer",
  filters: {
    customer_type: "Individual",
    territory: "United States",
  },
  fields: ["name", "customer_name", "email_id"],
  limit: 10,
  order_by: "creation desc",
});
```

### Finding DocTypes

```javascript
// Example of using the find_doctypes tool
const salesDocTypes = await useToolWithMcp("frappe", "find_doctypes", {
  search_term: "Sales",
  module: "Selling",
  is_table: false,
});
```

### Getting Required Fields

```javascript
// Example of using the get_required_fields tool
const requiredFields = await useToolWithMcp("frappe", "get_required_fields", {
  doctype: "Sales Order",
});
```

### Getting API Instructions

```javascript
// Example of using the get_api_instructions tool
const instructions = await useToolWithMcp("frappe", "get_api_instructions", {
  category: "DOCUMENT_OPERATIONS",
  operation: "CREATE",
});
```

### Getting Usage Information

```javascript
// Example of using the get_frappe_usage_info tool
const salesOrderInfo = await useToolWithMcp("frappe", "get_frappe_usage_info", {
  doctype: "Sales Order",
});

// Example of getting workflow information
const workflowInfo = await useToolWithMcp("frappe", "get_frappe_usage_info", {
  workflow: "Quote to Sales Order Conversion",
});
```

## Error Handling

The server provides detailed error messages with context to help diagnose issues:

- Missing required parameters
- Invalid field values
- Permission errors
- Network issues
- Server errors

Each error includes:

- A descriptive message
- HTTP status code (when applicable)
- Endpoint information
- Additional details from the Frappe server

## Best Practices

1. **Check DocType Schema First**: Before creating or updating documents, get the schema to understand required fields and validations.

2. **Use Pagination**: When listing documents, use `limit` and `limit_start` parameters to paginate results.

3. **Specify Fields**: Only request the fields you need to improve performance.

4. **Validate Before Creating**: Use `get_required_fields` to ensure you have all required fields before creating a document.

5. **Check Existence**: Use `check_document_exists` before updating or deleting to ensure the document exists.

## License

ISC
