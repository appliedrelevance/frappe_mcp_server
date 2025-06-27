# Docker Support for Frappe MCP Server

This document explains how to run the Frappe MCP Server using Docker.

## Prerequisites

- Docker and Docker Compose installed on your system
- API key and secret from your Frappe instance

## Running with Docker

### Using docker-compose

1. Create a `.env` file in the root directory with your Frappe credentials:

```
FRAPPE_URL=https://your-frappe-instance.com
FRAPPE_API_KEY=your_api_key
FRAPPE_API_SECRET=your_api_secret
```

2. Build and start the container:

```bash
docker-compose up -d
```

3. To view logs:

```bash
docker-compose logs -f
```

4. To stop the container:

```bash
docker-compose down
```

### Using Docker directly

1. Build the Docker image:

```bash
docker build -t frappe-mcp-server .
```

2. Run the container:

```bash
docker run -p 3000:3000 \
  -e FRAPPE_URL=https://your-frappe-instance.com \
  -e FRAPPE_API_KEY=your_api_key \
  -e FRAPPE_API_SECRET=your_api_secret \
  -v ./src/server_hints:/app/src/server_hints \
  --name frappe-mcp-server \
  frappe-mcp-server
```

## Configuration

The Docker container is configured using environment variables:

- `FRAPPE_URL`: The URL of your Frappe instance
- `FRAPPE_API_KEY`: Your Frappe API key
- `FRAPPE_API_SECRET`: Your Frappe API secret

## Volumes

The docker-compose configuration includes a volume for the server hints directory:

```yaml
volumes:
  - ./src/server_hints:/app/src/server_hints
```

This allows you to update the server hints without rebuilding the container.

## Development Mode

For development, you can uncomment the source code volume in docker-compose.yml:

```yaml
volumes:
  - ./src:/app/src
```

This will mount your local source code into the container, allowing you to make changes without rebuilding.
