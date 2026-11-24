"use strict";

/**
 * socials.js
 * ---------------------------------------------------------------
 * "חתימת הרשתות" שמופיעה בסוף כל פוסט: טלגרם | אינסטגרם | פייסבוק | יוטיוב.
 *
 * מאיפה מגיע כל קישור (בסדר הזה):
 *   1. משתנה סביבה מפורש — SOCIAL_TELEGRAM / SOCIAL_INSTAGRAM /
 *      SOCIAL_FACEBOOK / SOCIAL_YOUTUBE (אפשר לקבוע אותם כסודות).
 *   2. שאילתה ל-API של אותה רשת, אם יש לנו טוקן שלה:
 *        אינסטגרם — IG_USER_ID + IG_ACCESS_TOKEN  → username
 *        פייסבוק  — FB_PAGE_ID  + FB_PAGE_ACCESS_TOKEN → link
 *        יוטיוב   — YOUTUBE_*  → customUrl של הערוץ
 *      טלגרם     — נגזר מ-TELEGRAM_CHANNEL.
 *   3. אם אין דרך לדעת — הרשת פשוט לא מופיעה בחתימה. לא ממציאים קישור.
 *
 * זה משמש גם אתfunctions/ (פוסטים לטלגרם/פייסבוק) וגם את video/scripts
 * (רילים ליוטיוב/אינסטגרם/פייסבוק), כדי שכל הרשתות ייראו אותו דבר בכל מקום.
 */

const GRAPH = "https://graph.facebook.com/v21.0";
const YT_API = "https://www.googleapis.com/youtube/v3";
const DEFAULT_CHANNEL = "@Find4U_official";

const NETWORKS = {
  telegram: {label: "טלגרם", icon: "✈️"},
  instagram: {label: "אינסטגרם", icon: "📸"},
  facebook: {label: "פייסבוק", icon: "👍"},
  youtube: {label: "יוטיוב", icon: "▶️"},
};

// סדר ההופעה בחתימה.
const ORDER = ["telegram", "instagram", "facebook", "youtube"];

function cleanUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^https?:\/\//i.test(text)) return text.replace(/\/+$/, "");
  // "@handle" לבדו אינו כתובת, ואסור לנחש לאיזו רשת הוא שייך.
  if (text.startsWith("@")) return "";
  return `https://${text.replace(/^\/+/, "")}`.replace(/\/+$/, "");
}

// ערוץ טלגרם ציבורי (@name או קישור) אפשר לתרגם לקישור. ערוץ פרטי (‎-100…)
// אין לו קישור ציבורי, ואז לא מציגים אותו.
function telegramFromChannel(channel) {
  const value = String(channel || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return cleanUrl(value);
  if (/^-100\d+$/.test(value)) return "";
  return `https://t.me/${value.replace(/^@/, "")}`;
}

let cached = null;

async function readJson(url) {
  try {
    const response = await fetch(url);
    const json = await response.json().catch(() => ({}));
    if (!response.ok || json.error) return null;
    return json;
  } catch (error) {
    return null;
  }
}

async function instagramFromApi() {
  const id = process.env.IG_USER_ID;
  const token = process.env.IG_ACCESS_TOKEN;
  if (!id || !token) return "";
  const json = await readJson(
    `${GRAPH}/${encodeURIComponent(id)}?fields=username&access_token=${encodeURIComponent(
      token
    )}`
  );
  const username = json && json.username;
  return username ? `https://www.instagram.com/${username}` : "";
}

async function facebookFromApi() {
  const id = process.env.FB_PAGE_ID;
  const token = process.env.FB_PAGE_ACCESS_TOKEN;
  if (!id || !token) return "";
  const json = await readJson(
    `${GRAPH}/${encodeURIComponent(id)}?fields=link&access_token=${encodeURIComponent(
      token
    )}`
  );
  const link = json && json.link;
  return link ? cleanUrl(link) : "";
}

async function youtubeAccessToken() {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return "";
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {"Content-Type": "application/x-www-form-urlencoded"},
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
      }).toString(),
    });
    const json = await response.json().catch(() => ({}));
    return response.ok && json.access_token ? json.access_token : "";
  } catch (error) {
    return "";
  }
}

async function youtubeFromApi() {
  if (
    !process.env.YOUTUBE_CLIENT_ID ||
    !process.env.YOUTUBE_CLIENT_SECRET ||
    !process.env.YOUTUBE_REFRESH_TOKEN
  ) {
    return "";
  }
  const token = await youtubeAccessToken();
  if (!token) return "";
  const json = await readJson(
    `${YT_API}/channels?part=snippet&mine=true&access_token=${encodeURIComponent(
      token
    )}`
  );
  const snippet =
    json && json.items && json.items[0] && json.items[0].snippet;
  if (!snippet) return "";
  if (snippet.customUrl) return cleanUrl(snippet.customUrl);
  if (snippet.title) {
    return `https://www.youtube.com/@${String(snippet.title)
      .replace(/\s+/g, "")
      .replace(/[^\p{L}\p{N}_.-]/gu, "")}`;
  }
  return "";
}

/**
 * מחזיר {telegram, instagram, facebook, youtube} — קישור מלא או "".
 * נקרא פעם אחת לריצה ונשמר בזיכרון.
 */
async function links() {
  if (cached) return cached;

  const found = {
    telegram:
      cleanUrl(process.env.SOCIAL_TELEGRAM) ||
      telegramFromChannel(process.env.TELEGRAM_CHANNEL || DEFAULT_CHANNEL),
    instagram: cleanUrl(process.env.SOCIAL_INSTAGRAM),
    facebook: cleanUrl(process.env.SOCIAL_FACEBOOK),
    youtube: cleanUrl(process.env.SOCIAL_YOUTUBE),
  };

  if (!found.instagram) found.instagram = await instagramFromApi();
  if (!found.facebook) found.facebook = await facebookFromApi();
  if (!found.youtube) found.youtube = await youtubeFromApi();

  cached = found;
  return cached;
}

function entryFor(key, url, style) {
  const network = NETWORKS[key];
  if (!network) return "";
  return style === "html"
    ? `<a href="${url}">${network.icon} ${network.label}</a>`
    : `${network.icon} ${network.label}: ${url}`;
}

/**
 * שורת החתימה.
 *   signature({skip: ["telegram"]})              → טקסט רגיל (פייסבוק/אינסטגרם/יוטיוב)
 *   signature({skip: ["facebook"], style: "html"}) → קישורים לחיצים (טלגרם)
 * רשת שאין לה קישור פשוט לא מופיעה. אין חתימה ריקה עם "|" מיותר.
 */
async function signature(options = {}) {
  const skip = new Set(options.skip || []);
  const style = options.style === "html" ? "html" : "text";
  // בהזמנה של video/ אפשר לבקש שהרשת של הפלטפורמה עצמה לא תופיע.
  const order = Array.isArray(options.order) && options.order.length
    ? options.order
    : ORDER;

  const found = await links();
  const parts = order
    .filter((key) => !skip.has(key) && found[key])
    .map((key) => entryFor(key, found[key], style))
    .filter(Boolean);

  return parts.join(" | ");
}

function reset() {
  cached = null;
}

module.exports = {
  links,
  signature,
  cleanUrl,
  telegramFromChannel,
  reset,
  NETWORKS,
  ORDER,
};
