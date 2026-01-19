// api/dashboard.js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function startOfDayISO(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString();
}

function daysAgoISO(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function safeNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// Approx: average time between a user message and the next assistant message in the same user_id thread.
function computeAvgResponseTimeMs(rows) {
  // group by user_id
  const byUser = new Map();
  for (const r of rows) {
    const uid = r.user_id || "unknown";
    if (!byUser.has(uid)) byUser.set(uid, []);
    byUser.get(uid).push(r);
  }

  const deltas = [];

  for (const [, msgs] of byUser.entries()) {
    msgs.sort((a, b) => new Date(a.created_at || a.timestamp) - new Date(b.created_at || b.timestamp));

    for (let i = 0; i < msgs.length - 1; i++) {
      const cur = msgs[i];
      const nxt = msgs[i + 1];
      if ((cur.role || "").toLowerCase() === "user" && (nxt.role || "").toLowerCase() !== "user") {
        const t1 = new Date(cur.created_at || cur.timestamp).getTime();
        const t2 = new Date(nxt.created_at || nxt.timestamp).getTime();
        if (Number.isFinite(t1) && Number.isFinite(t2) && t2 >= t1) {
          deltas.push(t2 - t1);
        }
      }
    }
  }

  if (!deltas.length) return 0;
  const sum = deltas.reduce((a, b) => a + b, 0);
  return Math.round(sum / deltas.length);
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.end(JSON.stringify({ error: "Method not allowed" }));
    }

    // 1) Conversations (minimal columns for metrics)
    const { data: rows, error } = await supabase
      .from("conversations")
      .select("user_id, created_at, timestamp, role, channel, intent, is_priority, needs_human");

    if (error) {
      console.error("dashboard conversations error:", error);
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.end(JSON.stringify({ error: "Failed to load conversations" }));
    }

    const all = rows || [];
    const totalMessages = all.length;

    const users = new Set();
    const usersActiveToday = new Set();
    const priorityUsers = new Set();

    const channelCounts = {};
    const intentCounts = {
      product_inquiry: 0,
      order_lookup: 0,
      quote_request: 0,
      support: 0
    };

    const todayStart = new Date(startOfDayISO());
    const sevenDaysAgo = new Date(daysAgoISO(7));

    const firstSeenByUser = new Map();
    const lastSeenByUser = new Map();

    for (const m of all) {
      const uid = m.user_id || "unknown";
      users.add(uid);

      const dt = new Date(m.created_at || m.timestamp || Date.now());
      if (!firstSeenByUser.has(uid) || dt < firstSeenByUser.get(uid)) firstSeenByUser.set(uid, dt);
      if (!lastSeenByUser.has(uid) || dt > lastSeenByUser.get(uid)) lastSeenByUser.set(uid, dt);

      if (dt >= todayStart) usersActiveToday.add(uid);

      if (m.is_priority) priorityUsers.add(uid);
      if (m.needs_human) priorityUsers.add(uid);

      const ch = (m.channel || "unknown").toLowerCase();
      channelCounts[ch] = (channelCounts[ch] || 0) + 1;

      const intent = (m.intent || "").toLowerCase();
      if (intentCounts[intent] !== undefined) intentCounts[intent]++;
    }

    const totalConversations = users.size;

    // "totalCustomers": prefer customer_profiles count if available; fallback to totalConversations
    let totalCustomers = totalConversations;
    {
      const { count, error: cErr } = await supabase
        .from("customer_profiles")
        .select("*", { count: "exact", head: true });
      if (!cErr && typeof count === "number") totalCustomers = count;
    }

    const avgResponseTime = computeAvgResponseTimeMs(all);

    // A pragmatic "success rate": percentage of conversations that have at least 1 assistant message
    let convWithAssistant = 0;
    {
      const byUserHasAssistant = new Map();
      for (const m of all) {
        const uid = m.user_id || "unknown";
        if (!byUserHasAssistant.has(uid)) byUserHasAssistant.set(uid, false);
        if ((m.role || "").toLowerCase() !== "user") byUserHasAssistant.set(uid, true);
      }
      for (const v of byUserHasAssistant.values()) if (v) convWithAssistant++;
    }
    const successRate =
      totalConversations > 0 ? Math.round((convWithAssistant / totalConversations) * 100) : 0;

    // Customers metrics
    let newCustomers7d = 0;
    let returningCustomers = 0;

    for (const [uid, firstSeen] of firstSeenByUser.entries()) {
      const lastSeen = lastSeenByUser.get(uid) || firstSeen;

      if (firstSeen >= sevenDaysAgo) newCustomers7d++;

      // returning: first seen before 7d ago, but active within last 7d
      if (firstSeen < sevenDaysAgo && lastSeen >= sevenDaysAgo) returningCustomers++;
    }

    const avgMessages =
      totalConversations > 0 ? Math.round(totalMessages / totalConversations) : 0;

    // Simple engagement score proxy (0–100)
    const engagementScore = Math.max(0, Math.min(100, avgMessages * 10));

    // 2) Orders metrics (safe fallback if orders table not present)
    const orderTableCandidates = ["customer_orders", "orders_cache", "customer_order_cache"];
    let ordersRows = [];
    for (const table of orderTableCandidates) {
      const { data, error: oErr } = await supabase
        .from(table)
        .select("order_date, order_data");
      if (!oErr) {
        ordersRows = data || [];
        break;
      }
    }

    const totalOrders = ordersRows.length;

    let pendingOrders = 0;
    let recentOrders7d = 0;
    let sumOrderValue = 0;
    let countedValues = 0;

    for (const o of ordersRows) {
      const od = o.order_data || {};
      const status = String(od.status || "").toLowerCase();
      if (status.includes("pending") || status.includes("unfulfilled") || status.includes("open")) {
        pendingOrders++;
      }

      const dt = new Date(o.order_date || Date.now());
      if (dt >= sevenDaysAgo) recentOrders7d++;

      const val = safeNumber(od.total_price, NaN);
      if (Number.isFinite(val)) {
        sumOrderValue += val;
        countedValues++;
      }
    }

    const avgOrderValue = countedValues > 0 ? Math.round(sumOrderValue / countedValues) : 0;

    const payload = {
      overview: {
        totalConversations,
        totalCustomers,
        activeToday: usersActiveToday.size,
        priorityCount: priorityUsers.size,
        avgResponseTime, // ms
        successRate // %
      },
      business: {
        productInquiries: intentCounts.product_inquiry,
        orderLookups: intentCounts.order_lookup,
        quotesRequested: intentCounts.quote_request,
        leadsGenerated: intentCounts.product_inquiry + intentCounts.quote_request
      },
      customers: {
        newCustomers7d,
        returningCustomers,
        avgMessages,
        engagementScore
      },
      orders: {
        totalOrders,
        pendingOrders,
        avgOrderValue,
        recentOrders7d
      },
      // optional extra (not required by your UI, but useful)
      channels: channelCounts
    };

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.end(JSON.stringify(payload));
  } catch (e) {
    console.error("dashboard endpoint error:", e);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.end(JSON.stringify({ error: "Internal server error" }));
  }
}
