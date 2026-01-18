import { issueToken } from "./_auth.js";

/**
 * POST /api/login
 * Accepts:
 * - JSON: { "password": "..." }
 * - Form: password=...
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.setHeader("Cache-Control", "no-store");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // IMPORTANT: trim env password to avoid whitespace/newline issues in Vercel UI
  const expectedPassword = String(process.env.CRM_PASSWORD ?? "2211").trim();

  const contentType = String(req.headers["content-type"] || "").toLowerCase();
  let provided = "";

  try {
    if (contentType.includes("application/json")) {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
      provided = String(body.password || "");
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      const raw = typeof req.body === "string" ? req.body : "";
      const params = new URLSearchParams(raw);
      provided = String(params.get("password") || "");
    } else {
      // Fallback for Vercel parsing variations
      if (req.body && typeof req.body === "object") {
        provided = String(req.body.password || "");
      } else if (typeof req.body === "string") {
        try {
          const parsed = JSON.parse(req.body);
          provided = String(parsed.password || "");
        } catch {
          provided = req.body;
        }
      }
    }
  } catch {
    res.setHeader("Cache-Control", "no-store");
    return res.status(400).json({ error: "Invalid request body" });
  }

  provided = String(provided).trim();

  if (!provided || provided !== expectedPassword) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(401).json({
      error: "Invalid password",
      hint: "Check Vercel env var CRM_PASSWORD is set for the same environment (Preview vs Production) AND redeployed.",
    });
  }

  const token = issueToken({ subject: "crm-admin" });

  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ token });
}
