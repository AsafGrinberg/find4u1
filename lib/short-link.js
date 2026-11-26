"use strict";

/**
 * short-link.js
 * ---------------------------------------------------------------
 * קיצור קישורים, במקום אחד, לכל מי ששולח קישור בפוסט/תגובה/DM.
 *
 * למה זה קיים:
 * קישור השותפים של אליאקספרס ארוך מאוד ונשבר לשורות. מקצרים אותו פעם
 * אחת לכל קישור בריצה, וכל ההודעות משתמשות באותו קישור קצר.
 *
 * ניסיון ראשון TinyURL, אחר כך is.gd, ואם שניהם לא עונים — הקישור המקורי.
 * זהו מודול CommonJS כי הוא משמש גם את סקריפטי video/ וגם את ה-API של האתר.
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
