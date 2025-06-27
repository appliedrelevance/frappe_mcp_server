FROM node:20-slim

WORKDIR /app

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application
COPY . .

# Build the application
RUN npm run build

# Expose the default MCP server port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production

# Run the server
CMD ["node", "build/index.js"]
