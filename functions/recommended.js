"use strict";

/**
 * recommended.js
 * ---------------------------------------------------------------
 * Hourly job:
 *   1. picks a different search angle each run (rotation stored in Firestore)
 *   2. searches AliExpress affiliate API with prices in ILS
 *   3. keeps only "recommended" products (rating + real sales + image + price + commission)
 *   4. skips products posted in the last 14 days
 *   5. creates the Hebrew category in /categories if it does not exist yet
 *   6. saves the product to /products in ILS
 *   7. posts to Telegram: photo + caption, then a detailed text post with a "לקנייה" button
 */

const crypto = require("crypto");
const admin = require("firebase-admin");

const API_URL = "https://api-sg.aliexpress.com/sync";

const ALIEXPRESS_APP_KEY =
  process.env.ALIEXPRESS_APP_KEY || "517648";
const ALIEXPRESS_APP_SECRET =
  process.env.ALIEXPRESS_APP_SECRET || "BaXt8XVfIl2kJhOU10vhgCfwkzYRIjp0";
const ALIEXPRESS_TRACKING_ID =
  process.env.ALIEXPRESS_TRACKING_ID || "find4u_2025";

const TELEGRAM_BOT_TOKEN =
  process.env.TELEGRAM_BOT_TOKEN ||
  "8825712163:AAERjc3Xec0oKwbsuEvT0YPF6P7Ho175Mb0";
const TELEGRAM_CHANNEL = process.env.TELEGRAM_CHANNEL || "@Find4U_official";
const SITE_URL = (process.env.SITE_URL || "https://find4u.vercel.app").replace(/\/$/, "");

const MAX_POSTS_PER_RUN = 5;
const SKIP_DAYS = 14;
const MIN_RATING = 4.3;
const MIN_SALES = 50;
const SEARCH_PAGE_SIZE = 50;

const STATE_DOC = "job_state/recommendedProducts";
const TRANSLATION_CACHE = "translation_cache";

// ---- Search angles: one different angle per run -------------------------
// q = the English query sent to AliExpress, he = the Hebrew category name.
const ANGLES = [
  {q: "air purifier", he: "מטהרי אוויר"},
  {q: "robot vacuum", he: "שואבי אבק רובוטיים"},
  {q: "key finder", he: "מחפשי מפתחות"},
  {q: "baby monitor", he: "מצלמות ומנטרים לתינוק"},
  {q: "smart light", he: "תאורה חכמה"},
  {q: "car accessories", he: "אביזרים לרכב"},
  {q: "massage gun", he: "מסאז'רים"},
  {q: "portable blender", he: "בלנדרים ניידים"},
  {q: "desk organizer", he: "ארגון לשולחן העבודה"},
  {q: "humidifier", he: "מכשירי אדים"},
  {q: "garlic press", he: "מטבח"},
  {q: "phone holder", he: "מעמדים לטלפון"},
  {q: "pet bed", he: "מוצרים לחיות מחמד"},
  {q: "cooler bag", he: "צידניות וציוד לפיקניק"},
  {q: "ice maker", he: "מכונות קרח"},
  {q: "cable organizer", he: "ארגון כבלים"},
  {q: "kitchen gadget", he: "גאדג'טים למטבח"},
  {q: "led strip", he: "פסי לד"},
  {q: "electric shaver", he: "מכונות גילוח"},
  {q: "water bottle", he: "בקבוקי שתייה"},
  {q: "tool set", he: "כלי עבודה"},
  {q: "gaming accessories", he: "אביזרים לגיימינג"},
  {q: "yoga mat", he: "ספורט וכושר"},
  {q: "solar lamp", he: "תאורת חוץ"},
  {q: "hair dryer", he: "מייבשי שיער"},
  {q: "coffee grinder", he: "מטחנות קפה"},
  {q: "food storage", he: "אחסון מזון"},
  {q: "backpack", he: "תיקים"},
  {q: "watch band", he: "רצועות לשעון"},
  {q: "night light", he: "מנורות לילה"},
];

// ---- Sales copy: rotated so the channel does not read like a template ----
const HOOKS = [
  "אחד המוצרים המבוקשים בקטגוריה",
  "מוצר עם דירוג גבוה ומכירות מטורפות",
  "הבחירה של אלפי קונים מרוצים",
  "מהמוצרים המדורגים ביותר בקטגוריה",
  "מוצר שלא נשאר במלאי לאורך זמן",
];


// ---- Helpers ------------------------------------------------------------

function db() {
  return admin.firestore();
}

function toNumber(value) {
  if (value === null || value === undefined) return null;
  const parsed = parseFloat(String(value).replace(/[^\d.\-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function toPercent(value) {
  const parsed = toNumber(value);
  return parsed === null ? 0 : parsed;
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Two sellers often list the same item with slightly different titles,
// so the key ignores case and punctuation.
function titleKey(product) {
  return String(product.product_title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 45);
}

function siteProductUrl(productId) {
  return `${SITE_URL}/product/aliexpress_${productId}`;
}

function shekels(value) {
  if (value === null || value === undefined) return "";
  return `${value.toFixed(2)} ₪`;
}

function mainImage(product) {
  if (product.product_main_image_url) return product.product_main_image_url;

  const small = product.product_small_image_urls &&
    product.product_small_image_urls.string;
  if (Array.isArray(small) && small.length > 0) return small[0];

  return product.image_url || "";
}

function ratingOutOfFive(product) {
  const raw = toNumber(product.evaluate_rate);
  if (raw === null) return null;
  // AliExpress sends the rating as a percentage like "94.1%".
  return raw > 5 ? raw / 20 : raw;
}

function salePrice(product) {
  const target = toNumber(product.target_sale_price);
  if (target !== null) return target;
  return toNumber(product.sale_price);
}

function originalPrice(product) {
  const target = toNumber(product.target_original_price);
  if (target !== null) return target;
  return toNumber(product.original_price);
}

function discountPercent(product) {
  const sale = salePrice(product);
  const original = originalPrice(product);
  const fromApi = toNumber(product.discount);

  if (sale !== null && original !== null && original > sale) {
    return Math.round(((original - sale) / original) * 100);
  }
  return fromApi;
}

// ---------------------------------------------------------------------
// AliExpress affiliate API
// ---------------------------------------------------------------------

function signParams(params) {
  const concatenated = Object.keys(params)
    .sort()
    .map((key) => key + params[key])
    .join("");
  return crypto
    .createHash("md5")
    .update(ALIEXPRESS_APP_SECRET + concatenated + ALIEXPRESS_APP_SECRET)
    .digest("hex")
    .toUpperCase();
}

async function aliexpressCall(method, params) {
  const payload = Object.assign(
    {
      app_key: ALIEXPRESS_APP_KEY,
      method: method,
      sign_method: "md5",
      timestamp: String(Date.now()),
      format: "json",
      v: "2.0",
    },
    params
  );
  payload.sign = signParams(payload);

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
    },
    body: new URLSearchParams(payload).toString(),
  });

  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new Error(
      `AliExpress returned non-JSON (${response.status}): ${text.slice(0, 300)}`
    );
  }

  if (json.error_response) {
    const err = json.error_response;
    throw new Error(
      `AliExpress error: ${err.code} - ${err.msg || err.sub_msg || "unknown"}`
    );
  }
  return json;
}

async function searchProducts(keyword) {
  const response = await aliexpressCall("aliexpress.affiliate.product.query", {
    keywords: keyword,
    page_no: "1",
    page_size: String(SEARCH_PAGE_SIZE),
    sort: "LAST_VOLUME_DESC",
    target_currency: "ILS",
    target_language: "EN",
    ship_to_country: "IL",
    tracking_id: ALIEXPRESS_TRACKING_ID,
  });

  const result =
    response.aliexpress_affiliate_product_query_response &&
    response.aliexpress_affiliate_product_query_response.resp_result;
  const products = result && result.result && result.result.products;
  const list = products && products.product;
  if (!Array.isArray(list)) return [];
  return list;
}

async function buildAffiliateLink(product) {
  if (product.promotion_link) return product.promotion_link;

  const response = await aliexpressCall("aliexpress.affiliate.link.generate", {
    promotion_link_type: "0",
    source_values: product.product_detail_url,
    tracking_id: ALIEXPRESS_TRACKING_ID,
  });

  const result =
    response.aliexpress_affiliate_link_generate_response &&
    response.aliexpress_affiliate_link_generate_response.resp_result;
  const links = result && result.result && result.result.promotion_links;
  const first = links && links.promotion_link && links.promotion_link[0];
  return first && first.promotion_link ? first.promotion_link : null;
}

// ---------------------------------------------------------------------
// Hebrew naming
// ---------------------------------------------------------------------

const NOISE = /\b(hot sale|free shipping|dropshipping|wholesale|new arrival|high quality|best seller|factory price|2023|2024|2025|2026)\b/gi;

function cleanTitle(title) {
  return String(title || "")
    .replace(NOISE, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–|,]+|[\s\-–|,]+$/g, "")
    .trim();
}

function quantityInfo(title) {
  const match = String(title || "").match(
    /^\s*(\d+)\s*(\/\s*\d+)?\s*(pcs|pc|pack|packs|pieces|set|sets)\b/i
  );
  if (!match) return {count: null, isVariant: false};
  return {count: Number(match[1]), isVariant: Boolean(match[2])};
}

function extractSpecs(title) {
  const specs = [];
  const text = String(title || "");

  const quantity = quantityInfo(text);
  // "1/4 Pack" means one of four variants, so the number is not a quantity.
  if (quantity.count && !quantity.isVariant) {
    specs.push(`${quantity.count} יחידות`);
  }

  const ah = text.match(/(\d[\d,.]*)\s*mah/i);
  if (ah) specs.push(`${ah[1]}mAh`);

  const pa = text.match(/(\d[\d,.]*)\s*pa\b/i);
  if (pa) specs.push(`${pa[1]}Pa`);

  const ml = text.match(/(\d[\d,.]*)\s*ml\b/i);
  if (ml) specs.push(`${ml[1]} מ״ל`);

  const watts = text.match(/(\d[\d,.]*)\s*w\b/i);
  if (watts) specs.push(`${watts[1]}W`);

  const liters = text.match(/(\d+(?:\.\d+)?)\s*l\b/i);
  if (liters) specs.push(`${liters[1]} ליטר`);

  return specs.slice(0, 2).join(" ");
}

function headForTranslation(title) {
  const withoutQuantity = cleanTitle(title).replace(
    /^\s*\d+\s*(?:\/\s*\d+)?\s*(?:pcs|pc|pack|packs|pieces|set|sets)\b\s*/i,
    ""
  );
  const cleaned =
    withoutQuantity.replace(/^for\s+/i, "").trim() || cleanTitle(title);
  const cut = cleaned.split(/\s+for\s+|\s+with\s+|\s+and\s+|,|;/i)[0].trim();
  const base = cut.split(" ").length >= 2 ? cut : cleaned;
  return base.split(" ").slice(0, 8).join(" ");
}

async function translateToHebrew(text) {
  if (!text) return null;

  // Cache first: saves the free translation quota and keeps names stable.
  const key = crypto.createHash("md5").update(text).digest("hex");
  try {
    const cached = await db().collection(TRANSLATION_CACHE).doc(key).get();
    if (cached.exists && cached.get("he")) return cached.get("he");
  } catch (error) {
    // Cache is best effort; the job keeps working without it.
  }

  let hebrew = null;

  try {
    const url =
      "https://api.mymemory.translated.net/get?q=" +
      encodeURIComponent(text) +
      "&langpair=en|he";
    const response = await fetch(url);
    if (response.ok) {
      const json = await response.json();
      const candidate =
        json.responseData && json.responseData.translatedText;
      if (
        candidate &&
        !/MYMEMORY WARNING|QUERY LENGTH LIMIT/i.test(candidate)
      ) {
        hebrew = candidate;
      }
    }
  } catch (error) {
    hebrew = null;
  }

  if (!hebrew) {
    try {
      const url =
        "https://translate.googleapis.com/translate_a/single" +
        "?client=gtx&sl=en&tl=he&dt=t&q=" +
        encodeURIComponent(text);
      const response = await fetch(url);
      if (response.ok) {
        const json = await response.json();
        hebrew = json[0].map((part) => part[0]).join("");
      }
    } catch (error) {
      hebrew = null;
    }
  }

  if (!hebrew) return null;

  hebrew = hebrew
    .replace(/\s+/g, " ")
    .replace(/\s+([,.:;!?])/g, "$1")
    .trim();

  try {
    await db().collection(TRANSLATION_CACHE).doc(key).set({
      en: text,
      he: hebrew,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, {merge: true});
  } catch (error) {
    // Ignore cache write failures.
  }

  return hebrew;
}

async function hebrewName(product) {
  const head = headForTranslation(product.product_title);
  const translated = await translateToHebrew(head);
  const body = translated || head;

  // The translation often already contains the quantity, so only add it
  // when it is missing.
  const specs = extractSpecs(product.product_title);
  const hasQuantity = /יחידות/.test(body);
  const prefix = specs && hasQuantity ? "" : specs;

  return [prefix, body].filter(Boolean).join(" ").trim();
}

// ---------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------

function isRecommended(product) {
  const price = salePrice(product);
  const rating = ratingOutOfFive(product);
  const sales = toNumber(product.lastest_volume);
  const commission = toPercent(product.commission_rate);

  if (!mainImage(product)) return false;
  if (!product.product_id) return false;
  if (price === null || price <= 0) return false;
  if (rating === null || rating < MIN_RATING) return false;
  if (sales === null || sales < MIN_SALES) return false;
  if (commission <= 0) return false;
  return true;
}

function scoreProduct(product) {
  const rating = ratingOutOfFive(product) || 0;
  const sales = toNumber(product.lastest_volume) || 0;
  const commission = toPercent(product.commission_rate);
  const price = salePrice(product) || 0;
  // Price is weighted so a real product beats a 2 shekel accessory
  // with a similar rating and sales volume.
  return rating * 100 +
    Math.log10(sales + 1) * 40 +
    commission * 2 +
    Math.min(price, 800) * 0.05;
}

// ---------------------------------------------------------------------
// Telegram
// ---------------------------------------------------------------------

async function telegramRequest(method, body) {
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

async function shortenUrl(url) {
  if (!url) return "";
  if (url.length <= 40) return url;

  const shorten = async (endpoint) => {
    const response = await fetch(endpoint);
    if (!response.ok) return null;
    const text = (await response.text()).trim();
    if (!/^https?:\/\//.test(text)) return null;
    return text.length < url.length ? text : null;
  };

  try {
    const short = await shorten(
      "https://tinyurl.com/api-create.php?url=" + encodeURIComponent(url)
    );
    if (short) return short;
  } catch (error) {
    // Try the next shortener.
  }

  try {
    const short = await shorten(
      "https://is.gd/create.php?format=simple&url=" + encodeURIComponent(url)
    );
    if (short) return short;
  } catch (error) {
    // Fall back to the long link.
  }

  return url;
}

function composeCaption(product, nameHe, shortLink, siteUrl) {
  const price = salePrice(product);
  const original = originalPrice(product);
  const discount = discountPercent(product);
  const rating = ratingOutOfFive(product);
  const sales = toNumber(product.lastest_volume);

  return [
    escapeHtml(nameHe),
    escapeHtml(pick(HOOKS)),
    "",
    escapeHtml(
      original && original > price
        ? `${shekels(price)} במקום ${shekels(original)}`
        : `${shekels(price)} בלבד`
    ),
    discount ? `${discount}% הנחה` : "",
    rating ? `דירוג ${rating.toFixed(1)} מתוך 5` : "",
    sales ? `${sales.toLocaleString("he-IL")} מכירות` : "",
    "",
    "משלוח לישראל",
    "",
    "<b>לינק לרכישה מאלי אקספרס:</b>",
    escapeHtml(shortLink),
    siteUrl ? `\nעמוד המוצר באתר Find4U:\n${escapeHtml(siteUrl)}` : "",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

async function postProductToTelegram(product, affiliateLink, nameHe) {
  const shortLink = await shortenUrl(affiliateLink);
  const caption = composeCaption(
    product,
    nameHe,
    shortLink,
    siteProductUrl(product.product_id)
  );

  await telegramRequest("sendPhoto", {
    chat_id: TELEGRAM_CHANNEL,
    photo: mainImage(product),
    caption: caption,
    parse_mode: "HTML",
  });
}

// ---------------------------------------------------------------------
// Firestore
// ---------------------------------------------------------------------

async function ensureCategory(categoryName) {
  const snapshot = await db()
    .collection("categories")
    .where("name", "==", categoryName)
    .limit(1)
    .get();

  if (!snapshot.empty) return false;

  await db().collection("categories").add({
    name: categoryName,
    source: "auto",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return true;
}

async function wasPostedRecently(productId) {
  const id = `aliexpress_${productId}`;
  const doc = await db().collection("products").doc(id).get();
  if (!doc.exists) return false;

  const postedAt = doc.get("postedAt");
  if (!postedAt) return false;

  const postedDate =
    typeof postedAt.toDate === "function" ? postedAt.toDate() : null;
  if (!postedDate) return false;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - SKIP_DAYS);
  return postedDate > cutoff;
}

async function saveProduct(product, affiliateLink, nameHe, categoryHe) {
  const id = `aliexpress_${product.product_id}`;
  const docRef = db().collection("products").doc(id);
  const existing = await docRef.get();

  const price = salePrice(product);
  const original = originalPrice(product);
  const discount = discountPercent(product);
  const rating = ratingOutOfFive(product);
  const sales = toNumber(product.lastest_volume);

  const description = [
    nameHe + ".",
    rating ? `דירוג ${rating.toFixed(1)} מתוך 5.` : "",
    sales ? `${sales.toLocaleString("he-IL")} מכירות.` : "",
    discount ? `${discount}% הנחה.` : "",
    "משלוח לישראל.",
  ]
    .filter(Boolean)
    .join(" ");

  const data = {
    name: nameHe,
    description: description,
    link: affiliateLink || product.product_detail_url || "",
    price: price,
    currency: "ILS",
    category: [categoryHe],
    image: mainImage(product),
    gallery: mainImage(product) ? [mainImage(product)] : [],
    videos: [],
    updatedAt: new Date().toISOString(),
    source: "aliexpress",
    sourceId: String(product.product_id),
    sourceTitle: product.product_title || "",
    sourceCategory: product.second_level_category_name || "",
    titleKey: titleKey(product),
    originalPrice: original,
    discountPercent: discount,
    rating: rating,
    sales: sales,
    commissionRate: toPercent(product.commission_rate),
    postedAt: admin.firestore.FieldValue.serverTimestamp(),
    postedToTelegram: true,
    likesCount: existing.exists ? (existing.get("likesCount") || 0) : 0,
  };

  if (!existing.exists) {
    data.createdAt = new Date().toISOString();
  }

  await docRef.set(data, {merge: true});
  return {id: id, created: !existing.exists};
}

// ---------------------------------------------------------------------
// Focus rotation
// ---------------------------------------------------------------------

async function pickAngle() {
  const stateRef = db().doc(STATE_DOC);
  const state = await stateRef.get();
  const recent = (state.exists && state.get("recentAngles")) || [];
  const recentTitleKeys =
    (state.exists && state.get("recentTitleKeys")) || [];

  const available = ANGLES.filter(
    (angle) => !recent.includes(angle.q)
  );
  const chosen = available.length > 0 ? available[0] : ANGLES[0];

  const nextRecent = [chosen.q].concat(recent).slice(0, 10);
  await stateRef.set(
    {
      recentAngles: nextRecent,
      lastRunAt: admin.firestore.FieldValue.serverTimestamp(),
      lastAngle: chosen.q,
    },
    {merge: true}
  );

  return {angle: chosen, recentTitleKeys: recentTitleKeys};
}

async function rememberTitleKeys(keys, previous) {
  if (keys.length === 0) return;
  const merged = keys.concat(previous).slice(0, 300);
  await db().doc(STATE_DOC).set(
    {recentTitleKeys: merged},
    {merge: true}
  );
}

// ---------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------

async function runRecommendedProducts() {
  const picked = await pickAngle();
  const angle = picked.angle;
  const categoryHe = angle.he;
  const recentTitleKeys = new Set(picked.recentTitleKeys);
  console.log(`[recommended] angle for this run: ${angle.q} (${categoryHe})`);

  const products = await searchProducts(angle.q);
  console.log(`[recommended] ${products.length} products returned`);

  // The same product can come back several times with different SKUs,
  // so keep only the best scoring entry per product id.
  const seen = new Set();
  const candidates = products
    .filter(isRecommended)
    .sort((a, b) => scoreProduct(b) - scoreProduct(a))
    .filter((product) => {
      const id = String(product.product_id);
      const key = titleKey(product);

      if (seen.has(id)) return false;
      seen.add(id);

      // Same item, different seller: skip it.
      if (key && (seen.has(key) || recentTitleKeys.has(key))) return false;
      if (key) seen.add(key);

      return true;
    });

  console.log(`[recommended] ${candidates.length} products passed the filter`);

  const published = [];
  let categoryCreated = false;

  for (const product of candidates) {
    if (published.length >= MAX_POSTS_PER_RUN) break;
    if (await wasPostedRecently(product.product_id)) continue;

    const nameHe = await hebrewName(product);

    let affiliateLink = null;
    try {
      affiliateLink = await buildAffiliateLink(product);
    } catch (error) {
      console.error(
        `[recommended] link generation failed for ${product.product_id}: ${error.message}`
      );
    }

    await saveProduct(product, affiliateLink, nameHe, categoryHe);

    // Create the category once, right before the first product needs it.
    if (!categoryCreated) {
      categoryCreated = await ensureCategory(categoryHe);
    }

    await postProductToTelegram(product, affiliateLink, nameHe);

    published.push({
      id: String(product.product_id),
      name: nameHe,
      price: salePrice(product),
      category: categoryHe,
      titleKey: titleKey(product),
      docId: `aliexpress_${product.product_id}`,
    });
  }

  if (!categoryCreated && published.length > 0) {
    categoryCreated = await ensureCategory(categoryHe);
  }

  if (published.length > 0) {
    const keys = published
      .map((item) => item.titleKey)
      .filter(Boolean);
    await rememberTitleKeys(keys, picked.recentTitleKeys);
  }

  console.log(
    `[recommended] published ${published.length} products: ${JSON.stringify(published)}`
  );

  return {
    angle: angle.q,
    category: categoryHe,
    categoryCreated: categoryCreated,
    candidates: candidates.length,
    published: published,
  };
}

module.exports = {
  runRecommendedProducts,
  __test: {
    searchProducts,
    isRecommended,
    mainImage,
    ratingOutOfFive,
    salePrice,
    originalPrice,
    discountPercent,
    scoreProduct,
    extractSpecs,
    headForTranslation,
    cleanTitle,
    hebrewName,
    shortenUrl,
    composeCaption,
    siteProductUrl,
    titleKey,
  },
};
