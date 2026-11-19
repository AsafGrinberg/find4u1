// lib/firestore-server.js
// קריאת מוצרים וקטגוריות בזמן רינדור בשרת (SSR / build), דרך ה REST API של
// Firestore. הכל ציבורי לקריאה, ולכן אין צורך במפתח שרת.
//
// כל עמוד מוצר נקרא עם getServerSideProps, ולכן בלי מטמון כל צפייה הייתה
// מורידה את כל הקטלוג שוב ושוב. המטמון הזה מחזיק את התוצאה לחמש דקות
// ומאחד בקשות מקבילות לקריאה אחת.

const PROJECT_ID = 'find4u-il-aefd0';
const API_KEY =
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
  'AIzaSyCwpXCeGMYK10KvU8JJ5uES5DJSG0Sq6jU';

const CACHE_TTL_MS = 5 * 60 * 1000;

const cache = new Map();
const inflight = new Map();

function baseUrl(collectionName) {
  return (
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}` +
    `/databases/(default)/documents/${collectionName}` +
    `?pageSize=300&key=${API_KEY}`
  );
}

// ממיר ערך Firestore REST לערך JavaScript רגיל.
function parseValue(value) {
  if (!value || typeof value !== 'object') return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('timestampValue' in value) return value.timestampValue;
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) {
    const list = (value.arrayValue && value.arrayValue.values) || [];
    return list.map(parseValue);
  }
  if ('mapValue' in value) {
    const fields = (value.mapValue && value.mapValue.fields) || {};
    return parseFields(fields);
  }
  return null;
}

function parseFields(fields) {
  const result = {};
  Object.entries(fields || {}).forEach(([key, value]) => {
    result[key] = parseValue(value);
  });
  return result;
}

async function readCollection(collectionName) {
  try {
    const response = await fetch(baseUrl(collectionName), {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return [];

    const json = await response.json();
    const documents = json.documents || [];

    return documents.map((document) => ({
      id: document.name.split('/').pop(),
      ...parseFields(document.fields),
    }));
  } catch {
    return [];
  }
}

function fetchCollection(collectionName) {
  const hit = cache.get(collectionName);
  if (hit && hit.expires > Date.now()) return Promise.resolve(hit.data);

  const running = inflight.get(collectionName);
  if (running) return running;

  const task = readCollection(collectionName)
    .then((data) => {
      // תוצאה ריקה לא נשמרת, כדי שתקלת רשת רגעית לא תיתקע לחמש דקות.
      if (data.length) {
        cache.set(collectionName, { data, expires: Date.now() + CACHE_TTL_MS });
      }
      return data;
    })
    .finally(() => {
      inflight.delete(collectionName);
    });

  inflight.set(collectionName, task);
  return task;
}

// ניקוי יזום של המטמון (למשל אחרי עדכון מוצר מהאדמין).
export function clearServerCache() {
  cache.clear();
}

export function fetchProductsServer() {
  return fetchCollection('products');
}

export function fetchCategoriesServer() {
  return fetchCollection('categories');
}
