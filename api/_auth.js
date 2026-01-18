import crypto from "crypto";

function base64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function jsonB64(obj) {
  return base64url(JSON.stringify(obj));
}

function signHS256(unsigned, secret) {
  return base64url(crypto.createHmac("sha256", secret).update(unsigned).digest());
}

export function issueToken({ subject, ttlSeconds = 12 * 60 * 60 }) {
  const secret = (process.env.CRM_JWT_SECRET || "").trim() || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Missing CRM_JWT_SECRET (or SUPABASE_SERVICE_ROLE_KEY fallback)");

  const now = Math.floor(Date.now() / 1000);

  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    sub: String(subject),
    iat: now,
    exp: now + ttlSeconds,
    iss: "jagmag-crm",
  };

  const unsigned = `${jsonB64(header)}.${jsonB64(payload)}`;
  const sig = signHS256(unsigned, secret);
  return `${unsigned}.${sig}`;
}

export function verifyToken(token) {
  const secret = (process.env.CRM_JWT_SECRET || "").trim() || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) return { ok: false, reason: "missing_secret" };

  const parts = String(token || "").split(".");
  if (parts.length !== 3) return { ok: false, reason: "bad_format" };

  const [h, p, s] = parts;
  const unsigned = `${h}.${p}`;
  const expected = signHS256(unsigned, secret);
  if (expected !== s) return { ok: false, reason: "bad_signature" };

  let payload;
  try {
    const b64 = p.replace(/-/g, "+").replace(/_/g, "/");
    payload = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  } catch {
    return { ok: false, reason: "bad_payload" };
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload?.exp && now > payload.exp) return { ok: false, reason: "expired" };

  return { ok: true, payload };
}

export function requireAuth(req, res) {
  const authHeader = String(req.headers?.authorization || "");
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  const v = verifyToken(token);
  if (!v.ok) {
    res.setHeader("Cache-Control", "no-store");
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return v.payload;
}
