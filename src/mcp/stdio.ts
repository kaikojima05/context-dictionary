#!/usr/bin/env npx tsx
import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { config } from "dotenv";
import { ContextService } from "../services/context-service.js";
import { createContextMcpServer } from "./server.js";

config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

const { default: prisma } = await import("../db/client.js");
const server = createContextMcpServer(new ContextService(prisma));

try {
  await server.connect(new StdioServerTransport());
} catch (error) {
  console.error("context-dictionary MCP server failed", error);
  process.exit(1);
}
