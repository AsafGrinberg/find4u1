"use strict";

/**
 * script.js
 * ---------------------------------------------------------------
 * כותב את מה שנשמע בריל — עברית מדוברת, לא הקראה של דף מוצר.
 *
 * המבנה (5 משפטים: הוק, בעיה, שני יתרונות, קריאה לפעולה):
 *   הוק (שאלה/תוצאה, עד שנייה) → הבעיה בהרחבה → 2 יתרונות אמיתיים
 *   → קריאה לפעולה אחת קצרה
 *
 * כללים שנשמרים כאן:
 *   • הסרטון מוכר את המוצר נטו. אין בקריינות דירוג, מספר מכירות,
 *     ביקורות או מחיר — המחיר וההנחה כבר כתובים על המסך, וקול שקורא
 *     אותם נשמע כמו דף מוצר.
 *   • אין דחיפות מומצאת ("המחיר חוזר למעלה", "נשארו אחרונים") ואין
 *     מלאי מומצא.
 *   • הקריאה לפעולה היא תגובה עם מילת מפתח (commentKeyword), כי
 *     האוטומציה בתגובות היא ששולחת את הלינק לרכישה.
 *   • מספרים בקריינות כתובים במילים (hebrew-numbers), כי מנוע TTS
 *     שקורא "4.8" נשמע רובוטי.
 *   • לכל משפט קצב דיבור משלו (rate) והפסקה משלו (gapAfterMs) —
 *     אלה מועברים ל-API של גוגל (pace control) ולא ניחוש.
 *
 * לכל משפט: speech (הטקסט המדויק שנאמר וגם הכתובית — ציטוט מדויק),
 * rate, gapAfterMs, role.
 */

const {numberToHebrew, thousandsWords} = require("./hebrew-numbers");

// קצב דיבור לכל סוג משפט. Pace control מתועד בגוגל לטווח 0.25–2.0.
// הוק וקריאה לפעולה מהירים, מחיר והוכחה נינוחים.
const RATES = {
  hook: 1.12,
  pain: 1.04,
  feature: 1.02,
  proof: 1.0,
  price: 1.0,
  cta: 1.08,
};

// הפסקה אחרי המשפט (אלפיות שנייה מתורגמות לפריימים ב-timeline.js).
const GAPS_MS = {
  hook: 150,
  pain: 240,
  feature: 190,
  proof: 220,
  price: 260,
  cta: 0,
};

// ---------------------------------------------------------------------
// הוקים — הבעיה או התוצאה, בשנייה הראשונה. קצר, מדובר, בלי פתיחות.
// ---------------------------------------------------------------------
const PAINS = [
  {
    re: /מטבח|בלנדר|קרח|צידנית|קפה|אפייה|סיר|garlic|kitchen|blender/i,
    hook: "כמה זמן הולך לכם על חיתוך ירקות?",
    detail: "הכול ידני, על קרש קטן, ותוך חמש דקות כבר נמאס",
  },
  {
    re: /שואב|מטהר|אדים|ניקוי|אוויר|אבק|vacuum|clean|air purifier/i,
    hook: "הבית שלכם מתלכלך מהר מדי?",
    detail: "אתם מנקים, וחצי שעה אחר כך הכול שוב אותו דבר",
  },
  {
    // תאורה לפני טעינה: במנורת LED נטענת הבעיה האמיתית היא האור,
    // לא הכבל — ולכן ההוק צריך להיות על האור.
    re: /תאורה|מנורה|אור|לד|led|light|lamp|חיישן|sensor/i,
    hook: "אתם מדליקים אור בכל חדר שנכנסים?",
    detail: "ובלילה זה אומר לקום, לחפש את המתג, ולחזור למיטה",
  },
  {
    re: /טלפון|מעמד|טעינה|כבל|אוזניות|חשמל|אלקטרוניקה|מחשב|charg|usb|cable|phone/i,
    hook: "שוב נשארתם בלי סוללה באמצע?",
    detail: "עד היום הסתדרתם עם מטען שהתפרק לכם בתיק",
  },
  {
    re: /רכב|נסיע|car|bike|אופניים/i,
    hook: "בכל נסיעה זה נופל שוב",
    detail: "עד היום הסתדרתם עם מה שיש באוטו, וזה לא מחזיק",
  },
  {
    re: /חיות|כלב|חתול|pet|dog|cat/i,
    hook: "החיה שלכם ישנה על הרצפה?",
    detail: "עד היום הסתדרתם עם מה שהיה, וזה לא היה נוח לאף אחד",
  },
  {
    re: /תינוק|ילד|ילדים|baby|kids/i,
    hook: "כל יום אתם מחפשים שוב פתרון",
    detail: "ניסיתם כבר כמה מוצרים, ואף אחד לא החזיק מעמד",
  },
  {
    re: /יופי|שיער|טיפוח|פנים|עור|ציפורן|מסאז|beauty|skin|hair/i,
    hook: "כל בוקר אותה התעסקות",
    detail: "עד היום שילמתם על טיפול וחיכיתם בתור, בשביל עשר דקות",
  },
  {
    re: /כושר|ספורט|אימון|גוף|fitness|sport|gym/i,
    hook: "האימון נשאר בצד כל השבוע?",
    detail: "כי בסוף יום אין לכם כוח לנסוע לחדר כושר",
  },
];

const GENERIC_PAIN = {
  hook: "יש דברים בבית שאמורים להיות קלים",
  detail: "ובפועל אתם מסתדרים עם פתרון מאולתר שכבר מזמן לא עובד",
};

// ---------------------------------------------------------------------
// יתרונות: מזהים מאפיין אמיתי של המוצר (מהכותרת המקורית של המוכר)
// והופכים אותו למשפט מדובר. אין כאן הבטחות שלא מופיעות בכותרת.
// ---------------------------------------------------------------------
const FEATURES = [
  {
    re: /motion|pir|sensor|חיישן/i,
    speech: "הוא נדלק לבד ברגע שמישהו נכנס, ונכבה לבד כשאין אף אחד",
  },
  {
    re: /silent|quiet|noise.?cancel|noise.?reduc|שקט|דממה|בלי רעש/i,
    speech: "והוא עובד בשקט כזה שאפשר להפעיל אותו ליד מי שכבר נרדם",
  },
  {
    re: /wireless|אלחוטי|ללא חוט/i,
    speech: "בלי כבלים שמסתבכים ובלי להיתקע ליד השקע",
  },
  {
    re: /rechargeable|battery|סוללה|נטען|נטענת|chargeable/i,
    speech: "הסוללה נטענת, אז נגמרו הסוללות שנגמרות באמצע",
  },
  {
    re: /fast.?charg|quick.?charg|טעינה מהירה/i,
    speech: "הוא נטען מהר, ואתם לא מחכים לו חצי יום",
  },
  {
    re: /usb/i,
    speech: "הוא נטען בכבל USB רגיל, אז לא צריך מטען מיוחד",
  },
  {
    re: /waterproof|water.?resistant|עמיד למים|עמידה למים/i,
    speech: "הוא עמיד למים, אז גם גשם לא מפריע לו",
  },
  {
    re: /non.?stick|אנטי.?דביק/i,
    speech: "שום דבר לא נדבק אליו, ושטיפה אחת והוא כמו חדש",
  },
  {
    re: /stainless|נירוסטה/i,
    speech: "נירוסטה אמיתית, לא פלסטיק שמתקלף אחרי חודש",
  },
  {
    re: /vacuum|יניקה|שואב/i,
    speech: "יש לו יניקה אמיתית, לא כמו אלה שמפזרות את הלכלוך",
  },
  {
    re: /hepa|filter|מסנן|סינון/i,
    speech: "המסנן שלו מחזיק את האבק בפנים, והאוויר יוצא נקי",
  },
  {
    re: /massage|מסאז|עיסוי/i,
    speech: "הוא משחרר את השרירים אחרי יום ארוך, וזה מרגיש כמו מסאז'",
  },
  {
    re: /heat|חימום|מתחמם|חשמלי/i,
    speech: "הוא מתחמם מהר ושומר על החום, לא מתקרר בדקה",
  },
  {
    re: /adjustable|מתכוונן|כיוונון/i,
    speech: "הוא מתכוונן למידה שלכם, אז יושב בדיוק כמו שצריך",
  },
  {
    re: /foldable|folding|מתקפל|קיפול/i,
    speech: "הוא מתקפל ונכנס לתיק, גם כשאין מקום בכלל",
  },
  {
    re: /portable|\bmini\b|compact|נייד|קומפקטי|מיני/i,
    speech: "הוא קטן וקל, אז הוא נוסע איתכם לכל מקום",
  },
  {
    re: /\bled\b|תאורה|תאורת/i,
    speech: "התאורה שלו חזקה וברורה, גם כשיש חושך מסביב",
  },
  {
    re: /magnetic|מגנט/i,
    speech: "הוא נתפס בקליק אחד, בלי ברגים ובלי להתעצבן",
  },
  {
    re: /silicone|סיליקון/i,
    speech: "הסיליקון שלו גמיש ואיכותי, והוא לא נסדק",
  },
  {
    re: /ceramic|קרמי/i,
    speech: "הציפוי הקרמי לא נשרף ולא משאיר ריח אחרי השימוש",
  },
  {
    re: /leather|עור אמיתי|עור טבעי/i,
    speech: "עור אמיתי שנראה טוב גם אחרי שנה של שימוש",
  },
  {
    re: /solar|סולארי/i,
    speech: "הוא נטען מהשמש, בלי חשמל ובלי עוד הוצאה",
  },
  {
    re: /remote|שלט/i,
    speech: "מגיע עם שלט, אז לא קמים מהספה בשביל כל שינוי קטן",
  },
  {
    re: /washable|נשטף|כיבוס|לכיבוס/i,
    speech: "אפשר לכבס אותו בכיבוס רגיל, והוא יוצא משם כמו חדש",
  },
  {
    re: /set of|\d+\s*(pcs|pieces)|יחידות|ערכה|סט של/i,
    speech: "זו ערכה שלמה בקופסה אחת, ולא כל חלק בנפרד",
  },
  {
    re: /smart|חכם|חכמה/i,
    speech: "הוא עובד לבד, בלי שתצטרכו לחשוב עליו בכלל",
  },
  {
    re: /\bpro(fessional)?\b|מקצועי/i,
    speech: "הרמה שלו מקצועית, לא משהו תחליפי",
  },
];

// ---------------------------------------------------------------------
// מילת המפתח לתגובה. האוטומציה (ManyChat וכדומה) מזהה את התגובה הזאת
// ושולחת ללקוח לינק לרכישה — ולכן היא חייבת להיות קצרה וקלה לזכור,
// ולא שם המוצר המלא.
// ---------------------------------------------------------------------
const KEYWORDS = [
  { re: /מנור|תאורה|לד\b|led|lamp|light/i, word: "מנורה" },
  { re: /מתג|switch/i, word: "מתג" },
  { re: /בלנדר|blender/i, word: "בלנדר" },
  { re: /שואב|vacuum/i, word: "שואב" },
  { re: /מטהר|hepa|air purifier/i, word: "מטהר" },
  { re: /אוזניות|headphone|earbud/i, word: "אוזניות" },
  { re: /שעון|watch/i, word: "שעון" },
  { re: /מעמד|stand|holder/i, word: "מעמד" },
  { re: /מטען|power ?bank|charger/i, word: "מטען" },
  { re: /מצלמה|camera/i, word: "מצלמה" },
  { re: /רמקול|speaker/i, word: "רמקול" },
  { re: /מיקרופון|microphone/i, word: "מיקרופון" },
  { re: /מאוורר|fan\b/i, word: "מאוורר" },
  { re: /מקרר|cooler/i, word: "מקרר" },
  { re: /תיק|bag\b/i, word: "תיק" },
  { re: /נעל|shoe|sneaker/i, word: "נעל" },
  { re: /שמיכ|blanket/i, word: "שמיכה" },
  { re: /כרית|pillow/i, word: "כרית" },
  { re: /מסאז|massage/i, word: "מסאז'" },
];

// כשהכותרת לא מספקת אף מאפיין מזוהה — משפט בלי הבטחה ספציפית.
const FALLBACK_FEATURE =
  "והוא עושה את העבודה מהפעם הראשונה, בלי התעסקות ובלי הפתעות";

// ---------------------------------------------------------------------
// עזרים
// ---------------------------------------------------------------------
function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function formatShekels(value) {
  if (value === null || value === undefined) return "";
  return `${Number(value).toLocaleString("he-IL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ₪`;
}

function haystack(product) {
  return [
    product.sourceTitle,
    product.name,
    product.sourceCategory,
    product.category,
  ]
    .filter(Boolean)
    .join(" | ");
}

/**
 * הבעיה נבחרת קודם כל מהשם העברי של המוצר (המתורגם והמדויק), ורק אם
 * אין בו התאמה — מהכותרת של המוכר. בלי זה מנורת ליל שמוכרים אותה גם
 * ל"מטבח" הופכת לסרטון על חיתוך ירקות.
 */
function painFor(product) {
  const name = String(product.name || "");
  return (
    PAINS.find((pain) => pain.re.test(name)) ||
    PAINS.find((pain) => pain.re.test(haystack(product))) ||
    GENERIC_PAIN
  );
}

function productFeatures(product, limit = 2) {
  const text = haystack(product);
  const found = [];
  for (const feature of FEATURES) {
    if (found.length >= limit) break;
    if (feature.re.test(text)) found.push(feature);
  }
  return found;
}

/**
 * מחיר במילים, כמו שאומרים אותו: "מאה ושמונה עשרה שקלים" ואם יש
 * אגורות — "מאה ושמונה עשרה שקלים וארבעים וחמש אגורות".
 * אותו מספר בדיוק כמו שמוצג על המסך.
 */
function shekelsSpeech(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "";
  const shekels = Math.floor(amount + 1e-9);
  const agorot = Math.round((amount - shekels) * 100);
  const base = shekels === 1 ? "שקל אחד" : `${numberToHebrew(shekels)} שקלים`;
  if (!agorot) return base;
  return `${base} ו${numberToHebrew(agorot, "feminine")} אגורות`;
}

// מילת המפתח שהלקוח מתבקש להגיב בה (משמשת גם על המסך וגם בקריינות).
function commentKeyword(product) {
  const text = haystack(product);
  const hit = KEYWORDS.find((item) => item.re.test(text));
  if (hit) return hit.word;

  // נפילה לאחור: המילה העברית הראשונה בשם המוצר ("שמן אתרי" → "שמן"),
  // ולא מספר או דגם כמו "100" או "Tuya".
  const words = String(product.name || "")
    .replace(/["'״׳]/g, " ")
    .split(/\s+/)
    .filter((word) => /^[\u0590-\u05FF]{3,}$/.test(word));
  return words[0] || "מוצר";
}

// ---------------------------------------------------------------------
// בונים את המשפטים
// ---------------------------------------------------------------------

/**
 * מחזיר {sentences} — כל משפט עם role, rate ו-gapAfterMs.
 * המשפטים עצמם הם גם הקריינות וגם הכתוביות (ציטוט מדויק).
 */
function buildScript(product) {
  const pain = painFor(product);
  const features = productFeatures(product, 3);
  const sentences = [];

  const add = (role, speech) =>
    sentences.push({
      role,
      speech: String(speech).replace(/\s+/g, " ").trim(),
      rate: RATES[role] || 1,
      gapAfterMs: GAPS_MS[role] || 0,
    });

  add("hook", pain.hook);
  add("pain", `${pain.detail}.`);

  if (features.length === 0) {
    add("feature", `${FALLBACK_FEATURE}.`);
  } else {
    features.forEach((feature, index) => {
      add("feature", index === 0 ? `${feature.speech}.` : `ו${feature.speech}.`);
    });
  }

  const keyword = commentKeyword(product);
  add("cta", `תגיבו ${keyword} ואני שולח לכם לינק לרכישה מאליאקספרס.`);

  return {
    keyword,
    sentences: sentences.map((sentence, index) => ({
      ...sentence,
      id: index + 1,
      text: sentence.speech,
    })),
  };
}

function speechText(sentences) {
  return sentences
    .map((item) => item.speech.replace(/[.!\s]+$/, ""))
    .join(". ")
    .concat(".");
}

// כיתוב לפוסט באינסטגרם / טלגרם.
function captionText(product, sentences, site) {
  const lines = [sentences[0] ? sentences[0].speech : product.name, ""];

  lines.push(`🛍️ ${product.name}`);

  const priceLine = product.originalPrice &&
    Number(product.originalPrice) > Number(product.price)
    ? `${formatShekels(product.price)} במקום ${formatShekels(
        product.originalPrice
      )}`
    : `${formatShekels(product.price)} בלבד`;
  lines.push(`💰 ${priceLine}`);

  if (product.discount) lines.push(`🔥 ${Math.round(product.discount)}% הנחה`);

  lines.push("");
  lines.push("🚚 משלוח לישראל");
  lines.push(`💬 תגיבו ${commentKeyword(product)} ואני שולח לכם לינק לרכישה`);
  lines.push("");
  lines.push(
    "#find4u #דילים #קניות_אונליין #עליאקספרס #מוצרים_מומלצים #שופינג"
  );

  return lines.join("\n");
}

module.exports = {
  buildScript,
  speechText,
  captionText,
  formatShekels,
  commentKeyword,
  shekelsSpeech,
  productFeatures,
  painFor,
};
