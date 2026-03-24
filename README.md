# Starburst Data Explorer

A chatbot that lets you explore data in your Starburst Galaxy environment using natural language. Built with **Google Gemini** as the LLM and **Starburst MCP Server** for query execution, following [Starburst MCP best practices](https://docs.starburst.io/starburst-galaxy/starburst-ai/mcp-server.html).

## Features

- **Natural language → SQL**: Ask questions in plain English; Gemini generates Trino/Starburst SQL
- **Read-only queries**: Only `SELECT`, `SHOW`, and `EXPLAIN` (per MCP limits)
- **Schema-aware**: Automatically discovers catalogs and schemas for context
- **Result tables**: View query results in the chat

## Prerequisites

- Node.js 20+
- [Starburst Galaxy](https://docs.starburst.io/starburst-galaxy/get-started/learn/sign-up.html) account (Mission Critical, Enterprise, or free trial)
- [Google Gemini API key](https://aistudio.google.com/apikey)

## Setup

1. **Clone and install**

   ```bash
   npm install
   ```

2. **Configure environment**

   Copy `.env.example` to `.env` and fill in:

   ```bash
   cp .env.example .env
   ```

   | Variable | Description |
   |----------|-------------|
   | `STARBURST_ACCOUNT` | Your Galaxy account name (e.g. `philtrail1-bustbankdemo`) for `https://<account>.mcp.galaxy.starburst.io` |
   | `STARBURST_MCP_URL` | Optional: full MCP URL (overrides `STARBURST_ACCOUNT`) |
   | `STARBURST_USER` | Galaxy email or service account email |
   | `STARBURST_PASSWORD` | Galaxy password |
   | `GEMINI_API_KEY` | API key from [Google AI Studio](https://aistudio.google.com/apikey) |

3. **Run**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Architecture

- **Frontend**: React + Vite + Tailwind CSS
- **Backend**: Express server that:
  - Proxies chat to Gemini (natural language → SQL)
  - Executes SQL via Starburst MCP HTTP endpoint
  - Performs schema discovery for LLM context

## MCP Best Practices

- **Authentication**: Basic auth (user/password) for dev; use [OAuth clients](https://docs.starburst.io/starburst-galaxy/security-and-compliance/manage-galaxy-access/setup-oauth-clients.html) with `galaxy.mcp` scope in production
- **Result size**: Galaxy MCP limits results to 100KB; queries use `LIMIT` when appropriate
- **Read-only**: Only `SELECT`, `SHOW`, `EXPLAIN` allowed

## License

MIT
