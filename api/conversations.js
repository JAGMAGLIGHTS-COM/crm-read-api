import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "./_auth.js";

/**
 * GET /api/conversations
 * Auth: Bearer <token>
 * Query params:
 *  - since: ISO timestamp (exclusive) -> created_at > since (ordered ascending)
 *  - before: ISO timestamp (exclusive) -> created_at < before
 *  - limit: number (default 500, max 2000)
 *  - order: asc|desc (default desc when no `since`, else asc)
 *  - user_id: filter
 *  - channel: filter
 *
 * Returns:
 *  { rows: [...], cursor: { newestCreatedAt, oldestCreatedAt } }
 */
export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = requireAuth(req, res);
  if (!auth) return;

  const url = new URL(req.url, `http://${req.headers.host}`);
  const since = url.searchParams.get("since");
  const before = url.searchParams.get("before");
  const userId = url.searchParams.get("user_id");
  const channel = url.searchParams.get("channel");

  const rawLimit = Number(url.searchParams.get("limit") || 500);
  const limit = Math.min(Math.max(rawLimit, 1), 2000);

  const orderParam = (url.searchParams.get("order") || (since ? "asc" : "desc")).toLowerCase();
  const ascending = orderParam === "asc";

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  let q = supabase
    .from("conversations")
    .select(
      "memory_id, channel, user_id, role, message, intent, conversation_state, entities, is_priority, needs_human, created_at",
      { count: "exact" }
    );

  if (userId) q = q.eq("user_id", userId);
  if (channel) q = q.eq("channel", channel);
  if (since) q = q.gt("created_at", since);
  if (before) q = q.lt("created_at", before);

  q = q.order("created_at", { ascending }).limit(limit);

  const { data, error } = await q;
  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const rows = data || [];
  const newestCreatedAt = rows.length ? rows[rows.length - 1].created_at : null;
  const oldestCreatedAt = rows.length ? rows[0].created_at : null;

  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    rows,
    cursor: { newestCreatedAt, oldestCreatedAt },
  });
}
