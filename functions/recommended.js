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

// חנויות מועדפות: מזהי חנות (shop_id) של אליאקספרס, מופרדים בפסיק במשתנה
// הסביבה PREFERRED_SHOP_IDS. ל-API אין סינון לפי חנות, לכן הבוט מדרג את
// המוצרים של החנויות האלה גבוה יותר ומעדיף אותם כשיש כאלה.
const PREFERRED_SHOP_IDS = String(process.env.PREFERRED_SHOP_IDS || "")
  .split(/[,\s]+/)
  .map((id) => id.trim())
  .filter(Boolean);

const MAX_POSTS_PER_RUN = 5;
// כל ריצה שולפת כמה זוויות חיפוש שונות, ולא חמישה מוצרים מאותה קטגוריה.
const ANGLES_PER_RUN = 3;
const MAX_PER_ANGLE = 2;
const SKIP_DAYS = 14;
const MIN_RATING = 4.5;
const MIN_SALES = 300;
const SEARCH_PAGE_SIZE = 50;

const STATE_DOC = "job_state/recommendedProducts";
const TRANSLATION_CACHE = "translation_cache";

// ---- Search angles: one different angle per run -------------------------
// q = the English query sent to AliExpress, he = the Hebrew category name.
const ANGLES = [
  {
    q: "air purifier",
    he: "מטהרי אוויר",
    // "מטהר" למקרר או לרכב הוא לא מטהר אוויר לבית.
    exclude: /\b(refrigerator|fridge|car\s*purifier|humidifier|shoe\s*box)\b/i,
  },
  {
    q: "robot vacuum",
    he: "שואבי אבק רובוטיים",
    // החיפוש מחזיר גם שואבי רכב וחלקי חילוף, ולכן מסננים אותם במפורש.
    exclude: /\b(car\s*vacuum|handheld|window\s+clean|dust\s*bag|side\s*brush|mop\s*pad)/i,
  },
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

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/["'׳״]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function slugFor(nameHe, productId) {
  const base = slugify(nameHe);
  const suffix = String(productId).slice(-6);
  return base ? `${base}-${suffix}` : `aliexpress-${suffix}`;
}

function siteProductUrl(slug) {
  return `${SITE_URL}/product/${encodeURIComponent(slug)}`;
}

function shekels(value) {
  if (value === null || value === undefined) return "";
  return `${value.toFixed(2)} ₪`;
}

function imageUrl(value) {
  const url = String(value || "").trim();
  if (!url) return "";
  if (url.startsWith("//")) return `https:${url}`;
  return url.replace(/^http:\/\//, "https://");
}

function smallImages(product) {
  const small = product.product_small_image_urls;
  if (!small) return [];
  if (Array.isArray(small)) return small;
  if (Array.isArray(small.string)) return small.string;
  if (typeof small.string === "string") return [small.string];
  return [];
}

function mainImage(product) {
  if (product.product_main_image_url) {
    return imageUrl(product.product_main_image_url);
  }

  const first = smallImages(product)[0];
  if (first) return imageUrl(first);

  return imageUrl(product.image_url);
}

// כל תמונות המוצר: הראשית ואחריה כל התמונות שהחיפוש מחזיר.
function galleryImages(product) {
  const all = [mainImage(product)]
    .concat(smallImages(product).map(imageUrl))
    .filter(Boolean);
  return [...new Set(all)].slice(0, 9);
}

// קישור לסרטון המוצר, אם המוכר העלה כזה. ה-API מחזיר אותו בשדה
// product_video_url, ולפעמים בתוך ae_multimedia_info_dto.
function productVideoUrl(product) {
  const direct = imageUrl(product.product_video_url);
  if (direct) return direct;

  const media = product.ae_multimedia_info_dto;
  if (!media) return "";

  if (typeof media.video_urls === "string") {
    const first = media.video_urls.split(";")[0];
    if (first) return imageUrl(first);
  }
  if (Array.isArray(media.video_urls) && media.video_urls.length > 0) {
    return imageUrl(media.video_urls[0]);
  }
  return "";
}

// מזהה החנות של המוכר. ה-API מחזיר אותו בשמות שונים בין המתודות,
// ולפעמים רק בתוך כתובת החנות.
function shopIdOf(product) {
  if (!product) return "";

  const direct = product.shop_id || product.seller_id || product.store_id;
  if (direct) return String(direct).trim();

  const info = product.store_info;
  if (info && (info.store_id || info.shop_id)) {
    return String(info.store_id || info.shop_id).trim();
  }

  const url = String(product.shop_url || product.store_url || "");
  const match = url.match(/\/(?:store|shop)\/(\d+)/i) || url.match(/(\d{6,})/);
  return match ? match[1] : "";
}

function isPreferredShop(product) {
  if (PREFERRED_SHOP_IDS.length === 0) return false;
  const id = shopIdOf(product);
  return Boolean(id) && PREFERRED_SHOP_IDS.includes(id);
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

async function productDetails(ids) {
  const response = await aliexpressCall(
    "aliexpress.affiliate.productdetail.get",
    {
      product_ids: ids.join(","),
      target_currency: "ILS",
      target_language: "EN",
      ship_to_country: "IL",
      tracking_id: ALIEXPRESS_TRACKING_ID,
    }
  );

  const result =
    response.aliexpress_affiliate_productdetail_get_response &&
    response.aliexpress_affiliate_productdetail_get_response.resp_result;
  const products = result && result.result && result.result.products;
  const list = products && products.product;
  if (Array.isArray(list)) return list;
  return list ? [list] : [];
}

// ממלא גלריה וסרטון למוצרים ותיקים שנוצרו כשהיה רק תמונה אחת.
// ה-API מקבל עד 50 מזהים בקריאה, ולכן עובדים בקבוצות.
async function refreshMissingGalleries({limit = 300, batchSize = 50} = {}) {
  const snapshot = await db().collection("products").limit(limit).get();
  const pending = snapshot.docs.filter((doc) => {
    const gallery = doc.get("gallery");
    const hasGallery = Array.isArray(gallery) && gallery.length >= 2;
    return !hasGallery || !doc.get("videoUrl");
  });

  console.log(
    `[galleries] scanned ${snapshot.size}, need refresh: ${pending.length}`
  );

  let updated = 0;

  for (let start = 0; start < pending.length; start += batchSize) {
    const batch = pending.slice(start, start + batchSize);
    const ids = batch
      .map((doc) => String(doc.get("sourceId") || "").trim())
      .filter(Boolean);
    if (ids.length === 0) continue;

    let details = [];
    try {
      details = await productDetails(ids);
    } catch (error) {
      console.error(
        `[galleries] detail call failed (${start}-${start + ids.length}): ${error.message}`
      );
      continue;
    }

    const byId = new Map(
      details.map((item) => [String(item.product_id), item])
    );

    for (const doc of batch) {
      const sourceId = String(doc.get("sourceId") || "");
      const detail = byId.get(sourceId);
      if (!detail) continue;

      const gallery = galleryImages(detail);
      const video = productVideoUrl(detail);
      if (gallery.length < 2 && !video) continue;

      const data = {updatedAt: new Date().toISOString()};
      if (gallery.length > 1) {
        data.image = gallery[0];
        data.gallery = gallery;
      }
      if (video) data.videoUrl = video;

      await doc.ref.set(data, {merge: true});
      updated += 1;
    }
  }

  console.log(`[galleries] updated ${updated} products`);
  return {scanned: snapshot.size, pending: pending.length, updated: updated};
}

// ---------------------------------------------------------------------
// Availability: hide products that AliExpress no longer sells
// ---------------------------------------------------------------------

// דירוג של מוצר חלופי: דירוג גבוה, מכירות אמיתיות והנחה — כמו בחירת המוצרים.
function availabilityScore(doc) {
  const rating = toNumber(doc.get("rating")) || 0;
  const sales = toNumber(doc.get("sales")) || 0;
  const discount = toNumber(doc.get("discountPercent")) || 0;
  return rating * 2 + Math.log10(sales + 1) + discount / 20;
}

// מוצר חלופי: אותו מוצר מבחינת קטגוריה, שעדיין זמין ויש לו קישור לרכישה.
function replacementFor(doc, pool) {
  const categories = []
    .concat(doc.get("category") || [])
    .map((name) => String(name).trim())
    .filter(Boolean);

  const candidates = pool.filter((other) => {
    if (other.id === doc.id) return false;
    if (!other.get("link") || !other.get("slug")) return false;
    const otherCategories = []
      .concat(other.get("category") || [])
      .map((name) => String(name).trim());
    return categories.some((name) => otherCategories.includes(name));
  });

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => availabilityScore(b) - availabilityScore(a));
  const best = candidates[0];
  return {
    id: best.id,
    slug: best.get("slug"),
    name: best.get("name") || "",
    url: siteProductUrl(best.get("slug")),
    link: best.get("link") || "",
  };
}

/**
 * בודק אילו מוצרים בקטלוג עדיין קיימים באליאקספרס.
 * מוצר שלא חוזר מקריאת productdetail.get מסומן unavailable (האתר מסתיר אותו
 * ומציע מוצר חלופי), והפוסטים שלו ביוטיוב מקבלים את הלינק החלופי.
 * אם המוצר חוזר להיות זמין — הסימון מוסר אוטומטית.
 */
async function checkProductAvailability({limit = 300, batchSize = 50} = {}) {
  const snapshot = await db()
    .collection("products")
    .orderBy("postedAt", "desc")
    .limit(limit)
    .get();

  const docs = snapshot.docs.filter((doc) =>
    String(doc.get("sourceId") || "").trim()
  );
  const bySourceId = new Map(
    docs.map((doc) => [String(doc.get("sourceId")).trim(), doc])
  );
  const ids = [...bySourceId.keys()];

  const gone = new Set();
  const alive = new Set();

  for (let start = 0; start < ids.length; start += batchSize) {
    const batch = ids.slice(start, start + batchSize);
    let details = [];
    try {
      details = await productDetails(batch);
    } catch (error) {
      console.error(
        `[availability] detail call failed (${start}-${start + batch.length}): ${error.message}`
      );
      continue;
    }

    const returned = new Set(
      details.map((item) => String((item && item.product_id) || "")).filter(Boolean)
    );

    // תשובה ריקה על קבוצה שלמה היא כמעט תמיד תקלה זמנית, לא מחיקה של הכול.
    if (returned.size === 0) {
      console.warn(
        `[availability] empty answer for ${batch.length} products — skipped this batch`
      );
      continue;
    }

    batch.forEach((id) => {
      if (returned.has(id)) alive.add(id);
      else gone.add(id);
    });
  }

  console.log(
    `[availability] checked ${ids.length}, alive ${alive.size}, missing ${gone.size}`
  );

  const now = new Date().toISOString();
  // החלופה חייבת להיות מוצר שעדיין קיים — לא מוצר אחר שנמחק באותה ריצה.
  const pool = snapshot.docs.filter(
    (doc) =>
      !doc.get("unavailable") &&
      doc.get("link") &&
      alive.has(String(doc.get("sourceId") || "").trim())
  );
  const hidden = [];
  const restored = [];
  let telegramRemoved = 0;

  for (const sourceId of gone) {
    const doc = bySourceId.get(sourceId);
    if (!doc || doc.get("unavailable")) continue;

    const replacement = replacementFor(doc, pool);
    const update = {
      unavailable: true,
      unavailableAt: now,
      lastCheckedAt: now,
    };
    if (replacement) {
      update.replacementId = replacement.id;
      update.replacementSlug = replacement.slug;
      update.replacementName = replacement.name;
      update.replacementUrl = replacement.url;
      update.replacementLink = replacement.link;
    }

    await doc.ref.set(update, {merge: true});

    // כל סרטון יוטיוב שמפנה למוצר הזה יקבל את הלינק החלופי בתגובות.
    try {
      const links = await db()
        .collection("videoLinks")
        .where("productId", "==", doc.id)
        .get();
      for (const link of links.docs) {
        await link.ref.set(
          {
            broken: true,
            brokenAt: now,
            replacementSlug: replacement ? replacement.slug : null,
            replacementUrl: replacement ? replacement.url : null,
            replacementLink: replacement ? replacement.link : null,
          },
          {merge: true}
        );
      }
    } catch (error) {
      console.error(
        `[availability] videoLinks update failed for ${doc.id}: ${error.message}`
      );
    }

    // פוסטים בטלגרם אפשר למחוק רק אם הם צעירים מ־48 שעות; הישנים נשארים.
    const messageIds = Array.isArray(doc.get("telegramMessageIds"))
      ? doc.get("telegramMessageIds")
      : [];
    for (const messageId of messageIds) {
      try {
        await telegramRequest("deleteMessage", {
          chat_id: TELEGRAM_CHANNEL,
          message_id: messageId,
        });
        telegramRemoved += 1;
      } catch (error) {
        console.warn(
          `[availability] telegram message ${messageId} not deleted (probably older than 48h): ${error.message}`
        );
      }
    }

    hidden.push({
      id: doc.id,
      name: doc.get("name"),
      replacement: replacement ? replacement.slug : null,
    });
  }

  // מוצר שחזר להופיע ב-API — מסירים ממנו את סימון החוסר.
  for (const sourceId of alive) {
    const doc = bySourceId.get(sourceId);
    if (!doc || !doc.get("unavailable")) continue;

    const cleared = {
      unavailable: false,
      restoredAt: now,
      lastCheckedAt: now,
      replacementId: admin.firestore.FieldValue.delete(),
      replacementSlug: admin.firestore.FieldValue.delete(),
      replacementName: admin.firestore.FieldValue.delete(),
      replacementUrl: admin.firestore.FieldValue.delete(),
      replacementLink: admin.firestore.FieldValue.delete(),
      unavailableAt: admin.firestore.FieldValue.delete(),
    };
    await doc.ref.set(cleared, {merge: true});
    restored.push({id: doc.id, name: doc.get("name")});
  }

  if (hidden.length > 0) {
    console.log(`[availability] hidden: ${JSON.stringify(hidden)}`);
  }
  if (restored.length > 0) {
    console.log(`[availability] restored: ${JSON.stringify(restored)}`);
  }

  return {
    checked: ids.length,
    alive: alive.size,
    missing: gone.size,
    hidden: hidden.length,
    restored: restored.length,
    telegramRemoved: telegramRemoved,
  };
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

// שמות מוצרים שנשאבו מכותרת ארוכה חוזרים על אותה מילה פעמיים
// ("תרסיס ננו לפנים תרסיס ננו נייד לפנים"). משאירים מופע אחד לכל מילה.
const DUPLICATE_WHITELIST = new Set(["של", "עם", "את", "על", "אל", "זה"]);

function dedupeRepeatedWords(text) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const seen = new Set();
  const out = [];

  words.forEach((word) => {
    const key = word.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
    if (!key) {
      out.push(word);
      return;
    }
    if (seen.has(key) && key.length > 2 && !DUPLICATE_WHITELIST.has(key)) return;
    seen.add(key);
    out.push(word);
  });

  return out.join(" ").trim();
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

  return dedupeRepeatedWords([prefix, body].filter(Boolean).join(" ").trim());
}

// ---------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------

// חלקי חילוף ואביזרים לא שייכים לקטגוריה של המוצר עצמו, והם מה שהציג
// "שואב אבק רובוטי" ב־9 שקלים. מסננים אותם לפי הכותרת.
const ACCESSORY_TITLE =
  /^(for\s)|\b(replacement|spare\s+parts?|accessor(?:y|ies)|compatible\s+with|dust\s*bags?|side\s*brush|main\s*brush|roller\s*brush|mop\s*pads?|mop\s*cloths?|filter\s*cartridge|refill)\b/i;

function isAccessoryListing(product) {
  const title = String(product.product_title || "").trim();
  return ACCESSORY_TITLE.test(title);
}

// החיפוש של אליאקספרס מחזיר גם דברים שלא קשורים לזווית ("שואב רכב" תחת
// שואב רובוטי). מוצר נחשב רלוונטי אם כל מילות החיפוש מופיעות בכותרת.
const QUERY_STOPWORDS = new Set(["for", "the", "and", "with"]);

function matchesQuery(product, query) {
  const words = String(query || "")
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 2 && !QUERY_STOPWORDS.has(word));
  if (words.length === 0) return true;

  const title = String(product.product_title || "").toLowerCase();
  return words.every((word) => title.includes(word));
}

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
  if (isAccessoryListing(product)) return false;
  return true;
}

function scoreProduct(product) {
  const rating = ratingOutOfFive(product) || 0;
  const sales = toNumber(product.lastest_volume) || 0;
  const commission = toPercent(product.commission_rate);
  const price = salePrice(product) || 0;
  // כמעט כל המוצרים בדירוג 4.9, ולכן דירוג לבדו לא מבדיל ביניהם. מכירות
  // ועמלה הם מה שמפריד בין המוצר שבאמת נמכר לבין עוד אחד כזה.
  return (rating - MIN_RATING) * 150 +
    Math.log10(sales + 1) * 100 +
    commission * 2 +
    Math.min(price, 800) * 0.05 +
    // מוצר מחנות מועדפת מקבל עדיפות, אבל לא עוקף מוצר חזק ממנו.
    (isPreferredShop(product) ? 80 : 0);
}

// אותה כותרת עם מילים אחרות = אותו מוצר. משווים מילים משמעותיות בלבד.
const TITLE_STOPWORDS = new Set([
  "the", "and", "with", "for", "new", "hot", "sale", "free", "shipping",
  "inch", "pcs", "set", "plus", "pro", "max", "mini", "smart", "best",
]);

function titleTokens(title) {
  return new Set(
    String(title || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]+/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2 && !TITLE_STOPWORDS.has(word))
  );
}

function similarTitles(first, second) {
  const a = titleTokens(first);
  const b = titleTokens(second);
  if (a.size === 0 || b.size === 0) return false;

  let shared = 0;
  a.forEach((word) => {
    if (b.has(word)) shared += 1;
  });

  const union = a.size + b.size - shared;
  return union > 0 && shared / union >= 0.45;
}

// בוחרים מוצרים מגוונים: לא יותר משני מוצרים מאותה חנות, לא יותר משניים
// מאותה זווית חיפוש, ובלי שני מוצרים שהם למעשה אותו מוצר.
function pickDiverse(candidates, limit) {
  const picked = [];
  const perShop = new Map();
  const perAngle = new Map();

  for (const item of candidates) {
    if (picked.length >= limit) break;

    const shop = item.shopId || "";
    const angleKey = item.angle.q;
    const shopCap = picked.length < limit / 2 ? 1 : 2;

    if (shop && (perShop.get(shop) || 0) >= shopCap) continue;
    if ((perAngle.get(angleKey) || 0) >= MAX_PER_ANGLE) continue;
    if (picked.some((other) => similarTitles(other.title, item.title))) continue;

    picked.push(item);
    if (shop) perShop.set(shop, (perShop.get(shop) || 0) + 1);
    perAngle.set(angleKey, (perAngle.get(angleKey) || 0) + 1);
  }

  return picked;
}

// ---------------------------------------------------------------------
// Telegram
// ---------------------------------------------------------------------

// טלגרם מחזיר 429 ("Too Many Requests: retry after N") כשהוא מקבל יותר
// מדי בקשות, וזה מה שהפיל ריצות הורליות שלמות. מנסים שוב אחרי ההמתנה
// שהוא מבקש, ורק אז נכשלים.
async function telegramRequest(method, body, attempt = 1) {
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
    const retryAfter = Number(json.parameters && json.parameters.retry_after);
    const transient = response.status === 429 || response.status >= 500;
    if (transient && attempt < 3) {
      const wait = (Number.isFinite(retryAfter) ? retryAfter : 5) * 1000 * attempt;
      console.log(
        `[telegram] ${method} ${response.status} — retry in ${Math.round(wait / 1000)}s`
      );
      await new Promise((resolve) => setTimeout(resolve, Math.min(wait, 45000)));
      return telegramRequest(method, body, attempt + 1);
    }
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

// כל הפוסטים בטלגרם עוברים דרך deals.js, כדי שכולם ייראו אותו דבר:
// שם מוצר לחיץ, מחיר עם פס, אימוג'ים, BUY NOW וקישור s.click.aliexpress.com.
// ה-require כאן ולא בראש הקובץ כי deals.js עצמו דורש את הקובץ הזה.
function dealFieldsOf(product, affiliateLink, nameHe, slug) {
  return {
    name: nameHe,
    price: salePrice(product),
    originalPrice: originalPrice(product),
    discountPercent: discountPercent(product) || 0,
    sales: toNumber(product.lastest_volume) || 0,
    rating: ratingOutOfFive(product) || 0,
    // הקישור של אליאקספרס (s.click) מוצג כמו שהוא — לא עוטפים ב-tinyurl.
    link: affiliateLink || "",
    site: slug ? siteProductUrl(slug) : "",
  };
}

async function postProductToTelegram(
  product,
  affiliateLink,
  nameHe,
  slug,
  signature
) {
  const {dealMessage} = require("./deals");
  const {caption, keyboard} = dealMessage(
    dealFieldsOf(product, affiliateLink, nameHe, slug),
    {signature}
  );
  const reply_markup =
    keyboard.length > 0 ? {inline_keyboard: keyboard} : undefined;

  // מוצר עם סרטון של המוכר: הסרטון נשלח עם אותו כיתוב ואותם כפתורים.
  // אם טלגרם לא מצליחה למשוך את הסרטון — נופלים לתמונה.
  const video = productVideoUrl(product);
  if (video) {
    try {
      const message = await telegramRequest("sendVideo", {
        chat_id: TELEGRAM_CHANNEL,
        video,
        caption,
        parse_mode: "HTML",
        supports_streaming: true,
        reply_markup,
      });
      if (message && message.message_id) return [message.message_id];
    } catch (error) {
      console.error(
        `[recommended] video post failed for ${product.product_id}: ${error.message}`
      );
    }
  }

  const message = await telegramRequest("sendPhoto", {
    chat_id: TELEGRAM_CHANNEL,
    photo: mainImage(product),
    caption,
    parse_mode: "HTML",
    reply_markup,
  });

  // מחזירים את מזהי ההודעות כדי שאפשר יהיה למחוק פוסט של מוצר שנמחק.
  return message && message.message_id ? [message.message_id] : [];
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

async function saveProduct(product, affiliateLink, nameHe, categoryHe, slug) {
  const id = `aliexpress_${product.product_id}`;
  const docRef = db().collection("products").doc(id);
  const existing = await docRef.get();

  const price = salePrice(product);
  const original = originalPrice(product);
  const discount = discountPercent(product);
  const rating = ratingOutOfFive(product);
  const sales = toNumber(product.lastest_volume);

  // אם המחיר ירד מאז הריצה הקודמת — שומרים את המחיר הקודם, כדי שהאתר
  // יציג תג "המחיר ירד" ויתריע למי ששמר את המוצר.
  const previousPrice = existing.exists ? toNumber(existing.get("price")) : null;
  const priceDroppedNow =
    previousPrice !== null && price !== null && previousPrice > price + 0.009;

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
    slug: slug,
    description: description,
    link: affiliateLink || product.product_detail_url || "",
    price: price,
    currency: "ILS",
    category: [categoryHe],
    image: mainImage(product),
    gallery: galleryImages(product),
    videos: [],
    videoUrl: productVideoUrl(product),
    updatedAt: new Date().toISOString(),
    source: "aliexpress",
    sourceId: String(product.product_id),
    sourceTitle: product.product_title || "",
    sourceCategory: product.second_level_category_name || "",
    titleKey: titleKey(product),
    originalPrice: original,
    ...(priceDroppedNow ? {previousPrice: previousPrice} : {}),
    discountPercent: discount,
    rating: rating,
    sales: sales,
    commissionRate: toPercent(product.commission_rate),
    shopId: shopIdOf(product) || null,
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

function angleKey(query) {
  return String(query || "").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
}

async function categoryProductCount(name) {
  try {
    const snapshot = await db()
      .collection("products")
      .where("category", "array-contains", name)
      .count()
      .get();
    return snapshot.data().count;
  } catch (error) {
    return 0;
  }
}

// ציון זווית: כמה מהמועמדים שלה באמת פורסמו, כמה מכירות יש להם,
// ובונוס לקטגוריה ריקה כדי שלא יישארו קטגוריות בלי מוצרים.
function angleScore(stats) {
  const candidates = Number(stats.candidates) || 0;
  const published = Number(stats.published) || 0;
  const sales = Number(stats.sales) || 0;
  const rate = candidates > 0 ? published / candidates : 0.55;
  const demand = Math.min(sales / 500000, 0.3);
  return rate * 0.7 + demand;
}

async function pickAngles(count) {
  const stateRef = db().doc(STATE_DOC);
  const state = await stateRef.get();
  const recent = (state.exists && state.get("recentAngles")) || [];
  const angleStats = (state.exists && state.get("angleStats")) || {};
  const recentTitleKeys =
    (state.exists && state.get("recentTitleKeys")) || [];

  // לא חוזרים על ארבע הזוויות האחרונות, אבל אם נגמרו — מתחילים מחדש.
  const recentSet = new Set(recent.slice(0, 4));
  const pool = ANGLES.filter((angle) => !recentSet.has(angle.q));
  const candidatesPool = pool.length >= count ? pool : ANGLES;

  const counts = await Promise.all(
    candidatesPool.map((angle) => categoryProductCount(angle.he))
  );

  const scored = candidatesPool.map((angle, index) => {
    const stats = angleStats[angleKey(angle.q)] || {};
    const count = counts[index];
    const emptiness = count === 0 ? 0.3 : count < 3 ? 0.15 : 0;
    return {
      angle: angle,
      score: angleScore(stats) + emptiness,
      productCount: count,
    };
  });

  scored.sort((a, b) => b.score - a.score);

  // לא שתי זוויות לאותה קטגוריה, אחרת שוב מקבלים שורה של אותו דבר.
  const chosen = [];
  const usedCategories = new Set();
  for (const item of scored) {
    if (chosen.length >= count) break;
    if (usedCategories.has(item.angle.he)) continue;
    usedCategories.add(item.angle.he);
    chosen.push(item.angle);
  }

  const nextRecent = chosen
    .map((angle) => angle.q)
    .concat(recent)
    .slice(0, 10);
  await stateRef.set(
    {
      recentAngles: nextRecent,
      lastRunAt: admin.firestore.FieldValue.serverTimestamp(),
      lastAngle: chosen[0] ? chosen[0].q : null,
    },
    {merge: true}
  );

  console.log(
    `[recommended] angle scores: ${JSON.stringify(
      scored.slice(0, 6).map((item) => ({
        q: item.angle.q,
        score: Number(item.score.toFixed(3)),
        products: item.productCount,
      }))
    )}`
  );

  return {angles: chosen, recentTitleKeys: recentTitleKeys};
}

async function rememberAngleStats(angle, candidateCount, publishedCount, salesSum) {
  const stateRef = db().doc(STATE_DOC);
  const state = await stateRef.get();
  const stats = Object.assign({}, (state.exists && state.get("angleStats")) || {});
  const key = angleKey(angle.q);
  const current = stats[key] || {};

  stats[key] = {
    category: angle.he,
    runs: (Number(current.runs) || 0) + 1,
    candidates: (Number(current.candidates) || 0) + candidateCount,
    published: (Number(current.published) || 0) + publishedCount,
    sales: (Number(current.sales) || 0) + salesSum,
    lastRunAt: new Date().toISOString(),
  };

  await stateRef.set({angleStats: stats}, {merge: true});
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
  const picked = await pickAngles(ANGLES_PER_RUN);
  const angles = picked.angles;
  const recentTitleKeys = new Set(picked.recentTitleKeys);
  console.log(
    `[recommended] angles for this run: ${angles
      .map((angle) => `${angle.q} (${angle.he})`)
      .join(", ")}`
  );

  // אוספים מועמדים מכל הזוויות, ואז בוחרים מתוכם את המגוון הטוב ביותר.
  const seenIds = new Set();
  const seenKeys = new Set();
  const candidates = [];
  const perAngleCandidates = new Map();

  for (const angle of angles) {
    let products = [];
    try {
      products = await searchProducts(angle.q);
    } catch (error) {
      console.error(
        `[recommended] search failed for ${angle.q}: ${error.message}`
      );
      continue;
    }

    const relevant = products.filter((product) => matchesQuery(product, angle.q));
    const pool = relevant.length > 0 ? relevant : products;
    console.log(
      `[recommended] ${angle.q}: ${products.length} returned, ${relevant.length} relevant`
    );

    // מדפיס את החנויות הנפוצות בתוצאות, כדי שאפשר יהיה להעתיק מזהי חנות
    // אמיתיים ל-PREFERRED_SHOP_IDS.
    const shopCounts = new Map();
    products.forEach((product) => {
      const id = shopIdOf(product);
      if (!id) return;
      shopCounts.set(id, (shopCounts.get(id) || 0) + 1);
    });
    const topShops = [...shopCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
    console.log(
      `[recommended] ${angle.q} top shops: ${JSON.stringify(topShops)} | preferred: ${
        PREFERRED_SHOP_IDS.length > 0 ? PREFERRED_SHOP_IDS.join(",") : "(empty)"
      }`
    );

    const good = pool
      .filter((product) => {
        if (isRecommended(product)) return true;
        return false;
      })
      .filter((product) => {
        if (angle.exclude && angle.exclude.test(String(product.product_title || ""))) {
          return false;
        }

        const id = String(product.product_id);
        if (seenIds.has(id)) return false;
        seenIds.add(id);

        // Same item, different seller: skip it.
        const key = titleKey(product);
        if (key && (seenKeys.has(key) || recentTitleKeys.has(key))) return false;
        if (key) seenKeys.add(key);

        return true;
      })
      .map((product) => ({
        product: product,
        angle: angle,
        shopId: shopIdOf(product),
        title: String(product.product_title || ""),
        score: scoreProduct(product),
      }))
      .sort((a, b) => b.score - a.score);

    perAngleCandidates.set(angle.q, good.length);
    candidates.push(...good);
  }

  candidates.sort((a, b) => b.score - a.score);
  const shortlist = pickDiverse(candidates, MAX_POSTS_PER_RUN * 3);

  console.log(
    `[recommended] ${candidates.length} candidates passed the filter, ${shortlist.length} on the shortlist`
  );
  console.log(
    `[recommended] shortlist: ${JSON.stringify(
      shortlist.map((item) => ({
        score: Number(item.score.toFixed(1)),
        shop: item.shopId || null,
        category: item.angle.he,
        title: item.title.slice(0, 60),
      }))
    )}`
  );

  const published = [];
  const categoriesCreated = [];

  for (const item of shortlist) {
    if (published.length >= MAX_POSTS_PER_RUN) break;

    const product = item.product;
    const angle = item.angle;
    const categoryHe = angle.he;

    if (await wasPostedRecently(product.product_id)) continue;

    const nameHe = await hebrewName(product);
    const slug = slugFor(nameHe, product.product_id);

    let affiliateLink = null;
    try {
      affiliateLink = await buildAffiliateLink(product);
    } catch (error) {
      console.error(
        `[recommended] link generation failed for ${product.product_id}: ${error.message}`
      );
    }

    await saveProduct(product, affiliateLink, nameHe, categoryHe, slug);

    if (await ensureCategory(categoryHe)) {
      categoriesCreated.push(categoryHe);
    }

    // מוצר שנשמר אבל לא עלה לטלגרם לא אמור להפיל את כל הריצה.
    try {
      const socials = require("./socials");
      const telegramSignature = await socials.signature({
        skip: ["telegram"],
        style: "html",
      });
      const messageIds = await postProductToTelegram(
        product,
        affiliateLink,
        nameHe,
        slug,
        telegramSignature
      );
      if (Array.isArray(messageIds) && messageIds.length > 0) {
        await db()
          .collection("products")
          .doc(`aliexpress_${product.product_id}`)
          .set({telegramMessageIds: messageIds}, {merge: true});
      }
    } catch (error) {
      console.error(
        `[recommended] telegram post failed for ${product.product_id}: ${error.message}`
      );
    }

    // אותו מוצר עולה גם לדף הפייסבוק — פוסט עם כל הפרטים + תגובה ראשונה
    // של הדף עם אותם פרטים. כישלון בפייסבוק לא מפיל את המוצר.
    try {
      const facebook = require("./facebook");
      const socials = require("./socials");
      const {dealMessage} = require("./deals");
      const signature = await socials.signature({skip: ["facebook"]});
      const text = dealMessage(
        dealFieldsOf(product, affiliateLink, nameHe, slug),
        {format: "text", signature}
      ).caption;
      const post = await facebook.publish({
        message: text,
        comment: text,
        image: mainImage(product),
        link: affiliateLink,
      });
      if (post.ok) {
        await db()
          .collection("products")
          .doc(`aliexpress_${product.product_id}`)
          .set({facebookPostIds: [post.id]}, {merge: true});
        console.log(`[recommended] facebook post ${post.id}`);
      } else {
        console.warn(`[recommended] facebook skipped: ${post.reason}`);
      }
    } catch (error) {
      console.error(
        `[recommended] facebook post failed for ${product.product_id}: ${error.message}`
      );
    }

    published.push({
      id: String(product.product_id),
      name: nameHe,
      price: salePrice(product),
      category: categoryHe,
      titleKey: titleKey(product),
      docId: `aliexpress_${product.product_id}`,
      slug: slug,
      sales: toNumber(product.lastest_volume),
      score: Number(item.score.toFixed(1)),
      shopId: item.shopId || null,
    });
  }

  if (published.length > 0) {
    const keys = published
      .map((item) => item.titleKey)
      .filter(Boolean);
    await rememberTitleKeys(keys, picked.recentTitleKeys);
  }

  for (const angle of angles) {
    const fromAngle = published.filter((item) => item.category === angle.he);
    const salesSum = fromAngle.reduce(
      (total, item) => total + (Number(item.sales) || 0),
      0
    );
    await rememberAngleStats(
      angle,
      perAngleCandidates.get(angle.q) || 0,
      fromAngle.length,
      salesSum
    );
  }

  console.log(
    `[recommended] published ${published.length} products: ${JSON.stringify(published)}`
  );

  return {
    angles: angles.map((angle) => angle.q),
    categories: angles.map((angle) => angle.he),
    categoriesCreated: categoriesCreated,
    candidates: candidates.length,
    published: published,
  };
}

module.exports = {
  runRecommendedProducts,
  refreshMissingGalleries,
  checkProductAvailability,
  __test: {
    aliexpressCall,
    productDetails,
    buildAffiliateLink,
    saveProduct,
    slugFor,
    translateToHebrew,
    searchProducts,
    isRecommended,
    mainImage,
    galleryImages,
    productVideoUrl,
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
    siteProductUrl,
    titleKey,
    shopIdOf,
    isPreferredShop,
    isAccessoryListing,
    matchesQuery,
    similarTitles,
    pickDiverse,
    dedupeRepeatedWords,
    angleKey,
    angleScore,
  },
};
