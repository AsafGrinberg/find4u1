"use strict";

/**
 * script.js
 * ---------------------------------------------------------------
 * כותב את הטקסט שנשמע בריל — לא הקראה של דף המוצר, אלא קופי
 * מכירתי שנבנה במיוחד לריל:
 *
 *   הוק → הבעיה → המוצר כפתרון → 2–3 יתרונות אמיתיים של המוצר
 *   → הוכחה חברתית → מחיר ואנקר → קריאה לפעולה דחופה
 *
 * היתרונות נגזרים ממאפייני המוצר (כותרת המקור באנגלית + השם
 * המתורגם), כך שכל ריל מדבר על היתרונות של המוצר הזה ולא על
 * "דירוג ומכירות" יבשים.
 *
 * לכל משפט שני נוסחים:
 *   text   — הכתובית שעל המסך (קצרה, עם ספרות)
 *   speech — מה שמקריאים (עברית מדוברת, מספרים במילים)
 */

const {
  numberToHebrew,
  shekelsWords,
  ratingWords,
  thousandsWords,
} = require("./hebrew-numbers");

// ---------------------------------------------------------------------
// הוקים — קצרים, בשאלה או בקריאה, כדי שהמנוע ייתן אינטונציה
// ---------------------------------------------------------------------
const HOOKS = [
  {caption: "תפסיקו לגלול רגע", speech: "תפסיקו לגלול רגע"},
  {caption: "רגע, אל תעברו", speech: "רגע, אל תעברו הלאה"},
  {caption: "מצאתי את הדבר הזה", speech: "מצאתי את הדבר הזה"},
  {caption: "תסתכלו על זה שנייה", speech: "תסתכלו על זה שנייה"},
];

// ---------------------------------------------------------------------
// יתרונות: מזהים מאפיין במוצר והופכים אותו למשפט מכירתי
// ---------------------------------------------------------------------
const FEATURES = [
  {
    re: /silent|quiet|noise.?cancel|noise.?reduc|שקט|שקטה|שקטים|דממה|בלי רעש/i,
    caption: "עובד בשקט",
    speech: "הוא עובד בשקט כזה שאפשר להשתמש בו ליד מי שישן",
  },
  {
    re: /wireless|אלחוטי|אלחוטית|ללא חוט/i,
    caption: "בלי כבלים",
    speech: "בלי כבלים שמסתבכים ובלי להתקע בשקע באמצע העבודה",
  },
  {
    re: /rechargeable|battery|סוללה|נטען|נטענת/i,
    caption: "סוללה שמחזיקה",
    speech: "סוללה נטענת שמחזיקה שעות, ולא צריך לקנות סוללות כל שבוע",
  },
  {
    re: /fast.?charg|quick.?charg|טעינה מהירה/i,
    caption: "נטען מהר",
    speech: "הוא נטען מהר ומוכן לעבודה עוד לפני שיצאתם מהבית",
  },
  {
    re: /waterproof|water.?resistant|עמיד למים|עמידה למים/i,
    caption: "עמיד למים",
    speech: "לא מפחיד אותו מים, לא בגשם ולא מתחת לברז",
  },
  {
    re: /non.?stick|אנטי.?דביק|לא דביק/i,
    caption: "כלום לא נדבק",
    speech: "שום דבר לא נדבק אליו, ושטיפה אחת מספיקה כדי שיהיה כמו חדש",
  },
  {
    re: /stainless|נירוסטה/i,
    caption: "נירוסטה אמיתית",
    speech: "נירוסטה אמיתית, לא פלסטיק שמתקלף אחרי חודש",
  },
  {
    re: /vacuum|יניקה|שואב/i,
    caption: "יניקה אמיתית",
    speech: "כוח יניקה אמיתי, לא צעצוע שמפזר את הלכלוך לכל הכיוונים",
  },
  {
    re: /hepa|filter|מסנן|סינון/i,
    caption: "מסנן אבק",
    speech: "המסנן שלו מחזיק אבק ומשאיר את האוויר בבית נקי באמת",
  },
  {
    re: /massage|מסאז|עיסוי/i,
    caption: "מרגיש כמו מסאז'",
    speech: "הוא משחרר את השרירים אחרי יום עבודה, וזה מרגיש כמו מסאז' אמיתי",
  },
  {
    re: /heat|חימום|מתחמם|חשמלי/i,
    caption: "מתחמם מהר",
    speech: "הוא מתחמם מהר ושומר על חום לאורך זמן, לא כמו אלו שמתקררים בדקה",
  },
  {
    re: /adjustable|מתכוונן|כיוונון/i,
    caption: "מתכוונן אליכם",
    speech: "הוא מתכוונן בדיוק למידה שלכם, ולא צריך לסבול שום דבר באמצע",
  },
  {
    re: /foldable|folding|מתקפל|קיפול/i,
    caption: "מתקפל וקל",
    speech: "הוא מתקפל ונכנס לכל תיק, גם כשאין מקום בכלל",
  },
  {
    re: /portable|\bmini\b|compact|נייד|קומפקטי|מיני/i,
    caption: "לוקחים לכל מקום",
    speech: "הוא קטן וקל, אז לוקחים אותו לכל מקום בלי לחשוב פעמיים",
  },
  {
    re: /\bled\b|תאורה|תאורת/i,
    caption: "תאורה חזקה",
    speech: "התאורה שלו חזקה וברורה, גם כשהחדר בחצי חושך",
  },
  {
    re: /magnetic|מגנט/i,
    caption: "מתחבר בקליק",
    speech: "הוא נתפס בקליק אחד, בלי ברגים ובלי להתעצבן",
  },
  {
    re: /silicone|סיליקון/i,
    caption: "סיליקון איכותי",
    speech: "הסיליקון שלו איכותי וגמיש, והוא לא נסדק אחרי חודש",
  },
  {
    re: /ceramic|קרמי/i,
    caption: "ציפוי קרמי",
    speech: "הציפוי הקרמי לא נשרף ולא משאיר ריח אחרי השימוש",
  },
  {
    re: /leather|עור אמיתי|עור טבעי/i,
    caption: "עור אמיתי",
    speech: "עור אמיתי שנראה טוב גם אחרי שנה של שימוש יומיומי",
  },
  {
    re: /solar|סולארי/i,
    caption: "נטען מהשמש",
    speech: "הוא נטען מהשמש, בלי חשמל ובלי עוד הוצאה על חשבון",
  },
  {
    re: /remote control|with remote|שלט/i,
    caption: "מגיע עם שלט",
    speech: "הוא מגיע עם שלט, אז לא צריך לקום מהספה בשביל כל שינוי קטן",
  },
  {
    re: /washable|נשטף|כיבוס|לכיבוס/i,
    caption: "אפשר לכבס",
    speech: "אפשר לכבס אותו בכיבוס רגיל, והוא יוצא משם כמו חדש",
  },
  {
    re: /set of|\d+\s*(pcs|pieces)|יחידות|ערכה|סט של/i,
    caption: "ערכה שלמה",
    speech: "זו ערכה שלמה בקופסה אחת, ולא צריך לקנות כל חלק בנפרד",
  },
  {
    re: /smart|חכם|חכמה/i,
    caption: "עובד לבד",
    speech: "הוא עובד לבד, בלי שתצטרכו לחשוב עליו בכלל",
  },
  {
    re: /\bpro(fessional)?\b|מקצועי/i,
    caption: "רמה מקצועית",
    speech: "הרמה שלו היא רמה מקצועית, לא משהו תחליפי",
  },
];

// ---------------------------------------------------------------------
// הבעיה שהמוצר פותר — לפי הקטגוריה
// ---------------------------------------------------------------------
const PAINS = [
  {
    re: /מטבח|בלנדר|קרח|צידנית|קפה|אפייה|סיר/i,
    caption: "הפסקה של הבזבוז",
    speech: "עד היום הסתדרתם עם מה שהיה במטבח, וזה לקח כפול זמן",
  },
  {
    re: /שואב|מטהר|אדים|ניקוי|אוויר|אבק/i,
    caption: "הבית אף פעם לא באמת נקי",
    speech: "עד היום ניקיתם ידנית, וחצי שעה אחר כך הכל שוב מלוכלך",
  },
  {
    re: /טלפון|מעמד|טעינה|כבל|אוזניות|חשמל|אלקטרוניקה|מחשב/i,
    caption: "סוף לפתרון המאולתר",
    speech: "עד היום הסתדרתם עם פתרון מאולתר שהתפרק לכם באמצע היום",
  },
  {
    re: /רכב|נסיע/i,
    caption: "לרכב, כמו שצריך",
    speech: "עד היום הסתדרתם עם מה שהיה באוטו, וזה תמיד נפל באמצע נסיעה",
  },
  {
    re: /חיות|כלב|חתול/i,
    caption: "גם החיה מרוצה",
    speech: "עד היום החיה שלכם ישנה על הרצפה, וזה אף פעם לא פתרון",
  },
  {
    re: /תינוק|ילד|ילדים/i,
    caption: "בטוח לשימוש יומיומי",
    speech: "עד היום ניסיתם שלושה מוצרים עד שמצאתם משהו שבאמת עובד",
  },
  {
    re: /יופי|שיער|טיפוח|פנים|עור|ציפורן|מסאז/i,
    caption: "טיפול בבית",
    speech: "עד היום שילמתם על טיפול וחיכיתם שבועות לתור, לעשר דקות",
  },
  {
    re: /כושר|ספורט|אימון|גוף/i,
    caption: "בבית, בכל שעה",
    speech: "עד היום ויתרתם על האימון, כי לא היה לכם כוח לנסוע לחדר כושר",
  },
];

const GENERIC_PAIN = {
  caption: "מפסיקים להתפשר",
  speech: "עד היום הסתדרתם עם מה שהיה, וזה תמיד הרגיש כמו פשרה",
};

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

// עד שלושה יתרונות שמתאימים למוצר, בלי כפילויות.
function productFeatures(product, limit = 3) {
  const text = haystack(product);
  const found = [];
  for (const feature of FEATURES) {
    if (found.length >= limit) break;
    if (feature.re.test(text)) found.push(feature);
  }
  return found;
}

function painFor(product) {
  const text = haystack(product);
  return PAINS.find((pain) => pain.re.test(text)) || GENERIC_PAIN;
}

// המחיר: אנקר מול מחיר קודם, הנחה, וסיבה לא לחשוב פעמיים.
function priceSentence(product) {
  const price = Number(product.price);
  if (!Number.isFinite(price) || price <= 0) return null;

  const rounded = Math.max(1, Math.round(price));
  const original = Number(product.originalPrice);
  const hasOriginal = Number.isFinite(original) && original > price + 0.5;

  const parts = [];
  if (hasOriginal) {
    parts.push(
      `במקום ${shekelsWords(Math.round(original))}, עכשיו ${shekelsWords(
        rounded
      )} בלבד`
    );
  } else {
    parts.push(`המחיר? ${shekelsWords(rounded)} בלבד`);
  }

  parts.push("במחיר כזה אין מה לחשוב פעמיים")

  return {
    text: hasOriginal
      ? `${rounded} ₪ במקום ${Math.round(original)} ₪`
      : `${rounded} ₪ בלבד`,
    speech: `${parts.join(". ")}.`,
  };
}

// הוכחה חברתית — רק אם יש נתונים אמיתיים.
function proofSentence(product) {
  const rating = Number(product.rating) || 0;
  const sales = Number(product.sales) || 0;
  if (!rating && !sales) return null;

  const speech = [];
  const text = [];

  if (rating) {
    speech.push(`דירוג ${ratingWords(rating)} מתוך חמישה`);
    text.push(`⭐ ${rating.toFixed(1)}`);
  }
  if (sales) {
    speech.push(
      sales >= 1000
        ? `${rating ? "ו" : ""}יותר מ${thousandsWords(sales)} כבר קנו`
        : `${rating ? "ו" : ""}${numberToHebrew(sales)} אנשים כבר קנו`
    );
    text.push(
      sales >= 1000
        ? `${Number(sales).toLocaleString("he-IL")} מכירות`
        : `${sales} מכירות`
    );
  }

  return {
    text: text.join(" · "),
    speech: `${speech.join(", ")}. אלה מספרים אמיתיים.`,
  };
}

function ctaSentence() {
  return {
    text: "הקישור בתיאור · משלוח לישראל",
    speech:
      "הקישור בתיאור, משלוח לישראל. תלחצו לפני שהמחיר חוזר למעלה",
  };
}

/**
 * בונה את משפטי הריל. כל משפט מקבל משקל יחסי לפי אורך הדיבור,
 * כך שקצב הדיבור נשאר אחיד והכתוביות מסונכרנות עם האודיו.
 */
function buildSentences(product) {
  const sentences = [];
  const category = categoryLabel(product);
  const hook = pick(HOOKS);

  sentences.push({
    text: hook.caption,
    speech: `${hook.speech}. זה מהמוצרים הכי נמכרים בתחום של ${category}.`,
  });

  const pain = painFor(product);
  sentences.push({text: pain.caption, speech: `${pain.speech}.`});

  sentences.push({
    text: "לא עוד מוצר זול",
    speech:
      "כי זה לא עוד מוצר זול מאליאקספרס. הוא עושה את העבודה מהפעם הראשונה",
  });

  for (const feature of productFeatures(product, 2)) {
    sentences.push({text: feature.caption, speech: `${feature.speech}.`});
  }

  const proof = proofSentence(product);
  if (proof) sentences.push(proof);

  const price = priceSentence(product);
  if (price) sentences.push(price);

  sentences.push(ctaSentence());

  return sentences.map((item) => ({
    text: item.text.replace(/\s+/g, " ").trim(),
    speech: item.speech.replace(/\s+/g, " ").trim(),
  }));
}

// שם הקטגוריה לתפאורת המשפט ("אחד הנמכרים ב…").
function categoryLabel(product) {
  const category = String(product.category || "").trim();
  if (!category) return "אליאקספרס";
  return category;
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
  productFeatures,
};
