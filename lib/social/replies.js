"use strict";

/**
 * replies.js
 * ---------------------------------------------------------------
 * כל נוסחי התשובה של הרשתות, במקום אחד.
 *
 * מי משתמש בזה:
 *   • video/scripts/reply-social.js — הסריקה כל חצי שעה (גיבוי).
 *   • lib/social/providers/meta.js — ה-webhook שמגיב בזמן אמת.
 *
 * הם חייבים לדבר אותו דבר בדיוק, ולכן הטקסטים יושבים כאן ולא בשני מקומות.
 * מילת המפתח שמזוהה כבקשה (REQUEST) נמצאת גם היא כאן: היא הקובעת למי עונים,
 * ולכן אסור שהיא תסתור את עצמה בין ה-webhook לסריקה.
 */

const {shortenUrl} = require("../short-link");

const SITE_URL = (process.env.SITE_URL || "https://find4u.vercel.app").replace(
  /\/$/,
  ""
);
const SITE_DOMAIN = SITE_URL.replace(/^https?:\/\//, "");

// תגובה שנראית כמו בקשה. תגובה סתמית ("ואו", "אהבתי") לא מקבלת לינק,
// כדי שהתגובות לא ייראו כמו ספאם.
const REQUEST =
  /לינק|קישור|לינקים|מחיר|כמה (זה )?עולה|איפה (קונים|מזמינים)|אפשר|רוצה|צריך|מעוניין|מעניין|קונים|להזמין|link|price|where/i;

// ניסוחים מתחלפים. הבחירה לפי מזהה התגובה — יציבה אבל לא אחידה.
const PUBLIC_REPLIES = {
  facebook: [
    "שלחתי לך את הלינק בהודעה 📩 קיבלת? כל הפרטים גם כאן:",
    "כתבתי לך בפרטי ✅ ודף המוצר עם כל המחירים:",
    "הלינק אצלך ב-Messenger 📨 וכאן כל המידע:",
    "שלחתי!! כנס ותזמין, שווה כל שקל 😊 כל הפרטים כאן:",
  ],
  instagram: [
    "שלחתי לך בפרטי 📩 קיבלת? כל המידע בדף המוצר:",
    "אצלך ב-DM ✅ כל הפרטים והמחירים כאן:",
    "כתבתי לך בהודעה 📨 ודף המוצר עם כל המידע:",
    "שלחתי!! שווה כל שקל 😊 כל הפרטים כאן:",
  ],
};

const OWN_PAGE_ID = String(process.env.FB_PAGE_ID || "");
const OWN_IG_ID = String(process.env.IG_USER_ID || "");
const OWN_IG_USERNAME = String(process.env.IG_USERNAME || "")
  .replace(/^@/, "")
  .toLowerCase();

/**
 * תגובה שאנחנו בעצמנו כתבנו — התגובה הראשונה שלנו על הפוסט, או מענה קודם.
 * אסור לענות לה: היא מכילה את המילה "המחירים" והייתה מזוהה כבקשת לינק,
 * ואז הבוט השיב לעצמו.
 */
function isOwnComment(comment) {
  const data = comment || {};
  const from = data.from || {};
  const author = String(from.id || from.username || data.username || "")
    .replace(/^@/, "")
    .toLowerCase();
  if (
    author &&
    (author === OWN_IG_USERNAME || author === OWN_PAGE_ID || author === OWN_IG_ID)
  ) {
    return true;
  }

  // גם בלי שדות המחבר: כל תגובה שלנו כוללת קישור לאתר או לערוץ.
  const text = String(data.message || data.text || "");
  if (SITE_DOMAIN && text.toLowerCase().includes(SITE_DOMAIN.toLowerCase())) {
    return true;
  }
  if (/https?:\/\/t\.me\//i.test(text)) return true;
  if (OWN_PAGE_ID && text.includes(OWN_PAGE_ID)) return true;
  return false;
}

function variantFor(list, seed) {
  const text = String(seed || "");
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) % 100000;
  }
  const safe = Array.isArray(list) && list.length ? list : PUBLIC_REPLIES.facebook;
  return safe[hash % safe.length];
}

function productPage(product) {
  if (!product) return SITE_URL;
  if (product.slug) {
    return `${SITE_URL}/product/${encodeURIComponent(product.slug)}`;
  }
  return SITE_URL;
}

function purchaseUrl(product) {
  return (product && (product.link || product.affiliateUrl)) || "";
}

// הלינק של אליאקספרס וכתובת דף המוצר ארוכים מאוד ונשברים לשורה בתגובה.
// מקצרים פעם אחת לכל מוצר.
const shortLinksCache = new Map();

async function linksFor(product) {
  const cacheKey = String(
    (product && (product.id || product.slug || product.name)) || ""
  );
  if (shortLinksCache.has(cacheKey)) return shortLinksCache.get(cacheKey);

  const links = {
    buy: await shortenUrl(purchaseUrl(product)),
    page: await shortenUrl(productPage(product)),
  };
  shortLinksCache.set(cacheKey, links);
  return links;
}

/** התגובה הציבורית לתגובה של אדם — כולל הלינק הקצר והחתימה. */
function commentReplyText({platform, seed, links, signature} = {}) {
  const list = PUBLIC_REPLIES[platform] || PUBLIC_REPLIES.facebook;
  const lines = [variantFor(list, seed)];
  if (links && links.buy) lines.push(`🛒 ${links.buy}`);
  if (links && links.page) lines.push(`🌐 ${links.page}`);
  if (signature) lines.push(signature);
  return lines.filter(Boolean).join("\n");
}

/** ההודעה הפרטית על מוצר מסוים (Private Reply / DM). */
function dmText({product, links, signature} = {}) {
  const data = product || {};
  const lines = [`🛍️ ${data.name || "מוצר מ-Find4U"}`];
  const price = Number(data.price);
  if (Number.isFinite(price) && price > 0) {
    lines.push(`💰 ${price.toLocaleString("he-IL")} ₪`);
  }
  if (links && links.buy) lines.push(`🛒 לרכישה: ${links.buy}`);
  if (links && links.page) lines.push(`🌐 דף המוצר: ${links.page}`);
  lines.push("📍 כל המידע והמחירים של המוצר אפשר למצוא בדף המוצר");
  if (signature) lines.push(signature);
  return lines.join("\n");
}

/**
 * תשובה להודעה פרטית נכנסת שאין לה מוצר משויך (למשל מישהו שפשוט כתב
 * "היי" ל-Messenger). לא ממציאים מוצר — מפנים לאתר, ושם כל הקטלוג.
 */
function dmGreetingText({text, signature} = {}) {
  const lines = [];
  if (REQUEST.test(String(text || ""))) {
    lines.push("שמחים שפנית 🙌 כל המוצרים והמחירים שלנו מרוכזים באתר:");
    lines.push(`🌐 ${SITE_URL}`);
  } else {
    lines.push("היי! 👋 כאן Find4U — מוצרים נבחרים במקום אחד.");
    lines.push("אם חיפשת מוצר, לינק או מחיר — הכול נמצא באתר:");
    lines.push(`🌐 ${SITE_URL}`);
  }
  if (signature) lines.push(signature);
  return lines.join("\n");
}

module.exports = {
  REQUEST,
  PUBLIC_REPLIES,
  SITE_URL,
  SITE_DOMAIN,
  isOwnComment,
  variantFor,
  linksFor,
  productPage,
  purchaseUrl,
  commentReplyText,
  dmText,
  dmGreetingText,
};
