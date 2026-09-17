import { createMCPClient } from "@ai-sdk/mcp";

import type { Tool } from "ai";

let toolsCache: Record<string, Tool> | null = null;

export const playwrightTools = async (): Promise<Record<string, Tool>> => {
  if (toolsCache) return toolsCache;

  const url = process.env.PLAYWRIGHT_MCP_URL ?? "http://localhost:8931/mcp";
  const token = process.env.PLAYWRIGHT_MCP_TOKEN;

  try {
    const mcpClient = await createMCPClient({
      transport: {
        type: "http",
        url,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      },
    });

    toolsCache = await mcpClient.tools();
    return toolsCache;
  } catch (error) {
    console.error(`Failed to connect to Playwright MCP at ${url}:`, error);
    toolsCache = {};
    return toolsCache;
  }
};
