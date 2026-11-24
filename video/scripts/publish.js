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
const {shortenUrl} = require("./short");
// חתימת הרשתות ופרסום לפייסבוק יושבים ב-functions/, כי אותם פוסטים עולים
// גם מהפייפליין של טלגרם — כדי שכל הרשתות ייראו אותו דבר.
const socials = require("../../functions/socials");
const facebookPage = require("../../functions/facebook");

const VIDEO_DIR = path.join(__dirname, "..");
const META_FILE = path.join(VIDEO_DIR, "out", "reel.json");
const REEL_FILE = path.join(VIDEO_DIR, "out", "reel.mp4");
const YT_API = "https://www.googleapis.com/youtube/v3";
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

function hashtags(meta) {
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

  return [...new Set(tags)].join(" ");
}

// הפוסט עצמו (מהתסריט) בלי שורת ההאשטגים שבסופו — כדי שאפשר להוסיף פרטי
// מוצר, קישורים וחתימת רשתות לפני ההאשטגים ולא אחריהם.
function captionBody(meta) {
  const lines = String(meta.caption || "")
    .trim()
    .split("\n");
  while (lines.length > 0 && /^\s*#/.test(lines[lines.length - 1])) {
    lines.pop();
  }
  return lines.join("\n").trim();
}

// מחיר, הנחה, קישור לרכישה וקישור לדף המוצר — אותם פרטים בכל רשת.
// prices: false כשהתוכן עצמו כבר כולל את המחיר וההנחה (אינסטגרם/פייסבוק),
// כדי שלא יופיעו פעמיים.
function productDetails(meta, links, options = {}) {
  const price = shekels(meta.price);
  const original = shekels(meta.originalPrice);
  const discount = Math.round(Number(meta.discount) || 0);
  const withPrices = options.prices !== false;
  const lines = [];

  if (withPrices && price) {
    lines.push(
      original && Number(meta.originalPrice) > Number(meta.price)
        ? `🟡 ${price} במקום ${original}`
        : `🟡 ${price}`
    );
  }
  if (withPrices && discount > 0) lines.push(`📉 ${discount}% הנחה`);
  if (links.affiliate) lines.push(`🛒 לרכישה: ${links.affiliate}`);
  if (links.site) lines.push(`🔗 דף המוצר באתר Find4U: ${links.site}`);

  return lines.join("\n");
}

// כיתוב לאינסטגרם/פייסבוק: התוכן של הריל + כל פרטי המוצר + חתימת
// הרשתות (בלי הרשת שעליה מפרסמים) + ההאשטגים בסוף.
function networkCaption(meta, links, options = {}) {
  return [
    captionBody(meta),
    productDetails(meta, links, {prices: false}),
    options.note,
    options.signature,
    hashtags(meta),
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function shekels(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return `${number.toLocaleString("he-IL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ₪`;
}

function siteProductUrl(meta) {
  const slug = meta.slug || meta.productId;
  return slug ? `${SITE_URL}/product/${encodeURIComponent(slug)}` : null;
}

// קישור השותפים הארוך (s.click.aliexpress.com/...) נשבר לשורות ולא באמת
// ניתן ללחיצה. משתמשים בגרסה מקוצרת בכל מקום שבו הקישור מוצג: טלגרם,
// תיאור הסרטון ביוטיוב, והתגובות.
async function shortLinks(meta) {
  return {
    affiliate: await shortenUrl(meta.link || ""),
    site: await shortenUrl(siteProductUrl(meta) || ""),
  };
}

// ---- Telegram ----------------------------------------------------------
// בטלגרם אין תגובות עם לינק אוטומטי כמו באינסטגרם, וההאשטגים של טיקטוק
// מיותרים שם. לכן הפוסט עצמו נושא את המוצר, המחיר ושני הקישורים הקצרים.
function telegramCaption(meta, links, signature) {
  const price = shekels(meta.price);
  const original = shekels(meta.originalPrice);
  const discount = Math.round(Number(meta.discount) || 0);
  const lines = [`🛍️ ${meta.productName || "מוצר מ-Find4U"}`];

  if (price) {
    lines.push(
      original && Number(meta.originalPrice) > Number(meta.price)
        ? `💰 ${price} במקום ${original}`
        : `💰 ${price} בלבד`
    );
  }
  if (discount > 0) lines.push(`🔥 ${discount}% הנחה`);

  if (links.affiliate) {
    lines.push("", "🛒 לרכישה מאליאקספרס:", links.affiliate);
  }
  if (links.site) {
    lines.push("", "🔗 לדף המוצר באתר Find4U:", links.site);
  }

  if (signature) lines.push("", signature);

  return lines.join("\n").trim();
}

// ביוטיוב שורטס הלינקים בתיאור ובתגובות אינם לחיצים — זו מדיניות של יוטיוב
// מאז 2023, ואין קיצור או ניסוח שמשנה אותה. לכן התיאור לא מבטיח לחיצה:
// הוא מרכז את הכתובת של האתר (שאפשר להקליד) ומפנה ללינק הקבוע שנמצא
// בדף הערוץ, שם הלינקים כן לחיצים. הלינקים עצמם נשארים כאן כדי שאפשר
// יהיה להעתיק אותם.
function youtubeDescription(caption, links, signature) {
  const domain = SITE_URL.replace(/^https?:\/\//, "");
  const lines = [caption, ""];
  lines.push(`🌐 כל המוצרים והסרטונים: ${domain}`);
  lines.push("🔗 הקישורים הלחיצים מרוכזים בדף הערוץ (Links).");
  lines.push("📍 כל המידע והמחירים של המוצר אפשר למצוא בדף המוצר באתר.");

  const details = [
    links.affiliate ? `🛒 לרכישה מאליאקספרס (להעתקה):\n${links.affiliate}` : "",
    links.site ? `🔗 דף המוצר באתר Find4U (להעתקה):\n${links.site}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  if (details) lines.push("", details);
  if (signature) lines.push("", signature);
  return lines.join("\n").trim();
}

async function sendTelegram(meta, links, signature) {
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
  // אין חיתוך ל-1024 תווים: הכיתוב נבנה קצר (הקישורים מקוצרים), וחיתוך
  // באמצע תגית HTML גורם לטלגרם לדחות את כל הפוסט.
  form.append("caption", telegramCaption(meta, links, signature));
  if (signature) form.append("parse_mode", "HTML");
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
  // מזהי ההודעות נשמרים ליד המוצר, כדי שאפשר יהיה לערוך או למחוק את
  // הפוסט אם המוצר יירד מהחנות.
  return {ok: true, messageId: json.result?.message_id || null};
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
  if (!facebookPage.configured()) {
    return {
      ok: false,
      reason: "FB_PAGE_ID / FB_PAGE_ACCESS_TOKEN are not set",
    };
  }
  if (process.env.SKIP_FACEBOOK === "1") {
    return {ok: false, reason: "SKIP_FACEBOOK=1"};
  }

  const video = await facebookPage.publishVideo({
    file: REEL_FILE,
    description: caption,
    title: meta.productName || "Find4U",
  });
  if (!video.ok) return video;

  // תגובה ראשונה של הדף לפוסט — שוב כל הפרטים והלינקים, כדי שגם מי
  // שפותח את התגובות מקבל אותם.
  let commentId = null;
  try {
    commentId = await facebookPage.commentOn(video.id, caption);
    await facebookPage.tryPinComment(commentId);
  } catch (error) {
    console.warn(`[publish] Facebook first comment failed: ${error.message}`);
  }

  return {ok: true, id: video.id, commentId, url: video.url};
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

async function publishYouTube(meta, caption, links, signature) {
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
      description: youtubeDescription(caption, links, signature).slice(0, 4900),
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

// תגובה ראשונה מתחת לסרטון, עם הלינק לרכישה. היא נשמרת ב-videoLinks כדי
// שג'וב המענה לתגובות יוכל לערוך אותה אם המוצר יימחק מהחנות.
async function postFirstComment(meta, links, signature) {
  if (!youtubeConfigured() || process.env.SKIP_YOUTUBE === "1") return null;
  const affiliate = links.affiliate || meta.link;
  if (!affiliate) {
    console.log("[publish] no affiliate link on the product — no first comment");
    return null;
  }

  const token = await youtubeAccessToken();
  // הלינקים בתגובה לא לחיצים בשורטס, ולכן התגובה מפנה לכתובת האתר
  // ולדף הערוץ, שם אפשר ללחוץ, ומוסיפה את הלינקים להעתקה.
  const domain = SITE_URL.replace(/^https?:\/\//, "");
  const price = shekels(meta.price);
  const original = shekels(meta.originalPrice);
  const discount = Math.round(Number(meta.discount) || 0);

  const lines = [String(meta.productName || "המוצר")];
  if (price) {
    lines.push(
      original && Number(meta.originalPrice) > Number(meta.price)
        ? `🟡 ${price} במקום ${original}`
        : `🟡 ${price}`
    );
  }
  if (discount > 0) lines.push(`📉 ${discount}% הנחה`);
  lines.push("");
  lines.push("📍 כל המידע והמחירים של המוצר אפשר למצוא בדף המוצר:");
  if (links.site) lines.push(links.site);
  lines.push(`🌐 ${domain}`);
  lines.push("");
  lines.push(`🛒 לרכישה מאליאקספרס: ${affiliate}`);
  lines.push("🔗 הקישורים הלחיצים מרוכזים בדף הערוץ (Links).");
  if (signature) lines.push("", signature);
  const text = lines.join("\n").trim();
  const response = await fetch(
    `${YT_API}/commentThreads?part=snippet`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
        snippet: {
          videoId: meta.youtubeId,
          topLevelComment: {snippet: {textOriginal: text}},
        },
      }),
    }
  );
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.error) {
    throw new Error(
      `YouTube comment: ${response.status} ${JSON.stringify(
        json.error || json
      ).slice(0, 300)}`
    );
  }

  const commentId = json.snippet?.topLevelComment?.id || json.id || null;
  console.log(`[publish] YouTube first comment: ${commentId}`);
  return commentId;
}

// ---- TikTok ------------------------------------------------------------
function tiktokConfigured() {
  return Boolean(
    process.env.TIKTOK_ACCESS_TOKEN ||
      (process.env.TIKTOK_CLIENT_KEY &&
        process.env.TIKTOK_CLIENT_SECRET &&
        process.env.TIKTOK_REFRESH_TOKEN)
  );
}

// טוקן הגישה של טיקטוק חי 24 שעות בלבד. במקום להחליף סוד כל יום, מרעננים
// בכל ריצה מתוך refresh token (שתקף שנה).
async function tiktokAccessToken() {
  if (process.env.TIKTOK_ACCESS_TOKEN) return process.env.TIKTOK_ACCESS_TOKEN;

  const response = await fetch(`${TIKTOK}/oauth/token/`, {
    method: "POST",
    headers: {"Content-Type": "application/x-www-form-urlencoded"},
    body: new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY,
      client_secret: process.env.TIKTOK_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: process.env.TIKTOK_REFRESH_TOKEN,
    }).toString(),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.access_token) {
    throw new Error(`TikTok token: ${JSON.stringify(json).slice(0, 300)}`);
  }
  if (json.refresh_token && json.refresh_token !== process.env.TIKTOK_REFRESH_TOKEN) {
    console.warn(
      "[publish] TikTok returned a new refresh token — update TIKTOK_REFRESH_TOKEN in the repository secrets (the value is not printed here)."
    );
  }
  return json.access_token;
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

async function tiktokInitialize(meta, caption, token) {
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
      Authorization: `Bearer ${token}`,
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

async function tiktokStatus(publishId, token) {
  const response = await fetch(`${TIKTOK}/post/publish/status/fetch/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
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

  const token = await tiktokAccessToken();
  const {publishId, mode} = await tiktokInitialize(meta, caption, token);
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
    last = await tiktokStatus(publishId, token);
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

  const links = await shortLinks(meta);

  // חתימת הרשתות לכל פלטפורמה — בלי הפלטפורמה שעליה מפרסמים.
  const signatures = {
    telegram: await socials.signature({skip: ["telegram"], style: "html"}),
    instagram: await socials.signature({skip: ["instagram"]}),
    facebook: await socials.signature({skip: ["facebook"]}),
    youtube: await socials.signature({skip: ["youtube"]}),
  };
  console.log(
    `[publish] social links: ${JSON.stringify(await socials.links())}`
  );

  const detailNote = "📍 כל המידע והמחירים אפשר למצוא בדף המוצר";
  // אינסטגרם: רק הריל, עם כל הפרטים — אבל בלי קישור לאינסטגרם עצמה.
  const instagramCaption = networkCaption(meta, links, {
    note: detailNote,
    signature: signatures.instagram,
  });
  // פייסבוק: אותו תוכן, בלי קישור לפייסבוק.
  const facebookCaption = networkCaption(meta, links, {
    note: detailNote,
    signature: signatures.facebook,
  });
  // בטיקטוק אין קישורים בכיתוב, ולכן רק התוכן וההאשטגים.
  const tiktokCaption = [captionBody(meta), hashtags(meta)]
    .filter(Boolean)
    .join("\n\n");
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

  await run("telegram", () => sendTelegram(meta, links, signatures.telegram));
  await run("instagram", () => publishInstagram(meta, instagramCaption));
  await run("facebook", () => publishFacebook(meta, facebookCaption));
  await run("youtube", () =>
    publishYouTube(meta, captionBody(meta), links, signatures.youtube)
  );
  await run("tiktok", () => publishTikTok(meta, tiktokCaption));

  // הלינק לרכישה בתגובה הראשונה — רק כשיש סרטון יוטיוב ולינק שותפים.
  let firstCommentId = null;
  if (results.youtube && results.youtube.ok && results.youtube.id) {
    try {
      meta.youtubeId = results.youtube.id;
      firstCommentId = await postFirstComment(meta, links, signatures.youtube);
    } catch (error) {
      console.warn(`[publish] first comment skipped: ${error.message}`);
    }
  }

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

    // מזהה ההודעה של הסרטון בטלגרם — כדי שאפשר יהיה לערוך אותה (למשל
    // להחליף קישור) בלי לחפש את הפוסט בערוץ.
    const telegramMessageId = results.telegram?.messageId || null;

    // הסרטון עצמו נרשם על המוצר, וזה מה שמאפשר לו להופיע בפיד האתר
    // עם הלינק לדף המוצר ולרכישה — ולא רק בטלגרם וברשתות.
    await ref.set(
      {
        ...(telegramMessageId
          ? {telegramReelMessageId: telegramMessageId}
          : {}),
        reel: {
          url: meta.publicUrl || null,
          file: meta.publicFile || null,
          durationSeconds: meta.totalSeconds || null,
          keyword: meta.keyword || null,
          youtubeId: results.youtube?.id || null,
          youtubeUrl: results.youtube?.url || null,
          telegramMessageId: telegramMessageId,
          publishedAt: new Date().toISOString(),
        },
      },
      {merge: true}
    );
    console.log(`[publish] reel saved on ${meta.productId} for the site feed`);

    // ממפה את מזהה הסרטון ליוטיוב למוצר, כדי שג'וב המענה לתגובות ידע איזה
    // לינק לשלוח למי שמגיב על הסרטון הזה (reply-comments.js).
    if (results.youtube && results.youtube.ok && results.youtube.id) {
      const slug = meta.slug || meta.productId;
      await db
        .collection("videoLinks")
        .doc(String(results.youtube.id))
        .set(
          {
            videoId: results.youtube.id,
            productId: meta.productId,
            productName: meta.productName || null,
            keyword: meta.keyword || null,
            slug,
            url: `${SITE_URL}/product/${encodeURIComponent(slug)}`,
            affiliateUrl: links.affiliate || meta.link || null,
            firstCommentId: firstCommentId,
            telegramMessageId: results.telegram?.messageId || null,
            broken: false,
            updatedAt: new Date().toISOString(),
          },
          {merge: true}
        );
      console.log(
        `[publish] linked YouTube ${results.youtube.id} → ${slug} (for comment replies)`
      );
    }
  } else {
    console.warn("[publish] FIREBASE_SERVICE_ACCOUNT is missing — product not marked.");
  }

  console.log(`[publish] done. site: ${SITE_URL}`);
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("[publish] failed:", error.message);
      process.exit(1);
    });
}

// לחשיפה לבדיקות בלבד — הריצה עצמה היא `node scripts/publish.js`.
module.exports = {
  captionBody,
  hashtags,
  networkCaption,
  productDetails,
  telegramCaption,
  youtubeDescription,
};
