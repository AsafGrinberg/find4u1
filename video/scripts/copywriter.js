"use strict";

/**
 * copywriter.js
 * ---------------------------------------------------------------
 * כותב את הקריינות עם Gemini, על בסיס המוצר עצמו — לא מתבניות.
 *
 * למה זה קיים:
 * התסריט הישן בחר "משפחת מוצר" לפי מילים בכותרת ואז הדביק משפטים מהתבנית.
 * מנטר תינוק עם מצלמה נתפס כמשפחת "תינוק" (כי הקטגוריה הייתה "לתינוק")
 * וקיבל קריינות על משמרות לילה וסוללות — נכון לקטגוריה, לא למוצר.
 *
 * עכשיו: Gemini מקבל את שם המוצר, הכותרת המלאה של המוכר באנגלית, הקטגוריה,
 * התיאור והמפרט מאליאקספרס (כשיש), ואת המילים המקצועיות של המשפחה. הוא
 * מחזיר משפטים קצרים בעברית שכל אחד מהם עוסק במוצר הזה. אם הקריאה נכשלת
 * (מפתח חסר, מכסה, תשובה לא תקינה) — נופלים חזרה לתבניות של script.js,
 * כדי שריצה לא תיכשל בגלל הקריינות.
 *
 * הקריאה לפעולה (cta) תמיד מגיעה מכאן ולא מ-Gemini: היא חייבת להיות זהה
 * לתגובה האוטומטית שמחפשת את מילת המפתח בתגובות.
 */

const {
  buildScript,
  RATES,
  GAPS_MS,
  commentKeyword,
} = require("./script");
const {termsFor, stats: vocabularyStats} = require("./vocabulary");

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODELS = [
  process.env.GEMINI_SCRIPT_MODEL,
  "gemini-2.5-flash",
  "gemini-2.0-flash",
].filter(Boolean);
const REQUEST_TIMEOUT_MS = 60000;
const MAX_SENTENCE_CHARS = 64;

// כל משפט צריך לעמוד בפני עצמו: משפט ארוך עם פסיקים נשמע במנוע ההקראה
// כמו מילה אחת ענקית, ולכן גם התקרה וגם איסור הפסיק.
const ROLES = ["hook", "pain", "reveal", "feature"];

function cleanSentence(value) {
  return String(value || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/["'״׳]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function invalidSentence(sentence) {
  if (!sentence) return "empty";
  if (sentence.length > MAX_SENTENCE_CHARS) return "too long";
  if (/[,;:]/.test(sentence)) return "comma";
  if (/\d/.test(sentence)) return "digits";
  if (/₪|שקל|אגורות|מחיר|הנחה/.test(sentence)) return "price";
  if (!/[\u0590-\u05FF]/.test(sentence)) return "not hebrew";
  return null;
}

/** האם התסריט של Gemini שמיש. מחזיר {ok, reason}. */
function validateScript(parsed) {
  if (!parsed || typeof parsed !== "object") return {ok: false, reason: "no json"};

  const raw = Array.isArray(parsed.sentences) ? parsed.sentences : [];
  if (raw.length < 4) return {ok: false, reason: "too few sentences"};

  const sentences = [];
  for (const item of raw) {
    const role = String((item && item.role) || "").toLowerCase();
    if (!ROLES.includes(role)) return {ok: false, reason: `role ${role}`};
    const speech = cleanSentence(item.speech || item.text);
    const problem = invalidSentence(speech);
    if (problem) return {ok: false, reason: `${problem}: ${speech.slice(0, 40)}`};
    sentences.push({role, speech});
  }

  if (sentences[0].role !== "hook") return {ok: false, reason: "first is not hook"};
  if (!sentences.some((item) => item.role === "reveal")) {
    return {ok: false, reason: "no reveal"};
  }
  if (!sentences.some((item) => item.role === "feature")) {
    return {ok: false, reason: "no feature"};
  }

  const keyword = cleanSentence(parsed.keyword).replace(/[^\u0590-\u05FF]/g, "");
  if (!keyword || keyword.length < 2 || keyword.length > 14) {
    return {ok: false, reason: "keyword"};
  }

  return {ok: true, sentences, keyword};
}

function productFacts(product) {
  const lines = [
    `שם המוצר בעברית: ${product.name || "-"}`,
    `כותרת המוכר באנגלית: ${product.sourceTitle || "-"}`,
    `קטגוריה: ${product.category || "-"}`,
    `תת קטגוריה אצל המוכר: ${product.sourceCategory || "-"}`,
  ];

  if (product.brand) lines.push(`מותג: ${product.brand}`);
  if (Array.isArray(product.specs) && product.specs.length) {
    lines.push(`מפרט: ${product.specs.slice(0, 20).join(" · ")}`);
  }
  if (product.sourceDescription) {
    lines.push(`תיאור המוצר מהמוכר (אנגלית):\n${product.sourceDescription}`);
  }
  return lines.join("\n");
}

function promptFor(product, options = {}) {
  const family = options.family || "generic";
  const terms = termsFor(family, 16);
  const total = Number(options.maxSentences) || 9;

  return [
    "אתה כותב קריינות קצרה בעברית לריל מכירה של מוצר בודד.",
    "",
    "המוצר:",
    productFacts(product),
    "",
    terms.length
      ? `מילים מקצועיות שנהוג להשתמש בהן בקטגוריה הזו: ${terms.join(", ")}`
      : "",
    "",
    "המשימה: לכתוב את מה שנשמע בסרטון, משפט-משפט.",
    "",
    "חוקים מוחלטים:",
    `1. בין 4 ל-${Math.max(4, total - 2)} משפטים בסך הכול.`,
    "2. כל משפט עוסק במוצר הזה עצמו — מה הוא עושה, למי הוא עוזר, איך משתמשים בו.",
    "3. אסור להמציא עובדות. אם הפרט לא כתוב בכותרת, במפרט או בתיאור — לא אומרים אותו.",
    "4. אסור לדבר על משמרות לילה, תינוקות, סוללות, כאבי גב או כל נושא אחר שלא מופיע במוצר.",
    "5. בלי מחיר, בלי הנחה, בלי מספרים וספרות, בלי דירוג, בלי כמות מכירות.",
    "6. בלי פסיקים ונקודתיים בכלל. כל משפט קצר — עד 55 תווים.",
    "7. עברית מדוברת ופשוטה. לא שפה של דף מוצר ולא סופרלטיבים ריקים.",
    "8. משפט ה-reveal הראשון חייב לומר בבירור מה המוצר (\"זו מצלמה ש...\", \"זה פנס ש...\").",
    "",
    "המבנה:",
    "- hook (משפט אחד): מצב אמיתי שהמוצר פותר. שאלה או תיאור של הרגע.",
    "- pain (משפט אחד או שניים): מה קורה היום בלי המוצר.",
    "- reveal (משפט אחד או שניים): מה המוצר ומה הוא נותן.",
    "- feature (שניים או שלושה משפטים): יתרונות אמיתיים מהמפרט, כל אחד במשפט נפרד.",
    "",
    "בנוסף: keyword — מילה אחת בעברית (2 עד 12 אותיות) שאנשים יגיבו איתה",
    "כדי לקבל את הלינק למוצר (\"מצלמה\", \"פנס\", \"שואב\").",
    "",
    'החזר JSON בלבד: {"keyword": "...", "sentences": [{"role": "hook", "speech": "..."}]}',
  ]
    .filter(Boolean)
    .join("\n");
}

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    keyword: {type: "STRING"},
    sentences: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          role: {type: "STRING", enum: ROLES},
          speech: {type: "STRING"},
        },
        required: ["role", "speech"],
      },
    },
  },
  required: ["keyword", "sentences"],
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function callGemini(model, prompt, attempt = 0) {
  const response = await fetch(
    `${ENDPOINT}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(
      process.env.GEMINI_API_KEY
    )}`,
    {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      body: JSON.stringify({
        contents: [{role: "user", parts: [{text: prompt}]}],
        generationConfig: {
          temperature: 0.85,
          topP: 0.95,
          maxOutputTokens: 1024,
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    }
  );

  const json = await response.json().catch(() => ({}));

  if ((response.status === 429 || response.status === 503) && attempt < 2) {
    await sleep(4000 * (attempt + 1));
    return callGemini(model, prompt, attempt + 1);
  }

  if (!response.ok) {
    const message = JSON.stringify(json.error || json).slice(0, 200);
    throw new Error(`${model} ${response.status}: ${message}`);
  }

  const parts = json.candidates?.[0]?.content?.parts || [];
  const text = parts.map((part) => part.text || "").join("");
  if (!text) throw new Error(`${model}: empty response`);

  return JSON.parse(text);
}

/** מוסיף את הקריאה לפעולה הקבועה ומחזיר משפטים בפורמט של timeline. */
function withCallToAction(sentences, keyword, maxSentences) {
  const list = [...sentences];
  const cta = [`תגיבו ${keyword}.`, "ואשלח לכם לינק לרכישה ישירות."];

  const limit = Number(maxSentences);
  if (Number.isFinite(limit) && limit > 0) {
    // משאירים מקום לשתי שורות ה-cta, ומוותרים על יתרון עודף לפני שהוק.
    while (list.length + cta.length > limit) {
      const index = list.map((item) => item.role).lastIndexOf("feature");
      if (index > 0) list.splice(index, 1);
      else break;
    }
  }

  return [...list, ...cta.map((speech) => ({role: "cta", speech}))].map(
    (item, index) => ({
      role: item.role,
      speech: item.speech,
      rate: RATES[item.role] || 1,
      gapAfterMs: GAPS_MS[item.role] || 0,
      id: index + 1,
      text: item.speech,
    })
  );
}

/**
 * מחזיר {keyword, family, sentences, source, reason?}.
 * source = "gemini" או "template".
 */
async function writeScript(product, options = {}) {
  const fallback = () => {
    const script = buildScript(product, options);
    return {...script, source: "template"};
  };

  if (!process.env.GEMINI_API_KEY) {
    return {...fallback(), reason: "GEMINI_API_KEY is missing"};
  }

  const prompt = promptFor(product, options);
  let lastError = "";

  for (const model of DEFAULT_MODELS) {
    try {
      const parsed = await callGemini(model, prompt);
      const checked = validateScript(parsed);
      if (!checked.ok) {
        lastError = `${model}: ${checked.reason}`;
        continue;
      }

      const sentences = withCallToAction(
        checked.sentences,
        checked.keyword,
        options.maxSentences
      );

      return {
        keyword: checked.keyword,
        family: options.family || "gemini",
        model,
        source: "gemini",
        sentences,
      };
    } catch (error) {
      lastError = error.message;
    }
  }

  console.warn(`[script] Gemini copy failed (${lastError}) — using templates`);
  return {...fallback(), reason: lastError};
}

function vocabularyInfo() {
  return vocabularyStats();
}

module.exports = {
  writeScript,
  validateScript,
  productFacts,
  promptFor,
  vocabularyInfo,
  commentKeyword,
};
