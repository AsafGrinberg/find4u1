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
 * איך נראה הפוסט (כמו בערוצי הדילים הגדולים):
 *
 *   🔥 דיל של השעה
 *
 *   משאבת אוויר נטענת לרכב   <-- שם המוצר, לחיץ, מוביל לקישור השותפים שלנו
 *   🟡 8.65 ₪  ~20.11 ₪~ 🟡
 *   📉 57% הנחה
 *   🔥 37,104 מכירות · ⭐ 4.9
 *   🚚 משלוח לישראל
 *
 *   👇 BUY NOW ON ALIEXPRESS 👇
 *   s.click.aliexpress.com/e/_xxxx
 *
 * ומתחת להודעה כפתורים: רכישה, דף המוצר, שיתוף בטלגרם, שיתוף בוואטסאפ.
 *
 * מוצר שכבר נשלח לא נשלח שוב לפני שעברו DEAL_REPEAT_DAYS ימים
 * (dealPostedAt נשמר על המוצר).
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

// קישור שותפים של אליאקספרס שכבר מקוצר על ידם (s.click.aliexpress.com/e/_xxx)
// נשאר כמו שהוא — אין סיבה לעטוף אותו שוב ב-tinyurl.
const ALREADY_SHORT =
  /^https?:\/\/(?:s\.click\.aliexpress\.com|a\.aliexpress\.com)\//i;

function isAlreadyShort(url) {
  return ALREADY_SHORT.test(String(url || "").trim());
}

// מה שמציגים מתחת ל-BUY NOW: בלי https:// ובלי סלאש בסוף.
function shortLinkText(url) {
  const text = String(url || "").trim();
  return text.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
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

/**
 * הכיתוב של הפוסט.
 * link      — הקישור שמוטמע בשם המוצר ובכפתור (קישור השותפים האמיתי).
 * displayLink — מה שמודפס כטקסט מתחת ל-BUY NOW (מקוצר אם צריך).
 */
function dealCaption(product, link, displayLink) {
  const name = escapeHtml(product.name);
  const price = shekels(product.price);
  const original = shekels(product.originalPrice);
  const discount = discountOf(product);
  const previous = Number(product.previousPrice);
  const sales = Number(product.sales) || 0;
  const rating = Number(product.rating) || 0;
  const target = String(link || product.link || "");
  const visible = String(displayLink || target);

  const lines = ["🔥 <b>דיל של השעה</b>", ""];

  lines.push(
    target ? `<a href="${escapeHtml(target)}"><b>${name}</b></a>` : `<b>${name}</b>`
  );

  if (price && original && Number(product.originalPrice) > Number(product.price)) {
    lines.push(`🟡 <b>${price}</b> <s>${original}</s> 🟡`);
  } else if (price) {
    lines.push(`🟡 <b>${price}</b> 🟡`);
  }
  if (discount > 0) lines.push(`📉 ${discount}% הנחה`);

  const stats = [];
  // אליאקספרס מחזירה סך מכירות, לא פילוח של "החודש האחרון" — לכן לא
  // כותבים "החודש" (זה היה מספר מומצא).
  if (sales > 0) stats.push(`🔥 ${sales.toLocaleString("he-IL")} מכירות`);
  if (rating > 0) stats.push(`⭐ ${rating.toFixed(1)}`);
  if (stats.length > 0) lines.push(stats.join(" · "));

  if (Number.isFinite(previous) && previous > Number(product.price)) {
    lines.push("⬇️ המחיר עוד ירד מאז שהמוצר עלה לאתר");
  }

  if (COUPON_TEXT) {
    lines.push("", "🎟️ <b>קופון רשמי של אליאקספרס:</b>");
    lines.push(escapeHtml(COUPON_TEXT));
  }

  lines.push("🚚 משלוח לישראל");

  if (target) {
    lines.push("", "👇 <b>BUY NOW ON ALIEXPRESS</b> 👇");
    lines.push(
      `<a href="${escapeHtml(target)}">${escapeHtml(shortLinkText(visible))}</a>`
    );
  }

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

// מדפיס בלוג למי בדיוק הבוט שולח. אם הפוסט "לא מופיע" — השורה הזאת
// מגלה מיד אם מדובר בערוץ אחר מזה שאתה מסתכל עליו.
async function describeChannel() {
  try {
    const chat = await telegramApi("getChat", {chat_id: TELEGRAM_CHANNEL});
    const handle = chat.username ? `@${chat.username}` : String(chat.id);
    console.log(
      `[deals] target channel: ${chat.title || handle} | ${handle} | id ${chat.id}`
    );
    return handle;
  } catch (error) {
    console.warn(
      `[deals] can't read channel "${TELEGRAM_CHANNEL}": ${error.message}`
    );
    return TELEGRAM_CHANNEL;
  }
}

// קישור ישיר להודעה שפורסמה, כדי שאפשר לפתוח אותה מהלוג ולראות שהיא שם.
function messageLinkOf(handle, messageId) {
  if (!messageId) return null;
  const value = String(handle || "").trim();
  if (value.startsWith("@")) return `https://t.me/${value.slice(1)}/${messageId}`;
  if (/^-100\d+$/.test(value)) return `https://t.me/c/${value.slice(4)}/${messageId}`;
  return null;
}

function siteUrlOf(product) {
  const slug = product.slug || product.sourceId;
  return slug ? `${SITE_URL}/product/${encodeURIComponent(slug)}` : null;
}

// שני קישורים לאותו מוצר:
//   affiliate — הקישור האמיתי שלנו (נכנס לשם המוצר, לכפתור ולשיתוף).
//   display   — מה שמדפיסים כטקסט; אם אליאקספרס כבר נתנה קישור קצר
//               (s.click.aliexpress.com/e/...) משתמשים בו כמו שהוא.
async function dealLinks(product) {
  const affiliate = String(product.link || "");
  const display = isAlreadyShort(affiliate)
    ? affiliate
    : await ali.shortenUrl(affiliate);
  return {
    affiliate,
    display,
    // הקישור לאתר מוצג כטקסט מקושר ("דף המוצר באתר Find4U"), ולכן לא
    // צריך לקצר אותו — הכפתור נושא את הכתובת המלאה.
    site: siteUrlOf(product) || "",
  };
}

function shareButtons(name, link) {
  const title = String(name || "").trim();
  const url = String(link || "");
  if (!url) return [];
  const telegram = `https://t.me/share/url?url=${encodeURIComponent(
    url
  )}&text=${encodeURIComponent(title)}`;
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(
    `${title}\n${url}`.trim()
  )}`;
  return [
    {text: "📤 שיתוף בטלגרם", url: telegram},
    {text: "💬 שיתוף בוואטסאפ", url: whatsapp},
  ];
}

// הכפתורים שמתחת לפוסט: רכישה, דף המוצר ושיתוף (טלגרם + וואטסאפ).
function dealKeyboard(fields = {}) {
  const link = String(fields.link || "").trim();
  const site = String(fields.site || "").trim();
  const keyboard = [];

  if (link) {
    keyboard.push([{text: "🛒 BUY NOW ON ALIEXPRESS", url: link}]);
  }
  if (site) keyboard.push([{text: "🔗 לדף המוצר באתר", url: site}]);
  const share = shareButtons(fields.name, link);
  if (share.length === 2) keyboard.push(share);

  return keyboard;
}

/**
 * הודעת דיל שלמה — כיתוב + כפתורים — מכל מקור:
 * מוצר מהקטלוג שלנו, מוצר שיובא מערוץ מתחרה, או מוצר שיובא מאליאקספרס.
 * כל הפוסטים בטלגרם עוברים כאן, כדי שלא יהיו שני פורמטים שונים.
 */
function dealMessage(fields = {}) {
  const link = String(fields.link || "").trim();
  const site = String(fields.site || "").trim();

  const caption = [
    dealCaption(
      {
        name: fields.name,
        price: fields.price,
        originalPrice: fields.originalPrice,
        discountPercent: fields.discountPercent,
        sales: fields.sales,
        rating: fields.rating,
      },
      link,
      link
    ),
    site ? `🔗 <a href="${escapeHtml(site)}">דף המוצר באתר Find4U</a>` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 1024);

  return {caption, keyboard: dealKeyboard({link, site, name: fields.name})};
}

async function postDeal(product, links) {
  const {caption, keyboard} = dealMessage({
    name: product.name,
    price: product.price,
    originalPrice: product.originalPrice,
    discountPercent: product.discountPercent,
    sales: product.sales,
    rating: product.rating,
    link: links.affiliate,
    site: siteUrlOf(product),
  });

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
  const handle = await describeChannel();

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
        `[deals] would post ${product.id} | ${product.name}\n${dealCaption(
          product,
          links.affiliate,
          links.display
        )}\naffiliate: ${links.affiliate}\nsite: ${links.site}`
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
      const link = messageLinkOf(handle, messageId);
      console.log(
        `[deals] posted ${product.id} | ${product.name} | message ${messageId}` +
          (link ? ` | ${link}` : "")
      );
      posted.push({id: product.id, name: product.name, messageId, link});
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
  dealMessage,
  dealKeyboard,
  dealScore,
  escapeHtml,
  shekels,
  telegramApi,
  siteUrlOf,
  isAlreadyShort,
  shareButtons,
  TELEGRAM_CHANNEL,
  SITE_URL,
};
