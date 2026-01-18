import { issueToken } from "./_auth.js";

/**
 * POST /api/login
 * Body: { password: string }
 * Returns: { token }
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const expectedPassword = process.env.CRM_PASSWORD || "2211";

  let body = {};
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
  } catch {
    return res.status(400).json({ error: "Invalid JSON" });
  }

  const password = String(body.password || "");
  if (!password || password !== expectedPassword) {
    return res.status(401).json({ error: "Invalid password" });
  }

  const token = issueToken({ subject: "crm-admin" });

  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ token });
}
