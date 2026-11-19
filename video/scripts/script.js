"use strict";

/**
 * script.js
 * ---------------------------------------------------------------
 * בונה את הטקסט שנשמע בסרטון (עברית מדוברת, לא "קריאת טבלה")
 * ואת הכתוביות, עם זמנים שמתחלקים לפי אורך כל משפט.
 *
 * לכל משפט יש שני נוסחים:
 *   text   — הכתובית שעל המסך (ספרות: "7 ₪", "50% הנחה")
 *   speech — מה שמקריאים (מילים: "פחות משבעה שקלים", "חמישים אחוז")
 * מנוע הקראה שקורא ספרות נשמע שטוח ורובוטי; בן אדם אומר מילים.
 */

const {
  numberToHebrew,
  shekelsWords,
  ratingWords,
  thousandsWords,
} = require("./hebrew-numbers");

const HOOKS = [
  "תקשיבו רגע",
  "תראו מה מצאתי",
  "מצאתי לכם דיל",
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

// המחיר: כתובית עם ספרות, דיבור עם מילים.
function priceLine(price) {
  if (price === null || price === undefined || !Number.isFinite(Number(price))) {
    return null;
  }
  const value = Number(price);

  if (value < 10) {
    const rounded = Math.max(1, Math.ceil(value));
    return {
      text: `פחות מ${rounded} ₪`,
      speech: `המחיר? פחות מ${shekelsWords(rounded)} בלבד.`,
    };
  }

  const rounded = Math.round(value);
  return {
    text: `${rounded} ₪`,
    speech: `המחיר? ${shekelsWords(rounded)} בלבד.`,
  };
}

// משפטי ההקראה. כל משפט מקבל משקל יחסי לפי מספר התווים, כך שקצב
// הדיבור נשאר אחיד והכתוביות מסתנכרנות עם האודיו.
function buildSentences(product) {
  const sentences = [];
  const price = Number(product.price);
  const original = Number(product.originalPrice);
  const discount = product.discount ? Math.round(product.discount) : null;
  const rating = Number(product.rating) || 0;
  const sales = Number(product.sales) || 0;
  const category = product.category || "";

  const hook = pick(HOOKS);
  sentences.push({
    text: `${hook} · ${category}`,
    speech: `${hook}. משהו שווה${category ? ` בקטגוריית ${category}` : ""}.`,
  });

  const line = priceLine(price);
  if (line) sentences.push(line);

  if (original && price && original > price) {
    const originalRound = Math.round(original);
    sentences.push({
      text: `במקום ${originalRound} ₪`,
      speech: `במקום ${shekelsWords(originalRound)}.`,
    });
  }

  if (discount && discount >= 10) {
    sentences.push({
      text: `${discount}% הנחה`,
      speech: `הנחה של ${numberToHebrew(discount)} אחוז.`,
    });
  }

  if (rating || sales) {
    const captionParts = [];
    const speechParts = [];

    if (rating) {
      captionParts.push(`דירוג ${rating.toFixed(1)}`);
      speechParts.push(`דירוג של ${ratingWords(rating)} כוכבים`);
    }
    if (sales) {
      captionParts.push(
        sales >= 1000
          ? `${Number(sales).toLocaleString("he-IL")} מכירות`
          : `${sales} מכירות`
      );
      // ה־"ו" מחברת לדירוג שלפניה; בלי דירוג המשפט פותח נקי.
      const join = rating ? "ו" : "";
      speechParts.push(
        sales >= 1000
          ? `${join}יותר מ${thousandsWords(sales)} אנשים כבר קנו`
          : `${join}${numberToHebrew(sales)} אנשים כבר קנו`
      );
    }

    sentences.push({
      text: captionParts.join(" · "),
      speech: `${speechParts.join(", ")}.`,
    });
  }

  sentences.push({
    text: "הקישור בתיאור · משלוח לישראל",
    speech: "הקישור בתיאור, ומשלוח לישראל.",
  });

  return sentences.map((item) => ({
    text: item.text.replace(/\s+/g, " ").trim(),
    speech: item.speech.replace(/\s+/g, " ").trim(),
  }));
}

function speechText(sentences) {
  return `${sentences
    .map((item) => (item.speech || item.text).trim().replace(/[.\s]+$/, ""))
    .join(". ")}.`;
}

// מפצל את משך האודיו בין המשפטים לפי אורך הדיבור שלהם.
function captionTimings(sentences, audioFrames, startFrame) {
  const weights = sentences.map((item) =>
    Math.max(12, (item.speech || item.text).length)
  );
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

  const priceLineText = product.originalPrice
    ? `${formatShekels(product.price)} במקום ${formatShekels(
        product.originalPrice
      )}`
    : `${formatShekels(product.price)} בלבד`;
  lines.push(`💰 ${priceLineText}`);

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
