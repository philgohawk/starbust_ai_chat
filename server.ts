import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // Starburst (Trino) MCP Configuration
  const starburstHost = (process.env.STARBURST_HOST || "philtrail1-bustbankdemo.trino.galaxy.starburst.io").trim();
  const starburstUser = (process.env.STARBURST_USER || "larej93324@isfew.com/accountadmin").trim();
  const starburstPassword = (process.env.STARBURST_PASSWORD || "BustConsulting2026").trim();

  const baseUrl = starburstHost.startsWith('http') ? starburstHost.replace(/\/$/, '') : `https://${starburstHost}`;
  const authHeader = `Basic ${Buffer.from(`${starburstUser}:${starburstPassword}`).toString('base64')}`;

  async function executeMcpQuery(query: string) {
    // The MCP server is available at /mcp per documentation
    const mcpUrl = `${baseUrl}/mcp`;
    
    console.log(`Executing Starburst MCP Query at: ${mcpUrl}`);
    const response = await fetch(mcpUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Starburst MCP Error (${response.status}): ${errorText || response.statusText}`);
    }

    const result = await response.json() as {
      queryId: string;
      columns: Array<{ columnName: string; columnType: string }>;
      rows: Array<Array<any>>;
    };

    // Map rows to objects using column names (MCP uses columnName)
    return result.rows.map(row => {
      const obj: any = {};
      result.columns.forEach((col, index) => {
        obj[col.columnName] = row[index];
      });
      return obj;
    });
  }

  // API route to query Starburst via MCP (NO FALLBACK)
  app.post("/api/query", async (req, res) => {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: "Query is required" });

    try {
      const resultData = await executeMcpQuery(query);
      res.json({ data: resultData });
      console.log(`Query returned ${resultData.length} rows`);
    } catch (error: any) {
      console.error("Starburst MCP Query Error:", error);
      res.status(500).json({ error: error.message || "Failed to query Starburst via MCP" });
    }
  });

  // API route to list catalogs and schemas via MCP
  app.get("/api/schema", async (req, res) => {
    try {
      console.log("Discovering Starburst Schema via MCP...");
      
      const catalogs = await executeMcpQuery("SHOW CATALOGS");
      const catalogNames = catalogs.map(c => Object.values(c)[0] as string);

      const schemaDiscovery = [];
      for (const catalog of catalogNames.slice(0, 3)) {
        try {
          const schemas = await executeMcpQuery(`SHOW SCHEMAS FROM ${catalog}`);
          const schemaNames = schemas.map(s => Object.values(s)[0] as string);
          schemaDiscovery.push({ catalog, schemas: schemaNames.filter(s => s !== 'information_schema') });
        } catch (e) {
          console.warn(`Failed to list schemas for catalog ${catalog}`);
        }
      }

      res.json({ catalogs: catalogNames, discovery: schemaDiscovery });
    } catch (error: any) {
      console.error("Schema Discovery Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
