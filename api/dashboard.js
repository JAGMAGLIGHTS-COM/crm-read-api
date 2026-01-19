// api/dashboard.js
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

    // Minimal, safe dashboard query: count recent conversations
    const { data, error } = await supabase
      .from("conversations")
      .select("id", { count: "exact", head: true });

    if (error) {
      return res.status(500).json({ error: error.message, details: error });
    }

    return res.status(200).json({
      totals: {
        conversations: data ?? null,
      },
    });
  } catch (err) {
    return res.status(500).json({
      error: `Unexpected server error: ${err?.message || String(err)}`,
    });
  }
}
