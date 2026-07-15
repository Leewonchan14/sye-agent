import { createMCPClient } from "@ai-sdk/mcp";

import type { Tool } from "ai";

let toolsCache: Record<string, Tool> | null = null;

export const exaTools = async (): Promise<Record<string, Tool>> => {
  if (toolsCache) return toolsCache;

  try {
    const mcpClient = await createMCPClient({
      transport: {
        type: "http",
        url: "https://mcp.exa.ai/mcp",
      },
    });

    toolsCache = await mcpClient.tools();
    return toolsCache;
  } catch (error) {
    console.error("Failed to connect to Exa MCP:", error);
    toolsCache = {};
    return toolsCache;
  }
};
