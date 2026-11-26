"use strict";

/**
 * store.js
 * ---------------------------------------------------------------
 * גישה ל-Firestore מתוך פונקציית שרת (Vercel), בלי להוסיף תלות חדשה.
 *
 * שני מצבי עבודה:
 *   1. קריאה ציבורית (API key) — מוצרים וקטגוריות פתוחים לקריאה לפי
 *      firestore.rules, ולכן אפשר לאתר לפוסט את המוצר שהוא פרסם.
 *   2. כתיבה בהרשאות שרת (FIREBASE_SERVICE_ACCOUNT) — רק בשביל
 *      answeredComments, כדי שה-webhook והסריקה כל חצי שעה לא יענו פעמיים
 *      לאותה תגובה. אם אין מפתח, פשוט ממשיכים בלי זה (הסריקה תשלים).
 *
 * ה-JWT נחתם כאן עם node:crypto, כדי לא להוסיף firebase-admin לאתר.
 */

const crypto = require("node:crypto");

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "find4u-il-aefd0";
const API_KEY =
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
  "AIzaSyCwpXCeGMYK10KvU8JJ5uES5DJSG0Sq6jU";
const DOCS = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const CACHE_TTL_MS = 5 * 60 * 1000;

const publicCache = new Map();
let account = null;
let accountLoaded = false;
let token = null;
let tokenExpires = 0;

// ---- המרות בין Firestore ל-JavaScript -----------------------------------

function parseValue(value) {
  if (!value || typeof value !== "object") return null;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;
  if ("arrayValue" in value) {
    return ((value.arrayValue && value.arrayValue.values) || []).map(parseValue);
  }
  if ("mapValue" in value) return parseFields(value.mapValue.fields);
  return null;
}

function parseFields(fields) {
  const result = {};
  Object.entries(fields || {}).forEach(([key, value]) => {
    result[key] = parseValue(value);
  });
  return result;
}

function parseDocument(document) {
  if (!document || !document.name) return null;
  return {
    id: String(document.name).split("/").pop(),
    ...parseFields(document.fields),
  };
}

function encodeValue(value) {
  if (value === null || value === undefined) return {nullValue: null};
  if (typeof value === "string") return {stringValue: value};
  if (typeof value === "boolean") return {booleanValue: value};
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? {integerValue: String(value)}
      : {doubleValue: value};
  }
  if (Array.isArray(value)) {
    return {arrayValue: {values: value.map(encodeValue)}};
  }
  if (typeof value === "object") {
    return {mapValue: {fields: encodeFields(value)}};
  }
  return {nullValue: null};
}

function encodeFields(data) {
  const fields = {};
  Object.entries(data || {}).forEach(([key, value]) => {
    if (value === undefined) return;
    fields[key] = encodeValue(value);
  });
  return fields;
}

// ---- הרשאות שרת ---------------------------------------------------------

function serviceAccount() {
  if (accountLoaded) return account;
  accountLoaded = true;
  let raw = String(process.env.FIREBASE_SERVICE_ACCOUNT || "").trim();
  if (!raw) {
    account = null;
    return account;
  }
  // Secret שנשמר כ-base64 (נוח כי JSON עם private_key שובר שמירה בשורה אחת).
  if (!raw.startsWith("{")) {
    try {
      raw = Buffer.from(raw, "base64").toString("utf8");
    } catch (error) {
      account = null;
      return account;
    }
  }
  try {
    account = JSON.parse(raw);
  } catch (error) {
    console.error(`[store] FIREBASE_SERVICE_ACCOUNT is not valid JSON`);
    account = null;
  }
  return account;
}

function configured() {
  return Boolean(serviceAccount());
}

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function accessToken() {
  if (token && tokenExpires > Date.now() + 60_000) return token;
  const sa = serviceAccount();
  if (!sa) throw new Error("FIREBASE_SERVICE_ACCOUNT is not set");

  const tokenUri = sa.token_uri || "https://oauth2.googleapis.com/token";
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({alg: "RS256", typ: "JWT"}));
  const claim = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/datastore",
      aud: tokenUri,
      iat: now,
      exp: now + 3600,
    })
  );
  const unsigned = `${header}.${claim}`;
  const signature = base64url(
    crypto.createSign("RSA-SHA256").update(unsigned).sign(sa.private_key)
  );

  const response = await fetch(tokenUri, {
    method: "POST",
    headers: {"Content-Type": "application/x-www-form-urlencoded"},
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }).toString(),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.access_token) {
    throw new Error(
      `Firestore token: ${response.status} ${JSON.stringify(json).slice(0, 200)}`
    );
  }

  token = json.access_token;
  tokenExpires = Date.now() + Number(json.expires_in || 3600) * 1000;
  return token;
}

async function adminFetch(path, init = {}) {
  const auth = await accessToken();
  return fetch(`${DOCS}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${auth}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

// ---- קריאה ציבורית ------------------------------------------------------

/**
 * כל מסמכי האוסף, בקריאה ציבורית (אותו נתיב שהאתר עצמו קורא בו).
 * מטמון של חמש דקות לכל מופע חם, כדי לא לשלוף 600 מוצרים לכל אירוע.
 */
async function fetchAllPublic(collection) {
  const hit = publicCache.get(collection);
  if (hit && hit.expires > Date.now()) return hit.rows;

  const rows = [];
  let pageToken = null;
  try {
    do {
      const url =
        `${DOCS}/${collection}?pageSize=300&key=${API_KEY}` +
        (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "");
      const response = await fetch(url, {headers: {Accept: "application/json"}});
      if (!response.ok) break;
      const json = await response.json().catch(() => ({}));
      (json.documents || []).forEach((document) => {
        const parsed = parseDocument(document);
        if (parsed) rows.push(parsed);
      });
      pageToken = json.nextPageToken || null;
    } while (pageToken);
  } catch (error) {
    console.warn(`[store] public read of ${collection} failed: ${error.message}`);
  }

  if (rows.length) {
    publicCache.set(collection, {rows, expires: Date.now() + CACHE_TTL_MS});
  }
  return rows;
}

// ---- answeredComments ---------------------------------------------------

/** תגובה שכבר טופלה (על ידי ה-webhook או על ידי הסריקה). null אם אין. */
async function readAnswered(commentId) {
  if (!configured() || !commentId) return null;
  try {
    const response = await adminFetch(
      `/answeredComments/${encodeURIComponent(String(commentId))}`
    );
    if (response.status === 404) return null;
    if (!response.ok) return null;
    const json = await response.json().catch(() => ({}));
    return parseDocument(json);
  } catch (error) {
    console.warn(`[store] read answeredComments failed: ${error.message}`);
    return null;
  }
}

/** רישום תגובה שטופלה, כדי שהסריקה (וכל מופע אחר) לא יענה לה שוב. */
async function saveAnswered(commentId, data) {
  if (!configured() || !commentId) return false;
  try {
    const fields = encodeFields(data);
    const mask = Object.keys(fields)
      .map((key) => `updateMask.fieldPaths=${encodeURIComponent(key)}`)
      .join("&");
    const response = await adminFetch(
      `/answeredComments/${encodeURIComponent(String(commentId))}?${mask}`,
      {
        method: "PATCH",
        body: JSON.stringify({fields}),
      }
    );
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.warn(
        `[store] save answeredComments ${commentId} failed: ${response.status} ${text.slice(0, 200)}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn(`[store] save answeredComments failed: ${error.message}`);
    return false;
  }
}

// ---- שאילתות מוצרים -----------------------------------------------------

function runQuery(structuredQuery) {
  return adminFetch(":runQuery", {
    method: "POST",
    body: JSON.stringify({structuredQuery}),
  });
}

/** מוצר שמחזיק מזהה פוסט/מדיה במערך (facebookPostIds / instagramMediaIds). */
async function queryArray(collection, field, value) {
  const wanted = String(value || "");
  if (!wanted) return null;

  if (configured()) {
    try {
      const response = await runQuery({
        from: [{collectionId: collection}],
        where: {
          fieldFilter: {
            field: {fieldPath: field},
            op: "ARRAY_CONTAINS",
            value: {stringValue: wanted},
          },
        },
        limit: 1,
      });
      if (response.ok) {
        const json = await response.json().catch(() => []);
        for (const row of Array.isArray(json) ? json : []) {
          const parsed = parseDocument(row.document);
          if (parsed) return parsed;
        }
        return null;
      }
    } catch (error) {
      console.warn(`[store] query ${field} failed: ${error.message}`);
    }
  }

  const rows = await fetchAllPublic(collection);
  return (
    rows.find(
      (row) => Array.isArray(row[field]) && row[field].map(String).includes(wanted)
    ) || null
  );
}

/** מוצר לפי slug מדויק. */
async function querySlug(collection, slug) {
  const wanted = String(slug || "");
  if (!wanted) return null;

  if (configured()) {
    try {
      const response = await runQuery({
        from: [{collectionId: collection}],
        where: {
          fieldFilter: {
            field: {fieldPath: "slug"},
            op: "EQUAL",
            value: {stringValue: wanted},
          },
        },
        limit: 1,
      });
      if (response.ok) {
        const json = await response.json().catch(() => []);
        for (const row of Array.isArray(json) ? json : []) {
          const parsed = parseDocument(row.document);
          if (parsed) return parsed;
        }
      }
    } catch (error) {
      console.warn(`[store] query slug failed: ${error.message}`);
    }
  }

  const rows = await fetchAllPublic(collection);
  return rows.find((row) => String(row.slug || "") === wanted) || null;
}

module.exports = {
  configured,
  fetchAllPublic,
  readAnswered,
  saveAnswered,
  queryArray,
  querySlug,
};
