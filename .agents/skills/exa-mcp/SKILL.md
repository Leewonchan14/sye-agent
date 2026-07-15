---
name: exa-mcp
description: Use Exa MCP for real-time web search, web page fetching, code search, and deep research. Triggers on: "search the web", "look up", "research", "find information about", "recent news", "read this URL", "code search", "competitive analysis", "Exa".
---

# Exa MCP Server

Exa MCP connects AI assistants to Exa's search capabilities via the [Model Context Protocol (MCP)](https://modelcontextprotocol.io). It provides real-time web search, web page content fetching, code search, and async agent-based deep research — all without relying on stale training data.

- **Server URL**: `https://mcp.exa.ai/mcp`
- **Repository**: https://github.com/exa-labs/exa-mcp-server
- **Documentation**: https://exa.ai/docs/reference/exa-mcp
- **Free tier** — Remote HTTP setup works immediately with **zero configuration, no API key needed**

## Configuration

### Option A: Remote (HTTP) — ⭐ Recommended (no API key needed)

**No API key required. Works immediately out of the box.** Just add the remote URL.

Add to MCP client config as a remote HTTP server:

```json
{
  "mcpServers": {
    "exa": {
      "type": "http",
      "url": "https://mcp.exa.ai/mcp"
    }
  }
}
```

For Oh My Pi, add to `~/.omp/agent/mcp.json` or project-level `.agent/mcp.json`:

```json
{
  "mcpServers": {
    "exa": {
      "type": "http",
      "url": "https://mcp.exa.ai/mcp",
      "directTools": true
    }
  }
}
```

> **Key point**: Remote HTTP mode is the simplest setup. No API key. No local process. No environment variables. Copy the config and start searching.

### Option B: Local npm (stdio) — requires API key

Only needed if your MCP client doesn't support remote HTTP servers. Requires an API key:

```json
{
  "mcpServers": {
    "exa": {
      "command": "npx",
      "args": ["-y", "exa-mcp-server"],
      "env": {
        "EXA_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

### Option C: Remote bridge (stdio → HTTP) — no API key needed

For MCP clients that don't support remote HTTP servers directly. Uses the same public endpoint, so **no API key needed**:

```json
{
  "mcpServers": {
    "exa": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.exa.ai/mcp"]
    }
  }
}
```

### API Key (optional — only for higher rate limits)

Exa MCP's free tier has rate limits. If you hit them, get an API key from https://dashboard.exa.ai/api-keys to increase limits. This is **optional** — the default Remote HTTP setup works without it.

```json
{
  "mcpServers": {
    "exa": {
      "type": "http",
      "url": "https://mcp.exa.ai/mcp",
      "headers": {
        "x-api-key": "YOUR_EXA_API_KEY"
      }
    }
  }
}
```

## Available Tools

### Default tools (always enabled)

| Tool | Description |
|------|-------------|
| `web_search_exa` | Search the web for any topic. Returns clean, structured results with titles, URLs, and snippets. |
| `web_fetch_exa` | Fetch the full content of a webpage (one or more URLs). Returns clean markdown. |

### Advanced tools (enable via `?tools=` parameter)

Pass tools parameter in the URL:

```
https://mcp.exa.ai/mcp?tools=web_search_exa,web_fetch_exa,web_search_advanced_exa
```

| Tool | Description |
|------|-------------|
| `web_search_advanced_exa` | Advanced search with full control over category filters, domain restrictions, date ranges, highlights, summaries, and subpage crawling. |

### Agent tools (enable via `?tools=agent_tools`)

Authentication required (API key or OAuth — https://auth.exa.ai):

```
https://mcp.exa.ai/mcp?tools=web_search_exa,web_fetch_exa,agent_tools
```

| Tool | Description |
|------|-------------|
| `agent_create_run` | Start an async Exa Agent run for multi-step research. Returns `agent_run_...` ID. |
| `agent_wait_for_run` | Poll a run until terminal status. |
| `agent_get_run_output` | Retrieve completed output (text, structured JSON, grounding citations). |
| `agent_cancel_run` | Cancel a queued or running run. |

## Usage Patterns

### Quick web search

Search for current information, news, documentation, or facts:

```
Search the web for recent developments in AI agent frameworks.
```

### Fetch and read a page

Get full content from a URL as clean markdown:

```
Fetch and summarize https://example.com/blog/article
```

### Advanced search with filters

For precise control over date range, domains, categories:

```
Find Python code examples for OAuth 2.0 published on GitHub in the last 6 months.
```

### Deep research (Exa Agent)

For multi-step, async research requiring structured output:

```
Research the competitive landscape for AI coding assistants.
```

The Agent tools work asynchronously:
1. `agent_create_run` — create a run with a query and optional `outputSchema`
2. `agent_wait_for_run` — poll until `completed`, `failed`, or `cancelled`
3. `agent_get_run_output` — retrieve results with text, structured data, and grounding citations
4. Use `previousRunId` to continue/refine a completed run

### Search categories

Exa supports these search categories for `web_search_advanced_exa`:
- `general` — default web search
- `news` — news articles
- `code` — code repositories (GitHub, Stack Overflow, etc.)
- `company` — company information
- `research_paper` — academic papers (arXiv, Semantic Scholar)
- `linkedin` — LinkedIn profiles and posts
- `people` — people search
- `tweet` — social media posts (X/Twitter)
- `pdf` — PDF documents

## Important Notes

- **Real-time data**: Exa searches live web content, not the model's training data — use for recent events, current prices, latest docs.
- **Rate limits**: Free plan has rate limits. Add an API key for higher limits.
- **Content fetching**: `web_fetch_exa` converts web pages to clean markdown — ideal for RAG, summarization, and content extraction.
- **Code search**: Use `category: "code"` in advanced search to find working code examples from GitHub and Stack Overflow.
- **No hallucinated URLs**: Unlike the model guessing URLs, Exa returns real, verified web results.
