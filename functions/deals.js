"use strict";

/**
 * deals.js
 * ---------------------------------------------------------------
 * פוסטי דילים לערוץ הטלגרם, מתוך הקטלוג שלנו בלבד.
 *
 * הכלל: לא ממציאים קופונים ולא ממציאים מחירים.
 *   - "דיל" = מוצר אמיתי בקטלוג שהמחיר שלו באמת ירד מול המחיר המקורי
 *     (price / originalPrice / discountPercent מהקטלוג).
 *   - "קופון" = טקסט רשמי של אליאקספרס שהמשתמש מדביק בסוד DEAL_COUPON_TEXT.
 *     הוא מוצג כמו שהוא, בלי להוסיף קודים משלנו.
 *
 * כל דיל נשלח עם תמונה, מחיר, הנחה, כפתור רכישה (הקישור השותפים שלנו)
 * וכפתור לדף המוצר באתר. מוצר שכבר נשלח לא נשלח שוב לפני שעברו
 * DEAL_REPEAT_DAYS ימים (dealPostedAt נשמר על המוצר).
 */

const {__test: ali} = require("./recommended");

const SITE_URL = (process.env.SITE_URL || "https://find4u.vercel.app").replace(
  /\/$/,
  ""
);
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHANNEL = process.env.TELEGRAM_CHANNEL || "@Find4U_official";

const DEALS_PER_RUN = Number(process.env.DEALS_PER_RUN || 2);
const MIN_DISCOUNT = Number(process.env.DEAL_MIN_DISCOUNT || 25);
const MAX_PRICE = Number(process.env.DEAL_MAX_PRICE || 250);
const REPEAT_DAYS = Number(process.env.DEAL_REPEAT_DAYS || 4);
const DRY_RUN = process.env.DEALS_DRY_RUN === "1";

// טקסט רשמי של קופון אליאקספרס (קוד + תנאים + תוקף), שורות מופרדות ב-\n.
// ריק = פשוט לא מציגים קופון.
const COUPON_TEXT = String(process.env.DEAL_COUPON_TEXT || "").trim();

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function shekels(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return `${number.toLocaleString("he-IL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ₪`;
}

function dateOf(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value.toDate === "function") return value.toDate();
  return null;
}

function daysSince(value, now) {
  const date = dateOf(value);
  if (!date) return Infinity;
  return (now - date.getTime()) / (24 * 60 * 60 * 1000);
}

// אחוז ההנחה האמיתי: מהשדה, ואם הוא חסר — מחושב מהמחירים.
function discountOf(product) {
  const price = Number(product.price);
  const original = Number(product.originalPrice);
  const stored = Number(product.discountPercent);

  if (Number.isFinite(stored) && stored > 0) return Math.round(stored);
  if (
    Number.isFinite(price) &&
    Number.isFinite(original) &&
    original > price &&
    original > 0
  ) {
    return Math.round(((original - price) / original) * 100);
  }
  return 0;
}

/**
 * האם המוצר מתאים לפוסט דיל.
 * לא זול "סתם" — חייב ירידת מחיר אמיתית, קישור, תמונה, ומחיר שפוי.
 */
function isDealCandidate(product, options = {}) {
  if (!product) return false;
  if (product.unavailable) return false;
  if (!product.link || !product.image) return false;
  if (!product.name) return false;

  const now = Number(options.now || Date.now());
  const minDiscount = options.minDiscount ?? MIN_DISCOUNT;
  const maxPrice = options.maxPrice ?? MAX_PRICE;
  const repeatDays = options.repeatDays ?? REPEAT_DAYS;

  const price = Number(product.price);
  if (!Number.isFinite(price) || price <= 0) return false;
  if (price > maxPrice) return false;

  if (discountOf(product) < minDiscount) return false;
  if (daysSince(product.dealPostedAt, now) < repeatDays) return false;

  return true;
}

// דיל טוב = הנחה גדולה, מוצר שנמכר, ומחיר נוח. הישנים מקבלים עדיפות קלה
// כדי שלא כל הפוסטים יגיעו מאותו יום פרסום.
function dealScore(product, now = Date.now()) {
  const discount = discountOf(product);
  const sales = Number(product.sales) || 0;
  const rating = Number(product.rating) || 0;
  const freshness = Math.max(0, 30 - daysSince(product.postedAt, now)) / 30;

  return discount * 1.2 + Math.log10(sales + 1) * 4 + rating * 2 + freshness * 8;
}

function dealCaption(product) {
  const name = escapeHtml(product.name);
  const price = shekels(product.price);
  const original = shekels(product.originalPrice);
  const discount = discountOf(product);
  const previous = Number(product.previousPrice);

  const lines = [`🔥 <b>דיל של השעה</b>`, "", `<b>${name}</b>`, ""];

  if (price && original) {
    lines.push(`💰 <b>${price}</b> במקום ${original}`);
  } else if (price) {
    lines.push(`💰 <b>${price}</b>`);
  }
  if (discount > 0) lines.push(`📉 ${discount}% הנחה`);
  if (Number.isFinite(previous) && previous > Number(product.price)) {
    lines.push("⬇️ המחיר עוד ירד מאז שהמוצר עלה לאתר");
  }

  if (COUPON_TEXT) {
    lines.push("", "🎟️ <b>קופון רשמי של אליאקספרס:</b>");
    lines.push(escapeHtml(COUPON_TEXT));
  }

  lines.push("", "🚚 משלוח לישראל");
  return lines.join("\n").trim();
}

async function telegramApi(method, body) {
  if (!TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is missing");
  }
  const response = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(body),
    }
  );
  const json = await response.json().catch(() => ({}));
  if (!json.ok) {
    throw new Error(
      `Telegram ${method} failed: ${json.description || response.status}`
    );
  }
  return json.result;
}

function siteUrlOf(product) {
  const slug = product.slug || product.sourceId;
  return slug ? `${SITE_URL}/product/${encodeURIComponent(slug)}` : null;
}

// הכיתוב בטלגרם כולל קישור מקוצר, כי קישור שותפים ארוך נשבר לשורות
// ולא ניתן ללחיצה.
async function dealLinks(product) {
  return {
    affiliate: await ali.shortenUrl(String(product.link || "")),
    site: await ali.shortenUrl(siteUrlOf(product) || ""),
  };
}

async function postDeal(product, links) {
  const caption = [
    dealCaption(product),
    "",
    links.affiliate ? `🛒 <b>לרכישה:</b>\n${escapeHtml(links.affiliate)}` : "",
    links.site ? `🔗 <b>דף המוצר באתר:</b>\n${escapeHtml(links.site)}` : "",
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 1024);

  const keyboard = [];
  if (product.link) {
    keyboard.push([{text: "🛒 לרכישה עכשיו", url: String(product.link)}]);
  }
  const site = siteUrlOf(product);
  if (site) keyboard.push([{text: "🔗 לדף המוצר", url: site}]);

  const message = await telegramApi("sendPhoto", {
    chat_id: TELEGRAM_CHANNEL,
    photo: product.image,
    caption,
    parse_mode: "HTML",
    reply_markup: keyboard.length > 0 ? {inline_keyboard: keyboard} : undefined,
  });

  return message && message.message_id ? message.message_id : null;
}

/**
 * שולח עד DEALS_PER_RUN דילים חדשים ומחזיר סיכום.
 * לא שולחים שני דילים מאותה קטגוריה באותה ריצה.
 */
async function runDealPosts(firestore) {
  const snapshot = await firestore
    .collection("products")
    .orderBy("postedAt", "desc")
    .limit(400)
    .get();

  const now = Date.now();
  const products = snapshot.docs
    .map((doc) => ({...doc.data(), id: doc.id, ref: doc.ref}))
    .filter((product) => isDealCandidate(product, {now}))
    .sort((a, b) => dealScore(b, now) - dealScore(a, now));

  console.log(
    `[deals] scanned ${snapshot.size}, candidates ${products.length}, ` +
      `coupon: ${COUPON_TEXT ? "quoted" : "none"}, dry run: ${DRY_RUN}`
  );

  const posted = [];
  const skipped = [];
  const usedCategories = new Set();

  for (const product of products) {
    if (posted.length >= DEALS_PER_RUN) break;

    const category = String(
      (Array.isArray(product.category) ? product.category[0] : product.category) ||
        ""
    ).trim();
    if (category && usedCategories.has(category)) {
      skipped.push({id: product.id, reason: `same category as an earlier deal (${category})`});
      continue;
    }

    const links = await dealLinks(product);

    if (DRY_RUN) {
      console.log(
        `[deals] would post ${product.id} | ${product.name}\n${dealCaption(product)}\n` +
          `affiliate: ${links.affiliate}\nsite: ${links.site}`
      );
      posted.push({id: product.id, name: product.name, dryRun: true});
      if (category) usedCategories.add(category);
      continue;
    }

    try {
      const messageId = await postDeal(product, links);
      await product.ref.set(
        {
          dealPostedAt: new Date().toISOString(),
          dealMessageIds: [messageId].filter(Boolean),
        },
        {merge: true}
      );
      console.log(`[deals] posted ${product.id} | ${product.name} | message ${messageId}`);
      posted.push({id: product.id, name: product.name, messageId});
      if (category) usedCategories.add(category);
    } catch (error) {
      console.error(`[deals] failed for ${product.id}: ${error.message}`);
      skipped.push({id: product.id, reason: error.message});
    }
  }

  if (posted.length === 0) {
    console.log("[deals] nothing to post this run.");
  }

  return {scanned: snapshot.size, candidates: products.length, posted, skipped};
}

module.exports = {
  runDealPosts,
  // לבדיקות וליבוא מוצרים, שמשתמש באותו כיתוב דיל.
  isDealCandidate,
  discountOf,
  dealCaption,
  dealScore,
  escapeHtml,
  shekels,
  telegramApi,
  siteUrlOf,
  TELEGRAM_CHANNEL,
  SITE_URL,
};
