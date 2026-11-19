"use strict";

/**
 * publish.js
 * ---------------------------------------------------------------
 * מפרסם את הסרטון שנוצר ב־out/reel.mp4:
 *   1. טלגרם — שליחת הסרטון לערוץ (עובד תמיד, גם בלי אינסטגרם).
 *   2. אינסטגרם — אם מוגדרים IG_USER_ID ו־IG_ACCESS_TOKEN, מפרסם
 *      כריל דרך ה־Graph API. אינסטגרם דורש קובץ בכתובת ציבורית,
 *      לכן ממתינים עד ש־public/videos/<slug>.mp4 נגיש באתר.
 *
 * רק אם לפחות אחד מהם הצליח — מסמן videoPublishedAt על המוצר.
 */

const fs = require("fs");
const path = require("path");
const {initFirebase, markVideoPublished} = require("./product");

const VIDEO_DIR = path.join(__dirname, "..");
const META_FILE = path.join(VIDEO_DIR, "out", "reel.json");
const GRAPH = "https://graph.facebook.com/v21.0";
const SITE_URL = (process.env.SITE_URL || "https://find4u.vercel.app").replace(
  /\/$/,
  ""
);

function loadMeta() {
  if (!fs.existsSync(META_FILE)) {
    throw new Error("out/reel.json is missing — run npm run render first.");
  }
  return JSON.parse(fs.readFileSync(META_FILE, "utf8"));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---- Telegram ----------------------------------------------------------
async function sendTelegram(meta) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHANNEL || "@Find4U_official";
  if (!token) return {ok: false, reason: "TELEGRAM_BOT_TOKEN is missing"};

  const file = path.join(VIDEO_DIR, meta.file);
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append(
    "video",
    new Blob([fs.readFileSync(file)], {type: "video/mp4"}),
    path.basename(file)
  );
  form.append("caption", meta.caption.slice(0, 1024));
  form.append("supports_streaming", "true");

  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendVideo`,
    {method: "POST", body: form}
  );
  const json = await response.json().catch(() => ({}));

  if (!response.ok || !json.ok) {
    return {
      ok: false,
      reason: `Telegram ${response.status}: ${
        json.description || "unknown error"
      }`,
    };
  }

  console.log(`[publish] Telegram: sent to ${chatId}`);
  return {ok: true};
}

// ---- Instagram ---------------------------------------------------------
function igConfigured() {
  return Boolean(process.env.IG_USER_ID && process.env.IG_ACCESS_TOKEN);
}

async function waitForPublicUrl(url, timeoutSeconds) {
  const deadline = Date.now() + timeoutSeconds * 1000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {method: "HEAD"});
      const type = response.headers.get("content-type") || "";
      if (response.ok && (type.includes("video") || type.includes("octet"))) {
        console.log(`[publish] public URL is live: ${url}`);
        return true;
      }
      if (response.ok) {
        // Vercel מגיש קובץ סטטי גם כ־octet-stream; ממשיכים לנסות אבל מתעדים.
        console.log(`[publish] URL answered ${response.status} (${type})`);
        return true;
      }
    } catch (error) {
      // עוד לא באוויר.
    }
    await sleep(15000);
  }
  return false;
}

async function graphPost(endpoint, params) {
  const response = await fetch(`${GRAPH}/${endpoint}`, {
    method: "POST",
    headers: {"Content-Type": "application/x-www-form-urlencoded"},
    body: new URLSearchParams({
      ...params,
      access_token: process.env.IG_ACCESS_TOKEN,
    }).toString(),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.error) {
    throw new Error(
      `Graph ${endpoint}: ${JSON.stringify(json.error || json).slice(0, 400)}`
    );
  }
  return json;
}

async function graphGet(endpoint, params) {
  const query = new URLSearchParams({
    ...params,
    access_token: process.env.IG_ACCESS_TOKEN,
  });
  const response = await fetch(`${GRAPH}/${endpoint}?${query.toString()}`);
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.error) {
    throw new Error(
      `Graph ${endpoint}: ${JSON.stringify(json.error || json).slice(0, 400)}`
    );
  }
  return json;
}

async function publishInstagram(meta) {
  if (!igConfigured()) {
    return {ok: false, reason: "IG_USER_ID / IG_ACCESS_TOKEN are not set"};
  }
  if (process.env.SKIP_INSTAGRAM === "1") {
    return {ok: false, reason: "SKIP_INSTAGRAM=1"};
  }

  const waitSeconds = Number(process.env.PUBLIC_URL_WAIT_SECONDS || 480);
  const ready = await waitForPublicUrl(meta.publicUrl, waitSeconds);
  if (!ready) {
    return {
      ok: false,
      reason: `video not available at ${meta.publicUrl} after ${waitSeconds}s (is the commit pushed and Vercel deployed?)`,
    };
  }

  const container = await graphPost(`${process.env.IG_USER_ID}/media`, {
    media_type: "REELS",
    video_url: meta.publicUrl,
    caption: meta.caption,
    share_to_feed: "true",
    thumb_offset: "0",
  });
  console.log(`[publish] Instagram container: ${container.id}`);

  for (let attempt = 0; attempt < 40; attempt += 1) {
    await sleep(15000);
    const status = await graphGet(container.id, {
      fields: "status_code,status",
    });
    console.log(`[publish] container status: ${status.status_code}`);
    if (status.status_code === "FINISHED") break;
    if (status.status_code === "ERROR") {
      return {
        ok: false,
        reason: `Instagram container error: ${status.status || "unknown"}`,
      };
    }
    if (attempt === 39) {
      return {ok: false, reason: "Instagram container timed out"};
    }
  }

  const published = await graphPost(
    `${process.env.IG_USER_ID}/media_publish`,
    {creation_id: container.id}
  );
  console.log(`[publish] Instagram media: ${published.id}`);

  if (process.env.IG_SHARE_TO_FACEBOOK === "1") {
    console.log("[publish] note: cross-posting to Facebook is enabled in Meta settings");
  }

  return {ok: true, id: published.id};
}

// ---- Main --------------------------------------------------------------
async function main() {
  const meta = loadMeta();
  console.log(`[publish] product: ${meta.productId} | ${meta.productName}`);

  const results = {};
  const channels = [];

  results.telegram = await sendTelegram(meta).catch((error) => ({
    ok: false,
    reason: error.message,
  }));
  if (results.telegram.ok) channels.push("telegram");
  else console.warn(`[publish] Telegram skipped: ${results.telegram.reason}`);

  results.instagram = await publishInstagram(meta).catch((error) => ({
    ok: false,
    reason: error.message,
  }));
  if (results.instagram.ok) channels.push("instagram");
  else console.warn(`[publish] Instagram skipped: ${results.instagram.reason}`);

  if (channels.length === 0) {
    console.error(
      "[publish] nothing was published — the video stays in out/ and the product is not marked."
    );
    process.exit(1);
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const db = initFirebase();
    const ref = db.collection("products").doc(meta.productId);
    await markVideoPublished(
      db,
      {ref},
      {
        file: meta.publicFile,
        url: meta.publicUrl,
        audio: meta.audioSource,
        channels,
      }
    );
    console.log(`[publish] marked ${meta.productId} as videoed (${channels.join(", ")})`);
  } else {
    console.warn("[publish] FIREBASE_SERVICE_ACCOUNT is missing — product not marked.");
  }

  console.log(`[publish] done. site: ${SITE_URL}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[publish] failed:", error.message);
    process.exit(1);
  });
