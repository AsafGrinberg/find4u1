"use strict";

/**
 * publish.js
 * ---------------------------------------------------------------
 * מפרסם את הסרטון שנוצר ב־out/reel.mp4 לכל ערוץ שמוגדר בסודות:
 *
 *   Telegram   — TELEGRAM_BOT_TOKEN (+ TELEGRAM_CHANNEL)
 *   Instagram  — IG_USER_ID + IG_ACCESS_TOKEN (ריל דרך Graph API)
 *   Facebook   — FB_PAGE_ID + FB_PAGE_ACCESS_TOKEN (וידאו בדף)
 *   YouTube    — YOUTUBE_CLIENT_ID + YOUTUBE_CLIENT_SECRET + YOUTUBE_REFRESH_TOKEN
 *   TikTok     — TIKTOK_ACCESS_TOKEN (ברירת מחדל: העלאה לתיבה / טיוטה)
 *
 * ערוץ בלי סודות מדולג בלי לשבור את הריצה. רק אם אף ערוץ לא הצליח
 * (או שלא הוגדר אף אחד) — הסרטון נשאר ב־out/ ומועלה כ־artifact.
 *
 * על סאונד ויראלי: אין דרך חוקית להוסיף סאונד מתוך האפליקציה דרך API.
 * טיקטוק במצב inbox מעלה טיוטה, ושם מוסיפים את הסאונד הטרנדי בתוך
 * האפליקציה לפני הפרסום. לאינסטגרם/פייסבוק/יוטיוב אפשר להוסיף שכבת
 * מוזיקה שקטה לקובץ עצמו (REEL_MUSIC_FILE + REEL_MUSIC_VOLUME ב-render).
 */

const fs = require("fs");
const path = require("path");
const {initFirebase, markVideoPublished} = require("./product");

const VIDEO_DIR = path.join(__dirname, "..");
const META_FILE = path.join(VIDEO_DIR, "out", "reel.json");
const REEL_FILE = path.join(VIDEO_DIR, "out", "reel.mp4");
const GRAPH = "https://graph.facebook.com/v21.0";
const GRAPH_VIDEO = "https://graph-video.facebook.com/v21.0";
const TIKTOK = "https://open.tiktokapis.com/v2";
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

// ---- כיתוב ומילות חיפוש -------------------------------------------------
// ההאשטגים נגזרים מהמוצר עצמו ולא מרשימה קבועה, כדי שהפוסט יימצא בחיפוש
// של הפלטפורמה (אינסטגרם וטיקטוק מציגות תוכן לפי האשטג והנושא).
function hashtag(value) {
  const clean = String(value || "")
    .replace(/["'״׳.,!?()\-\/\\]/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join("_");
  return clean ? `#${clean}` : "";
}

function captionWithTags(meta) {
  const tags = [
    "#find4u",
    "#עליאקספרס",
    "#דילים",
    "#מבצעים",
    "#קניות_אונליין",
    "#שופינג_בישראל",
    "#מוצרים_מומלצים",
    hashtag(meta.category),
    hashtag(meta.keyword),
    "#fyp",
    "#foryou",
    "#tiktokshop",
    "#reels",
  ].filter(Boolean);

  const unique = [...new Set(tags)];
  return `${meta.caption}\n\n${unique.join(" ")}`.trim();
}

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

async function publishInstagram(meta, caption) {
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
    caption,
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
  return {ok: true, id: published.id};
}

// ---- Facebook Page -----------------------------------------------------
function fbConfigured() {
  return Boolean(process.env.FB_PAGE_ID && process.env.FB_PAGE_ACCESS_TOKEN);
}

async function publishFacebook(meta, caption) {
  if (!fbConfigured()) {
    return {
      ok: false,
      reason: "FB_PAGE_ID / FB_PAGE_ACCESS_TOKEN are not set",
    };
  }
  if (process.env.SKIP_FACEBOOK === "1") {
    return {ok: false, reason: "SKIP_FACEBOOK=1"};
  }

  const form = new FormData();
  form.append("access_token", process.env.FB_PAGE_ACCESS_TOKEN);
  form.append("description", caption);
  form.append("title", String(meta.productName || "Find4U").slice(0, 100));
  form.append(
    "source",
    new Blob([fs.readFileSync(REEL_FILE)], {type: "video/mp4"}),
    "reel.mp4"
  );

  const response = await fetch(
    `${GRAPH_VIDEO}/${process.env.FB_PAGE_ID}/videos`,
    {method: "POST", body: form}
  );
  const json = await response.json().catch(() => ({}));

  if (!response.ok || json.error) {
    return {
      ok: false,
      reason: `Facebook ${response.status}: ${JSON.stringify(
        json.error || json
      ).slice(0, 400)}`,
    };
  }

  console.log(`[publish] Facebook video: ${json.id}`);
  return {ok: true, id: json.id};
}

// ---- YouTube -----------------------------------------------------------
function youtubeConfigured() {
  return Boolean(
    process.env.YOUTUBE_CLIENT_ID &&
      process.env.YOUTUBE_CLIENT_SECRET &&
      process.env.YOUTUBE_REFRESH_TOKEN
  );
}

async function youtubeAccessToken() {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {"Content-Type": "application/x-www-form-urlencoded"},
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.YOUTUBE_CLIENT_ID,
      client_secret: process.env.YOUTUBE_CLIENT_SECRET,
      refresh_token: process.env.YOUTUBE_REFRESH_TOKEN,
    }).toString(),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.access_token) {
    throw new Error(
      `YouTube token: ${JSON.stringify(json).slice(0, 300)}`
    );
  }
  return json.access_token;
}

async function publishYouTube(meta, caption) {
  if (!youtubeConfigured()) {
    return {
      ok: false,
      reason:
        "YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET / YOUTUBE_REFRESH_TOKEN are not set",
    };
  }
  if (process.env.SKIP_YOUTUBE === "1") {
    return {ok: false, reason: "SKIP_YOUTUBE=1"};
  }

  const token = await youtubeAccessToken();
  const video = fs.readFileSync(REEL_FILE);
  const boundary = `----find4u${Date.now()}`;

  const metadata = {
    snippet: {
      title: String(meta.productName || "Find4U").slice(0, 100),
      description: caption.slice(0, 4900),
      tags: ["Find4U", "עליאקספרס", "דילים", "מוצרים מומלצים"],
      categoryId: "22",
      defaultLanguage: "he",
      defaultAudioLanguage: "he",
    },
    status: {
      privacyStatus: process.env.YOUTUBE_PRIVACY || "public",
      selfDeclaredMadeForKids: false,
    },
  };

  const head = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(
      metadata
    )}\r\n--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`,
    "utf8"
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  const body = Buffer.concat([head, video, tail]);

  const response = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
        "Content-Length": String(body.length),
      },
      body,
    }
  );
  const json = await response.json().catch(() => ({}));

  if (!response.ok || json.error) {
    return {
      ok: false,
      reason: `YouTube ${response.status}: ${JSON.stringify(
        json.error || json
      ).slice(0, 400)}`,
    };
  }

  console.log(`[publish] YouTube video: ${json.id}`);
  return {
    ok: true,
    id: json.id,
    url: json.id ? `https://youtu.be/${json.id}` : undefined,
  };
}

// ---- TikTok ------------------------------------------------------------
function tiktokConfigured() {
  return Boolean(process.env.TIKTOK_ACCESS_TOKEN);
}

// טיקטוק דורש העלאה בחלקים: 5–64MB לכל חלק, והחלק האחרון יכול להיות קטן.
function tiktokChunks(size) {
  const MIN = 5 * 1024 * 1024;
  const MAX = 64 * 1024 * 1024;

  if (size <= MAX) {
    return {chunkSize: size, count: 1};
  }

  let chunkSize = Math.min(MAX, Math.max(MIN, Math.ceil(size / 10)));
  // חייב להתחלק בדיוק, אחרת טיקטוק דוחה את מספר החלקים.
  chunkSize = Math.ceil(chunkSize / 1024) * 1024;
  const count = Math.ceil(size / chunkSize);
  return {chunkSize, count};
}

async function tiktokInitialize(meta, caption) {
  const video = fs.readFileSync(REEL_FILE);
  const size = video.length;
  const {chunkSize, count} = tiktokChunks(size);
  const mode = (process.env.TIKTOK_MODE || "inbox").toLowerCase();

  const sourceInfo = {
    source: "FILE_UPLOAD",
    video_size: size,
    chunk_size: chunkSize,
    total_chunk_count: count,
  };

  const endpoint =
    mode === "direct"
      ? `${TIKTOK}/post/publish/video/init/`
      : `${TIKTOK}/post/publish/inbox/video/init/`;

  const body =
    mode === "direct"
      ? {
          post_info: {
            title: caption.slice(0, 2200),
            privacy_level: process.env.TIKTOK_PRIVACY || "SELF_ONLY",
            disable_comment: false,
            disable_duet: false,
            disable_stitch: false,
            video_cover_timestamp_ms: 1000,
          },
          source_info: sourceInfo,
        }
      : {source_info: sourceInfo};

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.TIKTOK_ACCESS_TOKEN}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));

  if (!response.ok || (json.error && json.error.code !== "ok")) {
    throw new Error(
      `TikTok init ${response.status}: ${JSON.stringify(
        json.error || json
      ).slice(0, 400)}`
    );
  }

  const data = json.data || {};
  const uploadUrl = data.upload_url;
  const publishId = data.publish_id;
  if (!uploadUrl) throw new Error("TikTok init: no upload_url returned");

  for (let index = 0; index < count; index += 1) {
    const start = index * chunkSize;
    const end = Math.min(start + chunkSize, size) - 1;
    const chunk = video.subarray(start, end + 1);

    const put = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(chunk.length),
        "Content-Range": `bytes ${start}-${end}/${size}`,
      },
      body: chunk,
    });

    if (!put.ok) {
      throw new Error(
        `TikTok chunk ${index + 1}/${count}: ${put.status} ${await put
          .text()
          .catch(() => "")}`
      );
    }
  }

  return {publishId, mode};
}

async function tiktokStatus(publishId) {
  const response = await fetch(`${TIKTOK}/post/publish/status/fetch/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.TIKTOK_ACCESS_TOKEN}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({publish_id: publishId}),
  });
  return response.json().catch(() => ({}));
}

async function publishTikTok(meta, caption) {
  if (!tiktokConfigured()) {
    return {ok: false, reason: "TIKTOK_ACCESS_TOKEN is not set"};
  }
  if (process.env.SKIP_TIKTOK === "1") {
    return {ok: false, reason: "SKIP_TIKTOK=1"};
  }

  const {publishId, mode} = await tiktokInitialize(meta, caption);
  console.log(
    `[publish] TikTok ${mode}: publish_id ${publishId || "(none)"} — uploaded ${
      fs.statSync(REEL_FILE).size
    } bytes`
  );

  if (!publishId) {
    return {ok: false, reason: "TikTok did not return publish_id"};
  }

  // בתיבה (inbox) הסרטון ממתין לפתיחה באפליקציה; בסטטוס הוא יהיה
  // PROCESSING/PUBLISHED. לא מכשילים את הריצה על סטטוס שעוד מתעבד.
  let last = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await sleep(6000);
    last = await tiktokStatus(publishId);
    const status = last?.data?.status;
    console.log(`[publish] TikTok status: ${status || "unknown"}`);
    if (status === "PUBLISH_COMPLETE" || status === "SEND_TO_USER_INBOX") {
      return {
        ok: true,
        id: publishId,
        note:
          mode === "inbox"
            ? "draft sent to the TikTok inbox — add the trending sound and publish in the app"
            : undefined,
      };
    }
    if (status === "FAILED") {
      return {
        ok: false,
        reason: `TikTok failed: ${last?.data?.fail_reason || "unknown"}`,
      };
    }
  }

  return {
    ok: false,
    reason: `TikTok status not final: ${JSON.stringify(last).slice(0, 200)}`,
  };
}

// ---- Main --------------------------------------------------------------
async function main() {
  const meta = loadMeta();
  console.log(`[publish] product: ${meta.productId} | ${meta.productName}`);

  const caption = captionWithTags(meta);
  const results = {};
  const channels = [];

  const channelsConfigured = [
    Boolean(process.env.TELEGRAM_BOT_TOKEN),
    igConfigured(),
    fbConfigured(),
    youtubeConfigured(),
    tiktokConfigured(),
  ].filter(Boolean).length;

  if (channelsConfigured === 0) {
    console.warn(
      "[publish] no channel is configured (Telegram / Instagram / Facebook / YouTube / TikTok) — " +
        "the reel was only rendered. Download it from the run artifacts."
    );
    return;
  }

  const run = async (name, fn) => {
    results[name] = await fn().catch((error) => ({
      ok: false,
      reason: error.message,
    }));
    if (results[name].ok) {
      channels.push(name);
      console.log(`[publish] ${name}: ok`);
      if (results[name].url) console.log(`[publish] ${name}: ${results[name].url}`);
      if (results[name].note) console.log(`[publish] ${name}: ${results[name].note}`);
    } else {
      console.warn(`[publish] ${name} skipped: ${results[name].reason}`);
    }
  };

  await run("telegram", () => sendTelegram(meta));
  await run("instagram", () => publishInstagram(meta, caption));
  await run("facebook", () => publishFacebook(meta, caption));
  await run("youtube", () => publishYouTube(meta, caption));
  await run("tiktok", () => publishTikTok(meta, caption));

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
