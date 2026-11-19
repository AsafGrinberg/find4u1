"use strict";

/**
 * hebrew-numbers.js
 * ---------------------------------------------------------------
 * מספרים במילים בעברית, בשביל הקריינות.
 *
 * למה זה קריטי: מנוע TTS מקריא "7", "50" ו־"4.9" בקול שטוח (ולפעמים
 * אפילו באנגלית), וזה מה שנשמע "רובוטי". בן אדם אומר "שבעה שקלים",
 * "חמישים אחוז", "ארבע נקודה תשע". הכתוביות ממשיכות להציג ספרות.
 */

const ONES_M = [
  "אפס",
  "אחד",
  "שניים",
  "שלושה",
  "ארבעה",
  "חמישה",
  "שישה",
  "שבעה",
  "שמונה",
  "תשעה",
];
const ONES_F = [
  "אפס",
  "אחת",
  "שתיים",
  "שלוש",
  "ארבע",
  "חמש",
  "שש",
  "שבע",
  "שמונה",
  "תשע",
];
const TEENS_M = [
  "עשרה",
  "אחד עשר",
  "שנים עשר",
  "שלושה עשר",
  "ארבעה עשר",
  "חמישה עשר",
  "שישה עשר",
  "שבעה עשר",
  "שמונה עשר",
  "תשעה עשר",
];
const TEENS_F = [
  "עשר",
  "אחת עשרה",
  "שתים עשרה",
  "שלוש עשרה",
  "ארבע עשרה",
  "חמש עשרה",
  "שש עשרה",
  "שבע עשרה",
  "שמונה עשרה",
  "תשע עשרה",
];
const TENS = [
  "",
  "",
  "עשרים",
  "שלושים",
  "ארבעים",
  "חמישים",
  "שישים",
  "שבעים",
  "שמונים",
  "תשעים",
];
const HUNDREDS = [
  "",
  "מאה",
  "מאתיים",
  "שלוש מאות",
  "ארבע מאות",
  "חמש מאות",
  "שש מאות",
  "שבע מאות",
  "שמונה מאות",
  "תשע מאות",
];
// צורות ה"אלף" המיוחדות (שלושת אלפים, ארבעת אלפים…).
const THOUSANDS = [
  "",
  "אלף",
  "אלפיים",
  "שלושת אלפים",
  "ארבעת אלפים",
  "חמשת אלפים",
  "ששת אלפים",
  "שבעת אלפים",
  "שמונת אלפים",
  "תשעת אלפים",
  "עשרת אלפים",
];

function under100(n, gender) {
  const ones = gender === "feminine" ? ONES_F : ONES_M;
  const teens = gender === "feminine" ? TEENS_F : TEENS_M;
  if (n < 10) return ones[n];
  if (n < 20) return teens[n - 10];
  const tens = Math.floor(n / 10);
  const unit = n % 10;
  return unit === 0 ? TENS[tens] : `${TENS[tens]} ו${ones[unit]}`;
}

function chunkToHebrew(n, gender) {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const words = [];
  if (hundreds > 0) words.push(HUNDREDS[hundreds]);
  if (rest > 0) {
    const restWords = under100(rest, gender);
    words.push(words.length > 0 ? `ו${restWords}` : restWords);
  }
  return words.join(" ");
}

/** 0 … 999,999 במילים. gender: "masculine" (ברירת מחדל) או "feminine". */
function numberToHebrew(value, gender = "masculine") {
  const n = Math.round(Math.abs(Number(value) || 0));
  if (n === 0) return gender === "feminine" ? ONES_F[0] : ONES_M[0];

  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;
  const parts = [];

  if (thousands > 0) {
    parts.push(
      thousands < THOUSANDS.length
        ? THOUSANDS[thousands]
        : `${under100(thousands, "masculine")} אלף`
    );
  }
  if (rest > 0) {
    const restWords = chunkToHebrew(rest, gender);
    parts.push(parts.length > 0 ? `ו${restWords}` : restWords);
  }

  return parts.join(" ");
}

/** "שבעה שקלים" / "שלושה עשר שקלים" / "שקל אחד". */
function shekelsWords(value) {
  const n = Math.round(Math.abs(Number(value) || 0));
  if (n === 1) return "שקל אחד";
  return `${numberToHebrew(n)} שקלים`;
}

/** 4.9 → "ארבע נקודה תשע", 5 → "חמש". */
function ratingWords(value) {
  const rating = Number(value) || 0;
  const whole = Math.floor(rating);
  const fraction = Math.round((rating - whole) * 10);

  if (fraction === 0) return numberToHebrew(whole, "feminine");
  if (fraction === 10) return numberToHebrew(whole + 1, "feminine");
  return `${numberToHebrew(whole, "feminine")} נקודה ${ONES_F[fraction]}`;
}

/** 11,600 → "אחד עשר אלף" (בלי שאריות — "יותר מ" כבר מכסה את זה). */
function thousandsWords(value) {
  const thousands = Math.floor((Number(value) || 0) / 1000);
  if (thousands < 1) return numberToHebrew(value);
  return thousands < THOUSANDS.length
    ? THOUSANDS[thousands]
    : `${under100(thousands, "masculine")} אלף`;
}

module.exports = {
  numberToHebrew,
  shekelsWords,
  ratingWords,
  thousandsWords,
};
