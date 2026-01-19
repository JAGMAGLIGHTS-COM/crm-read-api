// api/conversations.js
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SERVICE_KEY) {
      return res.status(500).json({
        error: "Database configuration missing: SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY",
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const limit = Math.min(parseInt(req.query.limit || "50", 10) || 50, 200);
    const channel = req.query.channel || null;
    const user_id = req.query.user_id || null;
    const memory_id = req.query.memory_id || null;

    let q = supabase
      .from("conversations")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (channel) q = q.eq("channel", channel);
    if (user_id) q = q.eq("user_id", user_id);
    if (memory_id) q = q.eq("memory_id", memory_id);

    const { data, error } = await q;

    if (error) {
      return res.status(500).json({ error: error.message, details: error });
    }

    return res.status(200).json({ rows: data || [] });
  } catch (err) {
    return res.status(500).json({
      error: `Unexpected server error: ${err?.message || String(err)}`,
    });
  }
}
