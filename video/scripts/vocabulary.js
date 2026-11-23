"use strict";

/**
 * vocabulary.js
 * ---------------------------------------------------------------
 * מאגר המילים שנלמד מהקטלוג של אליאקספרס (corpus/vocabulary.json).
 *
 * build-vocabulary.js שולף אלפי כותרות מוצרים מכל הקטגוריות, סופר אילו
 * מילים מופיעות בהן, ומשייך כל מילה למשפחת מוצר. הקובץ הזה לא מפרסם כלום
 * ולא נוגע ב-products — הוא רק אוצר מילים לשיפור זיהוי המוצר והתסריט.
 *
 * הכל אופציונלי: אם הקורפוס עוד לא נבנה, כל הפונקציות מחזירות
 * null/[] והפייפליין ממשיך לעבוד בדיוק כמו קודם.
 */

const fs = require("fs");
const path = require("path");

const CORPUS_FILE = path.join(__dirname, "..", "corpus", "vocabulary.json");

let loaded;

function corpus() {
  if (loaded !== undefined) return loaded;
  try {
    const raw = fs.readFileSync(CORPUS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    loaded = Array.isArray(parsed && parsed.words) ? parsed : null;
  } catch (error) {
    loaded = null;
  }
  return loaded;
}

// מילה במילון נחשבת רק אם היא באמת מופיעה בטקסט של המוצר.
function tokenize(text) {
  return new Set(
    String(text || "")
      .toLowerCase()
      .split(/[^a-z0-9\u0590-\u05FF]+/)
      .filter((word) => word.length >= 3)
  );
}

/**
 * ההצבעה של הקורפוס: איזו משפחה מופיעה הכי הרבה במילים של המוצר.
 * מחזיר {family, score} או null כשאין קורפוס או שאין התאמה מספקת.
 */
function familyHint(text) {
  const data = corpus();
  if (!data) return null;

  const tokens = tokenize(text);
  if (tokens.size === 0) return null;

  const votes = new Map();
  for (const entry of data.words) {
    if (!entry || !entry.w || !tokens.has(String(entry.w).toLowerCase())) continue;
    for (const family of entry.families || []) {
      votes.set(family, (votes.get(family) || 0) + Number(entry.n || 1));
    }
  }
  if (votes.size === 0) return null;

  const [family, score] = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
  return {family, score};
}

/**
 * המילים הנפוצות של משפחה — מוזרקות לכותב התסריט כהקשר, כדי שהוא ידע
 * איך באמת קוראים לדברים בענף הזה בעברית.
 */
function termsFor(familyId, limit = 14) {
  const data = corpus();
  if (!data || !familyId) return [];

  return data.words
    .filter((entry) => (entry.families || []).includes(familyId))
    .sort((a, b) => Number(b.n || 0) - Number(a.n || 0))
    .slice(0, limit)
    .map((entry) => entry.w);
}

function stats() {
  const data = corpus();
  if (!data) return {available: false, file: CORPUS_FILE};
  return {
    available: true,
    file: CORPUS_FILE,
    generatedAt: data.generatedAt || null,
    titles: data.titles || 0,
    words: data.words.length,
  };
}

module.exports = {familyHint, termsFor, stats, CORPUS_FILE};
