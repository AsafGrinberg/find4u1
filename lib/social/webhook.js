"use strict";

/**
 * webhook.js — שער אחד לכל הרשתות
 * ---------------------------------------------------------------
 * כל רשת שדוחפת אירועים נכנסת דרך אותו מקום:
 *
 *   /api/social/webhook              → מטא (פייסבוק + אינסטגרם)
 *   /api/social/webhook/youtube      → יוטיוב (WebSub)
 *   /api/social/webhook/tiktok       → טיקטוק (כשתתחבר)
 *   /api/social/webhook/x            → X (כשתתחבר)
 *
 * כל ספק הוא מודול עם שני חלקים:
 *   verify(req, res)             — אימות הכתובת מול הרשת (GET).
 *   receive({raw, headers, ...}) — טיפול באירוע (POST) והחזרת {received, answered}.
 *
 * להוספת רשת חדשה: קובץ ב-lib/social/providers, שורה ב-PROVIDERS, וזה הכל.
 * שאר המערכת (נוסחים, איתור מוצר, רישום תגובות שטופלו) משותפת.
 */

const meta = require("./providers/meta");
const youtube = require("./providers/youtube");
const tiktok = require("./providers/tiktok");
const x = require("./providers/x");

const PROVIDERS = {meta, youtube, tiktok, x};

// שמות נרדפים, כי כל אחד קורא לרשת שלו אחרת.
const ALIASES = {
  facebook: "meta",
  fb: "meta",
  instagram: "meta",
  ig: "meta",
  messenger: "meta",
  youtube: "youtube",
  yt: "youtube",
  tiktok: "tiktok",
  tt: "tiktok",
  x: "x",
  twitter: "x",
};

function providerFor(parts) {
  const list = Array.isArray(parts) ? parts : parts ? [parts] : [];
  const raw = String(list[0] || "meta").toLowerCase();
  const name = ALIASES[raw] || raw;
  return PROVIDERS[name] || null;
}

/** הגוף כמו שהוא — חתימת מטא מחושבת על הבייטים, לא על JSON מפוענח. */
async function readRawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return Buffer.from(req.body, "utf8");
  if (req.body && typeof req.body === "object") {
    return Buffer.from(JSON.stringify(req.body), "utf8");
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function handle(req, res) {
  const provider = providerFor(req.query && req.query.provider);
  if (!provider) {
    return res.status(404).json({ok: false, error: "unknown provider"});
  }

  if (req.method === "GET") {
    try {
      return await provider.verify(req, res);
    } catch (error) {
      console.error(`[webhook] ${provider.name} verify failed: ${error.message}`);
      return res.status(500).json({ok: false, error: "verify failed"});
    }
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ok: false, error: "method not allowed"});
  }

  try {
    const raw = await readRawBody(req);
    const result = await provider.receive({
      raw,
      headers: req.headers,
      query: req.query,
    });
    console.log(
      `[webhook] ${provider.name}: ${result.received} events, ${result.answered} answered`
    );
    return res.status(200).json({ok: true, ...result});
  } catch (error) {
    const status = Number(error.status) || 500;
    console.error(`[webhook] ${provider.name} failed: ${error.message}`);
    return res.status(status).json({ok: false, error: error.message});
  }
}

module.exports = {handle, providerFor, readRawBody, PROVIDERS};
