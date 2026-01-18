import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "./_auth.js";

/**
 * GET /api/conversations
 * Auth: Bearer <token>
 *
 * Query:
 *  - since: ISO timestamp (exclusive): created_at > since (returns ascending)
 *  - limit: number (default 500, max 2000)
 *
 * Returns:
 *  { rows: [...], cursor: { newestCreatedAt } }
 */
export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.setHeader("Cache-Control", "no-store");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = requireAuth(req, res);
  if (!auth) return;

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(500).json({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" });
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const since = url.searchParams.get("since");
  const rawLimit = Number(url.searchParams.get("limit") || 500);
  const limit = Math.min(Math.max(rawLimit, 1), 2000);

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  let q = supabase
    .from("conversations")
    .select("memory_id, channel, user_id, role, message, intent, conversation_state, entities, is_priority, needs_human, created_at");

  if (since) q = q.gt("created_at", since);

  // When doing delta fetch (since), best to return ascending order for easy append
  q = q.order("created_at", { ascending: !!since }).limit(limit);

  const { data, error } = await q;
  if (error) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(500).json({ error: error.message });
  }

  const rows = data || [];
  const newestCreatedAt = rows.length ? rows[rows.length - 1].created_at : since || null;

  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ rows, cursor: { newestCreatedAt } });
}
