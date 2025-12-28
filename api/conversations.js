import { createClient } from "@supabase/supabase-js";

/**
 * READ-ONLY CRM API
 * ❌ No insert
 * ❌ No update
 * ❌ No delete
 */
export default async function handler(req, res) {
  // Allow only GET
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Supabase connection (SERVER SIDE ONLY)
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Fetch conversations
  const { data, error } = await supabase
    .from("conversations")
    .select("channel, user_id, role, message, created_at")
    .in("channel", ["web", "whatsapp"])
    .order("created_at", { ascending: true });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json(data);
}
