import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

// Starburst Galaxy MCP: https://<account>.mcp.galaxy.starburst.io
// Per https://docs.starburst.io/starburst-galaxy/starburst-ai/mcp-server.html
function getMcpConfig() {
  const account = (process.env.STARBURST_ACCOUNT || "").trim();
  const user = (process.env.STARBURST_USER || "").trim();
  const password = (process.env.STARBURST_PASSWORD || "").trim();

  let baseUrl: string;
  if (process.env.STARBURST_MCP_URL) {
    baseUrl = process.env.STARBURST_MCP_URL.replace(/\/$/, "");
    if (!baseUrl.startsWith("http")) baseUrl = `https://${baseUrl}`;
  } else if (account) {
    const host = account.includes(".") ? account : `${account}.mcp.galaxy.starburst.io`;
    baseUrl = host.startsWith("http") ? host : `https://${host}`;
  } else {
    throw new Error("Set STARBURST_ACCOUNT or STARBURST_MCP_URL in .env");
  }

  const authHeader = user && password
    ? `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`
    : "";

  // #region agent log
  fetch('http://127.0.0.1:7330/ingest/49e5c910-e73f-417a-ab4e-7ad9dac9d8b7',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bd9b50'},body:JSON.stringify({sessionId:'bd9b50',location:'server.ts:getMcpConfig',message:'MCP config',data:{baseUrl,hasMcpUrl:!!process.env.STARBURST_MCP_URL,accountRaw:(process.env.STARBURST_ACCOUNT||'').slice(0,60)},timestamp:Date.now(),hypothesisId:'B,C'})}).catch(()=>{});
  // #endregion

  return { baseUrl, authHeader };
}

async function executeMcpQuery(query: string): Promise<{ columns: Array<{ columnName: string; columnType: string }>; rows: unknown[][] }> {
  const { baseUrl, authHeader } = getMcpConfig();
  // Galaxy MCP may be unavailable; use Trino /v1/statement API as fallback.
  // https://trino.io/docs/current/develop/client-protocol.html
  let trinoBase = baseUrl;
  if (baseUrl.includes(".mcp.galaxy.starburst.io")) {
    trinoBase = baseUrl.replace(".mcp.galaxy.starburst.io", ".trino.galaxy.starburst.io");
  }
  const url = `${trinoBase.replace(/\/$/, "")}/v1/statement`;

  // #region agent log
  fetch('http://127.0.0.1:7330/ingest/49e5c910-e73f-417a-ab4e-7ad9dac9d8b7',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bd9b50'},body:JSON.stringify({sessionId:'bd9b50',location:'server.ts:executeMcpQuery:pre',message:'Trino request',data:{url,trinoBase,queryPreview:query.slice(0,60)},timestamp:Date.now(),hypothesisId:'F'})}).catch(()=>{});
  // #endregion

  const trinoUser = (process.env.STARBURST_USER || "").trim() || "anonymous";
  const headers: Record<string, string> = {
    "X-Trino-User": trinoUser,
    "X-Trino-Source": "starburst-ai-chat",
  };
  if (authHeader) headers["Authorization"] = authHeader;

  let res = await fetch(url, {
    method: "POST",
    headers,
    body: query,
  });

  let resText = await res.text();

  // #region agent log
  fetch('http://127.0.0.1:7330/ingest/49e5c910-e73f-417a-ab4e-7ad9dac9d8b7',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bd9b50'},body:JSON.stringify({sessionId:'bd9b50',location:'server.ts:executeMcpQuery:post',message:'Trino response',data:{status:res.status,bodyPreview:resText.slice(0,300),url},timestamp:Date.now(),hypothesisId:'F'})}).catch(()=>{});
  // #endregion

  if (!res.ok) {
    throw new Error(`Starburst/Trino error (${res.status}): ${resText || res.statusText}`);
  }

  const allRows: unknown[][] = [];
  let columns: Array<{ name?: string; type?: string }> = [];

  while (true) {
    const data = JSON.parse(resText) as {
      nextUri?: string;
      columns?: Array<{ name?: string; type?: string }>;
      data?: unknown[][];
      error?: { message?: string };
    };

    if (data.error) {
      throw new Error(data.error.message || "Query failed");
    }
    if (data.columns) columns = data.columns;
    if (data.data) allRows.push(...data.data);

    if (!data.nextUri) break;

    const nextHeaders: Record<string, string> = {};
    if (authHeader) nextHeaders["Authorization"] = authHeader;
    const nextRes = await fetch(data.nextUri, { method: "GET", headers: nextHeaders });
    resText = await nextRes.text();
    res = nextRes;
    if (!res.ok) {
      throw new Error(`Trino nextUri error (${res.status}): ${resText}`);
    }
  }

  return {
    columns: columns.map((c) => ({ columnName: c.name ?? "", columnType: c.type ?? "" })),
    rows: allRows,
  };
}

function rowsToObjects(
  columns: Array<{ columnName: string }>,
  rows: unknown[][]
): Record<string, unknown>[] {
  return rows.map((row) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      obj[col.columnName] = row[i];
    });
    return obj;
  });
}

async function getSchemaContext(): Promise<string> {
  try {
    const catalogsRes = await executeMcpQuery("SHOW CATALOGS");
    const catalogs = rowsToObjects(catalogsRes.columns, catalogsRes.rows);
    const catalogNames = catalogs.map((c) => Object.values(c)[0] as string).filter(Boolean);

    const parts: string[] = [`Catalogs: ${catalogNames.join(", ")}`];
    const allTables: { catalog: string; schema: string; table: string }[] = [];

    for (const cat of catalogNames.slice(0, 5)) {
      try {
        const schemasRes = await executeMcpQuery(`SHOW SCHEMAS FROM ${cat}`);
        const schemas = rowsToObjects(schemasRes.columns, schemasRes.rows);
        const schemaNames = schemas
          .map((s) => Object.values(s)[0] as string)
          .filter((n) => n && n !== "information_schema");
        parts.push(`  ${cat}: schemas ${schemaNames.slice(0, 8).join(", ")}${schemaNames.length > 8 ? "..." : ""}`);

        for (const schema of schemaNames.slice(0, 4)) {
          try {
            const tablesRes = await executeMcpQuery(`SHOW TABLES FROM ${cat}.${schema}`);
            const tables = rowsToObjects(tablesRes.columns, tablesRes.rows);
            for (const t of tables) {
              const name = String(Object.values(t)[0] ?? "");
              if (name) allTables.push({ catalog: cat, schema, table: name });
            }
          } catch { /* skip */ }
        }
      } catch {
        parts.push(`  ${cat}: (could not list schemas)`);
      }
    }

    if (allTables.length > 0) {
      const bySchema = new Map<string, string[]>();
      for (const t of allTables) {
        const key = `${t.catalog}.${t.schema}`;
        if (!bySchema.has(key)) bySchema.set(key, []);
        bySchema.get(key)!.push(t.table);
      }
      parts.push("\nAvailable tables (use fully qualified names like catalog.schema.table):");
      for (const [key, tbls] of bySchema) {
        parts.push(`  ${key}: ${tbls.slice(0, 15).join(", ")}${tbls.length > 15 ? "..." : ""}`);
      }
    }
    return parts.join("\n");
  } catch {
    return "Schema discovery failed. Use SHOW CATALOGS, SHOW SCHEMAS FROM <catalog>, SHOW TABLES FROM <catalog>.<schema> to explore.";
  }
}

function extractSql(text: string): string | null {
  let sql: string | null = null;
  const block = text.match(/```(?:sql)?\s*([\s\S]*?)```/i);
  if (block) {
    sql = block[1].trim();
  } else {
    const sqlMatch = text.match(/^(SELECT|SHOW|EXPLAIN)\s[\s\S]+$/im);
    if (sqlMatch) sql = sqlMatch[0].trim();
  }
  if (sql) {
    sql = sql.replace(/;\s*$/, "");
  }
  return sql;
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(cors());
  app.use(express.json());

  const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

  app.post("/api/chat", async (req, res) => {
    const { message, history } = req.body as {
      message?: string;
      history?: Array<{ role: "user" | "assistant"; content: string }>;
    };
    if (!message?.trim()) {
      return res.status(400).json({ error: "message is required" });
    }

    try {
      const schemaContext = await getSchemaContext();
      const historyText = (history ?? [])
        .slice(-6)
        .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
        .join("\n\n");
      const prompt = `You are a data analyst assistant for Starburst/Trino. Your job is to understand what the user wants to know about their data, find the appropriate table from the schema context, and write a SQL query to answer their question.

IMPORTANT: First understand the user's INTENT, then find the RIGHT TABLE, then write the query.

AVAILABLE DATA (use ONLY these tables—they are fully qualified as catalog.schema.table):
${schemaContext}

INSTRUCTIONS:
1. UNDERSTAND what the user is asking (e.g., "how many customers" = COUNT query on a customer table)
2. FIND the right table from the schema above (e.g., if user asks about "customers", look for a table with "customer" in the name)
3. WRITE a valid Trino SQL query using fully qualified table names (catalog.schema.table)

RULES:
- Put SQL in a \`\`\`sql code block
- Use ONLY tables listed above. Do NOT invent table names like "sample.burstbank.customers"
- Common tables: "customer" for customers, "orders" for orders, "nation" for countries, etc.
- If user asks "how many X", use SELECT COUNT(*) FROM ...
- If user asks "show me X" or "list X", use SELECT * FROM ... LIMIT 10
- Use LIMIT when appropriate (max ~100KB results)
- If no matching table exists, say so clearly instead of guessing

${historyText ? `Previous conversation:\n${historyText}\n\n` : ""}User: ${message}

Assistant:`;

      const response = await genai.models.generateContent({
        model: "gemini-3.1-flash-lite-preview",
        contents: prompt,
      });

      const fullText = response.text ?? "";

      const sql = extractSql(fullText);
      let data: Record<string, unknown>[] = [];
      let queryError: string | null = null;

      if (sql) {
        try {
          const result = await executeMcpQuery(sql);
          data = rowsToObjects(result.columns, result.rows);
          console.log(`MCP query returned ${data.length} rows`);
        } catch (err) {
          queryError = err instanceof Error ? err.message : "Query failed";
          console.error("MCP query error:", queryError);
        }
      }

      res.json({
        text: fullText,
        sql: sql ?? undefined,
        data: data.length > 0 ? data : undefined,
        error: queryError ?? undefined,
      });
    } catch (err) {
      console.error("Chat error:", err);
      res.status(500).json({
        error: err instanceof Error ? err.message : "Chat failed",
      });
    }
  });

  app.post("/api/query", async (req, res) => {
    const { query } = req.body;
    if (!query?.trim()) return res.status(400).json({ error: "query is required" });

    try {
      const result = await executeMcpQuery(query);
      const data = rowsToObjects(result.columns, result.rows);
      res.json({ data });
    } catch (err) {
      console.error("Query error:", err);
      res.status(500).json({
        error: err instanceof Error ? err.message : "Query failed",
      });
    }
  });

  app.get("/api/schema", async (_req, res) => {
    try {
      const catalogsRes = await executeMcpQuery("SHOW CATALOGS");
      const catalogs = rowsToObjects(catalogsRes.columns, catalogsRes.rows);
      const catalogNames = catalogs.map((c) => Object.values(c)[0] as string).filter(Boolean);

      const discovery: { catalog: string; schemas: string[] }[] = [];
      for (const cat of catalogNames.slice(0, 5)) {
        try {
          const schemasRes = await executeMcpQuery(`SHOW SCHEMAS FROM ${cat}`);
          const schemas = rowsToObjects(schemasRes.columns, schemasRes.rows);
          discovery.push({
            catalog: cat,
            schemas: schemas
              .map((s) => Object.values(s)[0] as string)
              .filter((n) => n && n !== "information_schema"),
          });
        } catch {
          discovery.push({ catalog: cat, schemas: [] });
        }
      }

      res.json({ catalogs: catalogNames, discovery });
    } catch (err) {
      console.error("Schema error:", err);
      res.status(500).json({
        error: err instanceof Error ? err.message : "Schema discovery failed",
      });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
