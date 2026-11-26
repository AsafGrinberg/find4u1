"use strict";

/**
 * lookup.js
 * ---------------------------------------------------------------
 * לאיזה מוצר שייך הפוסט/הריל שעליו הגיבה התגובה.
 *
 * הסדר:
 *   1. המזהה שנשמר בזמן הפרסום — facebookPostIds / instagramMediaIds.
 *      זו הדרך המדויקת, ואין ניחושים.
 *   2. גיבוי לפוסטים ותיקים: הלינק לדף המוצר שמופיע בכיתוב.
 *   3. גיבוי אחרון: שם המוצר שמופיע בכיתוב (שורת "🛍️ <שם>").
 *
 * אותו כלל בדיוק משמש את הסריקה כל חצי שעה (video/scripts/reply-social.js),
 * כדי שה-webhook והסריקה יגיעו לאותו מוצר.
 */

const store = require("./store");

async function productForObject(field, objectId) {
  if (!objectId) return null;
  return store.queryArray("products", field, String(objectId));
}

/** מוצר לפי כתובת דף המוצר שמופיעה בכיתוב. */
async function productFromCaption(caption) {
  const text = String(caption || "");
  if (!text) return null;

  const match = /\/product\/([^\s?&"']+)/.exec(text);
  if (match) {
    let slug = match[1];
    try {
      slug = decodeURIComponent(slug);
    } catch (error) {
      // ה-slug כבר נקי.
    }
    const product = await store.querySlug("products", slug);
    if (product) return product;
  }

  const rows = await store.fetchAllPublic("products");
  let best = null;
  let bestScore = 0;
  for (const product of rows) {
    const words = String(product.name || "")
      .split(/\s+/)
      .filter((word) => word.length >= 4);
    if (words.length < 2) continue;
    const hits = words.filter((word) => text.includes(word)).length;
    const score = hits / words.length;
    if (score > bestScore) {
      best = product;
      bestScore = score;
    }
  }
  return bestScore >= 0.6 ? best : null;
}

module.exports = {productForObject, productFromCaption};
