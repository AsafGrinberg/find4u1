"use strict";

/**
 * script.js
 * ---------------------------------------------------------------
 * בונה את הטקסט שנשמע בסרטון (עברית) ואת הכתוביות, עם זמנים
 * שמתחלקים לפי אורך כל משפט.
 */

const HOOKS = [
  "מצאתי לך משהו שווה",
  "תראה מה מצאתי",
  "מוצר ששווה לעצור בשבילו",
  "מצאתי לך את הדיל הזה",
];

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function spokenPrice(value) {
  if (value === null || value === undefined) return "";
  const rounded = Math.round(value);
  if (rounded !== value && value < 20) return value.toFixed(1);
  return String(rounded);
}

function shortTitle(name) {
  const words = String(name || "").trim().split(/\s+/);
  return words.slice(0, 9).join(" ");
}

function formatShekels(value) {
  if (value === null || value === undefined) return "";
  return `${Number(value).toLocaleString("he-IL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ₪`;
}

function socialText(product) {
  const parts = [];
  if (product.rating) {
    parts.push(`דירוג ${Number(product.rating).toFixed(1)}`);
  }
  if (product.sales) {
    parts.push(`${Number(product.sales).toLocaleString("he-IL")} מכירות`);
  }
  return parts.join(" · ");
}

// משפטי ההקראה. כל משפט מקבל משקל יחסי לפי מספר התווים, כך שקצב
// הדיבור נשאר אחיד והכתוביות מסתנכרנות עם האודיו.
function buildSentences(product) {
  const sentences = [];
  const price = spokenPrice(product.price);
  const original = spokenPrice(product.originalPrice);
  const discount = product.discount ? Math.round(product.discount) : null;

  sentences.push({text: `${pick(HOOKS)} בקטגוריית ${product.category}`});

  if (product.title) {
    sentences.push({text: shortTitle(product.title)});
  }

  if (price) {
    sentences.push({
      text: `הוא עולה ${price} שקל בלבד`,
    });
  }

  if (original && product.price && original > product.price) {
    sentences.push({
      text: `במקום ${original} שקל${
        discount ? `, ${discount} אחוז הנחה` : ""
      }`,
    });
  } else if (discount) {
    sentences.push({text: `${discount} אחוז הנחה`});
  }

  if (product.rating && product.sales) {
    sentences.push({
      text: `דירוג ${Number(product.rating).toFixed(1)} מתוך חמש, עם ${Number(
        product.sales
      ).toLocaleString("he-IL")} מכירות`,
    });
  } else if (product.rating) {
    sentences.push({
      text: `דירוג ${Number(product.rating).toFixed(1)} מתוך חמש`,
    });
  }

  sentences.push({text: "משלוח לישראל, והקישור בתיאור"});

  return sentences.map((item) => ({
    text: item.text.replace(/\s+/g, " ").trim(),
  }));
}

function speechText(sentences) {
  return sentences.map((item) => item.text).join(". ").replace(/\.\./g, ".") + ".";
}

// מפצל את משך האודיו בין המשפטים לפי אורך, ומוסיף נשימה קטנה בין משפטים.
function captionTimings(sentences, audioFrames, startFrame) {
  const weights = sentences.map((item) => Math.max(12, item.text.length));
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  const total = Math.max(audioFrames, sentences.length * 24);

  let cursor = startFrame;
  return sentences.map((item, index) => {
    const share = (weights[index] / totalWeight) * total;
    const from = Math.round(cursor);
    cursor += share;
    const to = Math.round(cursor);
    return {text: item.text, from, to: Math.max(to, from + 12)};
  });
}

// כיתוב לפוסט באינסטגרם / טלגרם.
function captionText(product, sentences, site) {
  const lines = [
    sentences[0] ? sentences[0].text : product.name,
    "",
    `🛍️ ${product.name}`,
  ];

  const priceLine = product.originalPrice
    ? `${formatShekels(product.price)} במקום ${formatShekels(
        product.originalPrice
      )}`
    : `${formatShekels(product.price)} בלבד`;
  lines.push(`💰 ${priceLine}`);

  if (product.discount) lines.push(`🔥 ${Math.round(product.discount)}% הנחה`);
  if (product.rating) {
    lines.push(`⭐ דירוג ${Number(product.rating).toFixed(1)} מתוך 5`);
  }
  if (product.sales) {
    lines.push(`📦 ${Number(product.sales).toLocaleString("he-IL")} מכירות`);
  }

  lines.push("");
  lines.push("🚚 משלוח לישראל");
  lines.push(`🔗 הקישור בביו: ${site}`);
  lines.push("");
  lines.push(
    "#find4u #דילים #קניות_אונליין #עליאקספרס #מוצרים_מומלצים #שופינג"
  );

  return lines.join("\n");
}

module.exports = {
  buildSentences,
  speechText,
  captionTimings,
  captionText,
  formatShekels,
  socialText,
  shortTitle,
};
