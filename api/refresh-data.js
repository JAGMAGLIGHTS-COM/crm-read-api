// api/refresh-data.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success: false, error: "Method Not Allowed" });
  }

  const CONNECTOR_URL = process.env.JAGMAG_CONNECTOR_URL;
  const ADMIN_SECRET = process.env.JAGMAG_ADMIN_SECRET;

  if (!CONNECTOR_URL || !ADMIN_SECRET) {
    return res.status(500).json({
      success: false,
      error: "Server configuration missing: JAGMAG_CONNECTOR_URL and/or JAGMAG_ADMIN_SECRET",
    });
  }

  // Free plan safe defaults
  const PRODUCT_LIMIT = 2;       // Use 1–3 on Free plan; start at 2
  const PRODUCT_DELAY_MS = 350;  // 300–500ms is typically safe
  const SAFETY_CAP_OFFSET = 2000;
  const ZERO_STREAK_STOP = 3;

  const headers = {
    Authorization: `Bearer ${ADMIN_SECRET}`,
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function callConnector(phaseLabel, url) {
    let upstreamText = "";
    let upstreamJson = null;

    const resp = await fetch(url, { method: "GET", headers });

    // Read body safely (helps debugging even when non-JSON)
    try {
      upstreamText = await resp.text();
      try {
        upstreamJson = upstreamText ? JSON.parse(upstreamText) : null;
      } catch {
        upstreamJson = null;
      }
    } catch {
      upstreamText = "";
      upstreamJson = null;
    }

    if (!resp.ok) {
      const msg =
        (upstreamJson && (upstreamJson.error || upstreamJson.message)) ||
        upstreamText ||
        `HTTP ${resp.status}`;

      const error = `Phase ${phaseLabel} failed: HTTP ${resp.status} | ${msg}`;
      return { ok: false, status: resp.status, error, body: upstreamJson || upstreamText };
    }

    return { ok: true, status: resp.status, body: upstreamJson || upstreamText };
  }

  try {
    // ---------------------------
    // PHASE A — POLICIES (RESET)
    // ---------------------------
    const urlPolicies =
      `${CONNECTOR_URL}/api/connector?admin=update-knowledge` +
      `&kind=policies&offset=0&limit=50&reset=1`;

    const rA = await callConnector("A (policies reset)", urlPolicies);
    if (!rA.ok) {
      return res.status(500).json({
        success: false,
        phase: "Phase A (policies reset)",
        status: rA.status,
        error: rA.error,
        upstream: rA.body,
      });
    }

    const policiesCurated = Number(rA.body?.items_curated ?? 0);

    // --------------
    // PHASE B — PAGES
    // --------------
    const urlPages =
      `${CONNECTOR_URL}/api/connector?admin=update-knowledge` +
      `&kind=pages&offset=0&limit=50`;

    const rB = await callConnector("B (pages)", urlPages);
    if (!rB.ok) {
      return res.status(500).json({
        success: false,
        phase: "Phase B (pages)",
        status: rB.status,
        error: rB.error,
        upstream: rB.body,
      });
    }

    const pagesCurated = Number(rB.body?.items_curated ?? 0);

    // -------------------------
    // PHASE C — PRODUCTS (LOOP)
    // -------------------------
    let offset = 0;
    let zeroStreak = 0;
    let totalProductsCurated = 0;
    let batches = 0;

    while (true) {
      if (offset > SAFETY_CAP_OFFSET) break;

      const urlProducts =
        `${CONNECTOR_URL}/api/connector?admin=update-knowledge` +
        `&kind=products&offset=${offset}&limit=${PRODUCT_LIMIT}`;

      const rC = await callConnector(`C (products) batch offset=${offset}`, urlProducts);
      if (!rC.ok) {
        return res.status(500).json({
          success: false,
          phase: `Phase C (products) batch offset=${offset}`,
          status: rC.status,
          error: rC.error,
          upstream: rC.body,
        });
      }

      const curatedNow = Number(rC.body?.items_curated ?? 0);
      totalProductsCurated += curatedNow;
      batches += 1;

      if (curatedNow === 0) {
        zeroStreak += 1;
      } else {
        zeroStreak = 0;
      }

      if (zeroStreak >= ZERO_STREAK_STOP) break;

      offset += PRODUCT_LIMIT;

      // Free plan stability: small pause to avoid burst + reduce timeout risk
      await sleep(PRODUCT_DELAY_MS);
    }

    return res.status(200).json({
      success: true,
      summary: {
        policies: { items_curated: policiesCurated },
        pages: { items_curated: pagesCurated },
        products: {
          items_curated: totalProductsCurated,
          batches,
          batch_limit: PRODUCT_LIMIT,
          stop_reason:
            offset > SAFETY_CAP_OFFSET
              ? `safety_cap_offset_exceeded (${SAFETY_CAP_OFFSET})`
              : `items_curated=0 for ${ZERO_STREAK_STOP} consecutive batches`,
        },
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: `Unexpected refresh error: ${err?.message || String(err)}`,
    });
  }
}
