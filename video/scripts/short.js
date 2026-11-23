"use strict";

/**
 * short.js
 * ---------------------------------------------------------------
 * קישור השותפים של אליאקספרס ארוך מאוד (s.click.aliexpress.com/...),
 * נשבר לשורות ולא באמת ניתן ללחיצה בתגובות ובפוסטים. כאן מקצרים אותו
 * פעם אחת לכל קישור בריצה, כדי שכל ההודעות ישתמשו באותו קישור קצר.
 *
 * ניסיון ראשון TinyURL, אחר כך is.gd, ואם שניהם לא עונים — הקישור המקורי.
 */

const cache = new Map();

const SHORTENERS = [
  "https://tinyurl.com/api-create.php?url=",
  "https://is.gd/create.php?format=simple&url=",
];

async function tryShorten(endpoint, url) {
  const response = await fetch(endpoint + encodeURIComponent(url), {
    headers: {"User-Agent": "find4u-bot"},
  });
  if (!response.ok) return null;
  const text = (await response.text()).trim();
  if (!/^https?:\/\/\S+$/i.test(text)) return null;
  return text.length < url.length ? text : null;
}

async function shortenUrl(value) {
  const url = String(value || "").trim();
  if (!url) return "";
  if (url.length <= 40) return url;
  if (cache.has(url)) return cache.get(url);

  for (const endpoint of SHORTENERS) {
    try {
      const short = await tryShorten(endpoint, url);
      if (short) {
        cache.set(url, short);
        return short;
      }
    } catch (error) {
      // מנסים את הקצר הבא.
    }
  }

  console.warn(`[short] could not shorten a link — keeping the long one`);
  return url;
}

module.exports = {shortenUrl};
