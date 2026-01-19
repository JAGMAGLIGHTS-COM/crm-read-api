// Server.js
// Node HTTP server with WHATWG URL parsing and correct routing for your /api/* handlers.

import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// API handlers (Vercel-style default exports)
import conversationsHandler from "./api/conversations.js";
import dashboardHandler from "./api/dashboard.js";
import customerHandler from "./api/customer.js";
import refreshDataHandler from "./api/refresh-data.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;

// --- helpers ---
function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function readBody(req) {
  return new Promise((resolve) => {
    const method = (req.method || "GET").toUpperCase();
    if (method === "GET" || method === "HEAD") return resolve(null);

    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      if (!chunks.length) return resolve(null);

      const raw = Buffer.concat(chunks).toString("utf8");
      const ct = (req.headers["content-type"] || "").toLowerCase();

      // JSON
      if (ct.includes("application/json")) {
        try {
          return resolve(JSON.parse(raw));
        } catch {
          return resolve(null);
        }
      }

      // urlencoded
      if (ct.includes("application/x-www-form-urlencoded")) {
        const params = new URLSearchParams(raw);
        const obj = {};
        for (const [k, v] of params.entries()) obj[k] = v;
        return resolve(obj);
      }

      // fallback: return raw
      return resolve(raw);
    });
  });
}

async function routeApi(req, res, urlObj) {
  const pathname = urlObj.pathname;

  // attach query object expected by your api/*.js files
  req.query = Object.fromEntries(urlObj.searchParams.entries());

  // attach body expected by refresh-data.js (and others)
  req.body = await readBody(req);

  // minimal response helpers (some handlers already set headers themselves)
  res.json = (payload) => sendJson(res, 200, payload);

  // routing
  if (pathname === "/api/conversations") return conversationsHandler(req, res);
  if (pathname === "/api/dashboard") return dashboardHandler(req, res);
  if (pathname === "/api/customer") return customerHandler(req, res);
  if (pathname === "/api/refresh-data") return refreshDataHandler(req, res);

  return sendJson(res, 404, { error: "Not found" });
}

function serveIndexHtml(res) {
  const indexPath = path.join(__dirname, "index.html");
  try {
    const html = fs.readFileSync(indexPath, "utf8");
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(html);
  } catch (e) {
    sendJson(res, 500, { error: "index.html not found", details: String(e?.message || e) });
  }
}

const server = http.createServer(async (req, res) => {
  setCors(res);

  if ((req.method || "").toUpperCase() === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  // WHATWG URL API (fixes url.parse deprecation warning)
  const urlObj = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  try {
    if (urlObj.pathname.startsWith("/api/")) {
      return await routeApi(req, res, urlObj);
    }

    // Basic app hosting for your single-file frontend
    if (urlObj.pathname === "/" || urlObj.pathname === "/index.html") {
      return serveIndexHtml(res);
    }

    // Optional: serve static assets if you add any later
    return sendJson(res, 404, { error: "Not found" });
  } catch (err) {
    console.error("Server error:", err);
    return sendJson(res, 500, { error: "Internal Server Error", details: String(err?.message || err) });
  }
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
