import { createMCPClient } from "@ai-sdk/mcp";

import type { Tool } from "ai";

let toolsCache: Record<string, Tool> | null = null;

export const sandboxTools = async (): Promise<Record<string, Tool>> => {
  if (toolsCache) return toolsCache;

  const url = process.env.SANDBOX_MCP_URL;
  const token = process.env.SANDBOX_MCP_TOKEN;

  // 샌드박스 서버는 원격 전용이라 URL이 없으면 도구를 붙이지 않는다.
  if (!url) {
    toolsCache = {};
    return toolsCache;
  }

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
    console.error(`Failed to connect to Sandbox MCP at ${url}:`, error);
    toolsCache = {};
    return toolsCache;
  }
};
