import { createServer } from "http";

// Import your handlers
import loginHandler from "./login.js";
import conversationsHandler from "./conversations.js";

const server = createServer(async (req, res) => {
  // Base URL required for WHATWG URL parsing
  const base = `http://${req.headers.host || "localhost"}`;
  const url = new URL(req.url || "/", base);
  const pathname = url.pathname;

  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  // Attach parsed URL info (do NOT overwrite req.url)
  req.parsedUrl = url;
  req.query = Object.fromEntries(url.searchParams.entries());

  // Only read body for methods that typically have one
  const shouldReadBody = req.method === "POST" || req.method === "PUT" || req.method === "PATCH";
  if (!shouldReadBody) {
    return routeRequest(req, res, pathname);
  }

  let body = "";
  req.on("data", (chunk) => {
    body += chunk.toString();
    // Optional guard against huge payloads:
    if (body.length > 2_000_000) req.destroy(); // ~2MB
  });

  req.on("end", async () => {
    try {
      req.bodyRaw = body;

      // If JSON, parse it safely (optional; your handlers may not need it)
      const ct = (req.headers["content-type"] || "").toLowerCase();
      if (ct.includes("application/json") && body) {
        try {
          req.body = JSON.parse(body);
        } catch {
          req.body = null;
        }
      } else {
        req.body = body;
      }

      await routeRequest(req, res, pathname);
    } catch (error) {
      console.error("Server error:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
  });
});

async function routeRequest(req, res, pathname) {
  try {
    if (pathname === "/api/login" && req.method === "POST") {
      await loginHandler(req, res);
      return;
    }

    if (pathname === "/api/conversations" && req.method === "GET") {
      await conversationsHandler(req, res);
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  } catch (error) {
    console.error("Route error:", error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Internal server error" }));
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`CRM API server running on port ${PORT}`);
});
