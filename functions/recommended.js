"use strict";

/**
 * recommended.js
 * ---------------------------------------------------------------
 * Hourly job:
 *   1. picks a different search angle each run (rotation stored in Firestore)
 *   2. searches AliExpress affiliate API
 *   3. keeps only "recommended" products (rating + real sales + image + price + commission)
 *   4. skips products posted in the last 14 days
 *   5. creates the category in /categories if it does not exist yet
 *   6. saves the product to /products (Admin SDK -> bypasses client rules)
 *   7. posts to Telegram: photo + caption, then a detailed text post with a "לקנייה" button
 */

const crypto = require("crypto");
const admin = require("firebase-admin");

const API_URL = "https://api-sg.aliexpress.com/sync";

const ALIEXPRESS_APP_KEY =
  process.env.ALIEXPRESS_APP_KEY || "516306";
const ALIEXPRESS_APP_SECRET =
  process.env.ALIEXPRESS_APP_SECRET || "BaXt8XVfIl2kJhOU10vhgCfwkzYRIjp0";
const ALIEXPRESS_TRACKING_ID =
  process.env.ALIEXPRESS_TRACKING_ID || "find4u_2025";

const TELEGRAM_BOT_TOKEN =
  process.env.TELEGRAM_BOT_TOKEN ||
  "8825712163:AAERjc3Xec0oKwbsuEvT0YPF6P7Ho175Mb0";
const TELEGRAM_CHANNEL = process.env.TELEGRAM_CHANNEL || "@Find4U_official";

const MAX_POSTS_PER_RUN = 5;
const SKIP_DAYS = 14;
const MIN_RATING = 4.3;
const MIN_SALES = 50;
const SEARCH_PAGE_SIZE = 50;

const STATE_DOC = "job_state/recommendedProducts";

// ---- Search angles: one different angle per run -------------------------
const ANGLES = [
  "air purifier",
  "robot vacuum",
  "key finder",
  "baby monitor",
  "smart light",
  "car accessories",
  "massage gun",
  "portable blender",
  "desk organizer",
  "humidifier",
  "garlic press",
  "phone holder",
  "pet bed",
  "cooler bag",
  "ice maker",
  "cable organizer",
  "kitchen gadget",
  "led strip",
  "electric shaver",
  "water bottle",
  "tool set",
  "gaming accessories",
  "yoga mat",
  "solar lamp",
  "hair dryer",
  "coffee grinder",
  "food storage",
  "backpack",
  "watch band",
  "night light"
];

// ---- AliExpress category -> Hebrew label for auto-created categories ----
const CATEGORY_LABELS = {
  "Home Appliances": "מוצרי חשמל לבית",
  "Kitchen,Dining & Bar": "מטבח",
  "Consumer Electronics": "אלקטרוניקה",
  "Computer & Office": "מחשבים ומשרד",
  "Beauty & Health": "יופי ובריאות",
  "Sports & Entertainment": "ספורט ופנאי",
  "Automobiles & Motorcycles": "רכב",
  "Home Improvement": "שיפורי בית",
  "Pet Products": "מוצרים לחיות מחמד",
  "Baby & Kids": "תינוקות וילדים",
  "Mother & Kids": "תינוקות וילדים",
  Jewelry: "תכשיטים",
  Watches: "שעונים",
  "Luggage & Bags": "תיקים",
  Shoes: "הנעלה",
  "Women's Clothing": "אופנת נשים",
  "Men's Clothing": "אופנת גברים",
  "Phones & Telecommunications": "טלפונים",
  "Home & Garden": "בית וגינה",
  Furniture: "רהיטים",
  "Toys & Hobbies": "צעצועים ותחביבים",
  "Office & School Supplies": "ציוד משרדי",
  "Tools": "כלים",
};

function db() {
  return admin.firestore();
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
    throw new Error(`AliExpress returned non-JSON (${response.status}): ${text.slice(0, 300)}`);
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
    target_currency: "USD",
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

async function buildAffiliateLink(sourceUrl) {
  const response = await aliexpressCall("aliexpress.affiliate.link.generate", {
    promotion_link_type: "0",
    source_values: sourceUrl,
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
// Filtering
// ---------------------------------------------------------------------

function toNumber(value) {
  if (value === null || value === undefined) return null;
  const parsed = parseFloat(String(value).replace(/[^\d.\-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function toPercent(value) {
  const parsed = toNumber(value);
  return parsed === null ? 0 : parsed;
}

function isRecommended(product) {
  const price = toNumber(product.target_sale_price);
  const rating = toNumber(product.evaluate_rate);
  const sales = toNumber(product.lastest_volume);
  const commission = toPercent(product.commission_rate);

  if (!product.image_url) return false;
  if (!product.product_id) return false;
  if (price === null || price <= 0) return false;
  if (rating === null || rating < MIN_RATING) return false;
  if (sales === null || sales < MIN_SALES) return false;
  if (commission <= 0) return false;
  return true;
}

function scoreProduct(product) {
  const rating = toNumber(product.evaluate_rate) || 0;
  const sales = toNumber(product.lastest_volume) || 0;
  const commission = toPercent(product.commission_rate);
  return rating * 100 + Math.log10(sales + 1) * 40 + commission * 2;
}

function categoryNameFor(product) {
  const raw =
    product.second_level_category_name || product.first_level_category_name;
  if (!raw) return "מוצרים מומלצים";
  const cleaned = String(raw).trim();
  return CATEGORY_LABELS[cleaned] || cleaned;
}

// ---------------------------------------------------------------------
// Telegram
// ---------------------------------------------------------------------

function formatPrice(value) {
  return value === null ? "" : `$${value.toFixed(2)}`;
}

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

async function postProductToTelegram(product, affiliateLink, categoryName) {
  const title = product.product_title || "מוצר מומלץ";
  const price = toNumber(product.target_sale_price);
  const originalPrice = toNumber(product.target_original_price);
  const rating = toNumber(product.evaluate_rate);
  const sales = toNumber(product.lastest_volume);
  const discount = product.discount ? String(product.discount).trim() : "";

  const captionLines = [
    title,
    "",
    `מחיר: ${formatPrice(price)}`,
    discount ? `הנחה: ${discount}` : "",
    `קטגוריה: ${categoryName}`,
  ].filter((line) => line !== "");

  await telegramRequest("sendPhoto", {
    chat_id: TELEGRAM_CHANNEL,
    photo: product.image_url,
    caption: captionLines.join("\n"),
  });

  const detailLines = [
    title,
    "",
    `מחיר מבצע: ${formatPrice(price)}`,
    originalPrice && price && originalPrice > price
      ? `מחיר רגיל: ${formatPrice(originalPrice)}`
      : "",
    discount ? `הנחה: ${discount}` : "",
    rating ? `דירוג: ${rating.toFixed(1)} מתוך 5` : "",
    sales ? `מכירות: ${sales.toLocaleString("he-IL")}` : "",
    `קטגוריה: ${categoryName}`,
    "",
    "מוצר מומלץ עם דירוג גבוה ומכירות גבוהות. משלוח לישראל.",
  ].filter((line) => line !== "");

  await telegramRequest("sendMessage", {
    chat_id: TELEGRAM_CHANNEL,
    text: detailLines.join("\n"),
    disable_web_page_preview: true,
    reply_markup: affiliateLink
      ? {
        inline_keyboard: [
          [{text: "לקנייה באתר", url: affiliateLink}],
        ],
      }
      : undefined,
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

async function saveProduct(product, affiliateLink, categoryName) {
  const id = `aliexpress_${product.product_id}`;
  const docRef = db().collection("products").doc(id);
  const existing = await docRef.get();

  const price = toNumber(product.target_sale_price);
  const originalPrice = toNumber(product.target_original_price);
  const rating = toNumber(product.evaluate_rate);
  const sales = toNumber(product.lastest_volume);

  const description = [
    `מוצר מומלץ מקטגוריית ${categoryName}.`,
    rating ? `דירוג ${rating.toFixed(1)} מתוך 5.` : "",
    sales ? `מעל ${sales.toLocaleString("he-IL")} מכירות.` : "",
    "משלוח לישראל.",
  ]
    .filter(Boolean)
    .join(" ");

  const data = {
    name: product.product_title || "מוצר מומלץ",
    description: description,
    link: affiliateLink || product.product_detail_url || "",
    price: price,
    category: [categoryName],
    image: product.image_url || "",
    gallery: product.image_url ? [product.image_url] : [],
    videos: [],
    updatedAt: new Date().toISOString(),
    source: "aliexpress",
    sourceId: String(product.product_id),
    originalPrice: originalPrice,
    currency: "USD",
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

  const available = ANGLES.filter((angle) => !recent.includes(angle));
  const chosen = available.length > 0 ? available[0] : ANGLES[0];

  const nextRecent = [chosen].concat(recent).slice(0, 10);
  await stateRef.set(
    {
      recentAngles: nextRecent,
      lastRunAt: admin.firestore.FieldValue.serverTimestamp(),
      lastAngle: chosen,
    },
    {merge: true}
  );

  return chosen;
}

// ---------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------

async function runRecommendedProducts() {
  const angle = await pickAngle();
  console.log(`[recommended] angle for this run: ${angle}`);

  const products = await searchProducts(angle);
  console.log(`[recommended] ${products.length} products returned`);

  const candidates = products
    .filter(isRecommended)
    .sort((a, b) => scoreProduct(b) - scoreProduct(a));

  console.log(`[recommended] ${candidates.length} products passed the filter`);

  const published = [];

  for (const product of candidates) {
    if (published.length >= MAX_POSTS_PER_RUN) break;

    if (await wasPostedRecently(product.product_id)) continue;

    const categoryName = categoryNameFor(product);
    const categoryCreated = await ensureCategory(categoryName);

    let affiliateLink = null;
    try {
      affiliateLink = await buildAffiliateLink(product.product_detail_url);
    } catch (error) {
      console.error(
        `[recommended] link generation failed for ${product.product_id}: ${error.message}`
      );
    }

    await saveProduct(product, affiliateLink, categoryName);
    await postProductToTelegram(product, affiliateLink, categoryName);

    published.push({
      id: product.product_id,
      name: product.product_title,
      category: categoryName,
      categoryCreated: categoryCreated,
    });
  }

  console.log(
    `[recommended] published ${published.length} products: ${JSON.stringify(published)}`
  );

  return {
    angle: angle,
    candidates: candidates.length,
    published: published,
  };
}

module.exports = {runRecommendedProducts};
