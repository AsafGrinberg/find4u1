"use strict";

/**
 * script.js
 * ---------------------------------------------------------------
 * בונה את הטקסט שנשמע בסרטון (עברית מדוברת, לא "קריאת טבלה")
 * ואת הכתוביות, עם זמנים שמתחלקים לפי אורך כל משפט.
 */

const HOOKS = [
  "תראו מה מצאתי",
  "תקשיבו, יש פה משהו שווה",
  "מצאתי לך דיל שווה",
  "רגע, תסתכלו על זה",
];

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
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

// מחיר מדובר: "5.90" נקרא רע, "פחות משישה שקלים" נשמע כמו בן אדם.
function priceSentence(price) {
  if (price === null || price === undefined) return "";
  if (Number.isInteger(price)) return `המחיר? ${price} שקלים`;
  if (price < 10) return `המחיר? פחות מ${Math.ceil(price)} שקלים`;
  return `המחיר? ${Math.round(price)} שקלים`;
}

// "61,734 מכירות" נשמע כמו קריאת טבלה — אומרים "יותר משישים אלף".
function salesSentence(sales) {
  if (!sales) return "";
  if (sales >= 1000) {
    return `יותר מ${Math.floor(sales / 1000)} אלף מכירות`;
  }
  return `${Math.round(sales)} מכירות`;
}

// משפטי ההקראה. כל משפט מקבל משקל יחסי לפי מספר התווים, כך שקצב
// הדיבור נשאר אחיד והכתוביות מסתנכרנות עם האודיו.
function buildSentences(product) {
  const sentences = [];
  const price = product.price;
  const original = product.originalPrice;
  const discount = product.discount ? Math.round(product.discount) : null;

  sentences.push({text: `${pick(HOOKS)}, בקטגוריית ${product.category}`});

  const priceLine = priceSentence(price);
  if (priceLine) sentences.push({text: priceLine});

  if (original && price && original > price) {
    sentences.push({text: `במקום ${Math.round(original)} שקלים`});
  }

  if (discount && discount >= 10) {
    sentences.push({text: `הנחה של ${discount} אחוז`});
  }

  const rating = product.rating
    ? `דירוג של ${Number(product.rating).toFixed(1)} כוכבים`
    : "";
  const sales = salesSentence(product.sales);

  if (rating && sales) sentences.push({text: `${rating}, ${sales}`});
  else if (rating) sentences.push({text: rating});
  else if (sales) sentences.push({text: sales});

  sentences.push({text: "הקישור בתיאור, ומשלוח לישראל"});

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
