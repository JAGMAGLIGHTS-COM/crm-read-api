// api/customer.js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.end(JSON.stringify({ error: "Method not allowed" }));
    }

    const profileKey =
      (req.query && req.query.profile_key) ||
      (req.query && req.query.user_id) ||
      null;

    if (!profileKey) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.end(JSON.stringify({ error: "Missing profile_key" }));
    }

    // 1) Profile
    const { data: profile, error: profileError } = await supabase
      .from("customer_profiles")
      .select("*")
      .eq("profile_key", profileKey)
      .maybeSingle();

    if (profileError) {
      console.error("customer profile fetch error:", profileError);
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.end(JSON.stringify({ error: "Failed to load customer profile" }));
    }

    // 2) Orders (try common table names; return [] if none exist)
    const orderTableCandidates = ["customer_orders", "orders_cache", "customer_order_cache"];
    let orders = [];
    let lastOrdersError = null;

    for (const table of orderTableCandidates) {
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .eq("profile_key", profileKey)
        .order("order_date", { ascending: false });

      if (!error) {
        orders = data || [];
        lastOrdersError = null;
        break;
      }
      lastOrdersError = error;
    }

    // If none worked, keep orders empty (don’t fail the whole endpoint)
    if (lastOrdersError) {
      console.warn("orders table lookup failed (non-fatal):", lastOrdersError?.message || lastOrdersError);
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.end(JSON.stringify({ profile: profile || null, orders }));
  } catch (e) {
    console.error("customer endpoint error:", e);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.end(JSON.stringify({ error: "Internal server error" }));
  }
}
