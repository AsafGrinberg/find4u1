"use strict";

/**
 * product.js
 * ---------------------------------------------------------------
 * שולף מ־Firestore את המוצר הבא לסרטון, מוריד את סרטון המוצר
 * מאליאקספרס ומסמן את המוצר אחרי שהסרטון נשלח/פורסם כדי שלא
 * ייווצר עליו ריל פעמיים.
 *
 * הריל נבנה אך ורק מסרטון שהמוכר העלה לאליאקספרס — לא מתמונות.
 */

const fs = require("fs");
const admin = require("firebase-admin");

/**
 * אישורי השירות מגיעים בשתי דרכים:
 *   FIREBASE_SERVICE_ACCOUNT       — ה-JSON כשורה אחת (כך זה ב-GitHub Actions)
 *   FIREBASE_SERVICE_ACCOUNT_FILE  — נתיב לקובץ ה-JSON (נוח להרצה מקומית)
 */
function serviceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  }

  const file = process.env.FIREBASE_SERVICE_ACCOUNT_FILE;
  if (file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  }

  throw new Error(
    "FIREBASE_SERVICE_ACCOUNT is missing (service account JSON as one line, " +
      "or FIREBASE_SERVICE_ACCOUNT_FILE pointing to the JSON file)."
  );
}

function initFirebase() {
  if (admin.apps.length) return admin.firestore();

  const credentials = serviceAccount();
  admin.initializeApp({
    credential: admin.credential.cert(credentials),
    projectId: credentials.project_id,
  });
  return admin.firestore();
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function imageList(data) {
  const list = [];
  if (Array.isArray(data.gallery)) list.push(...data.gallery);
  if (data.image) list.unshift(data.image);
  return [...new Set(list.filter((url) => typeof url === "string" && url))];
}

// רק MP4 ניתן לרנדר ב־Remotion. קישורי m3u8/HLS של אליאקספרס מדולגים.
function isMp4(url) {
  return /^https?:\/\//i.test(url) && /\.mp4(\?|$)/i.test(url);
}

/**
 * מחזיר את המוצרים הבאים שטרם קיבלו ריל ויש להם סרטון של המוכר,
 * מהמבטיח לרצוי פחות. render.js מנסה אותם לפי הסדר, כך שסרטון
 * שאי אפשר להוריד לא תוקע את כל הריצה.
 */
function toProduct(doc) {
  const data = doc.data();
  return {
    id: doc.id,
    ref: doc.ref,
    name: String(data.name || data.sourceTitle || "").trim(),
    title: String(data.name || "").trim(),
    // נדרש לקופירייטר: מכאן מזהים את היתרונות האמיתיים של המוצר.
    sourceTitle: String(data.sourceTitle || "").trim(),
    sourceCategory: String(data.sourceCategory || "").trim(),
    // התיאור והמפרט הארוכים מאליאקספרס (product-details.js ממלא אותם).
    sourceDescription: String(data.sourceDescription || "").trim(),
    specs: Array.isArray(data.sourceSpecs) ? data.sourceSpecs : [],
    brand: data.brand || null,
    category:
      (Array.isArray(data.category) && data.category[0]) || "מוצרים מומלצים",
    price: toNumber(data.price),
    originalPrice: toNumber(data.originalPrice),
    discount: toNumber(data.discountPercent),
    rating: toNumber(data.rating),
    sales: toNumber(data.sales),
    slug: data.slug || doc.id,
    link: data.link || "",
    images: imageList(data),
    videoUrl: String(data.videoUrl || "").trim(),
    // הסרטון שהפייפליין ייצר למוצר (עם קריינות). הוא זה שמוביל מהפיד
    // לדף המוצר, בניגוד לסרטון המקורי של המוכר.
    reel: data.reel || null,
    videoPublishedAt: data.videoPublishedAt || null,
  };
}

/**
 * מוצר מסוים לפי מזהה או slug — בשביל הפקת סרטון בדיקה מחדש.
 * עוקף את הסינון של videoPublishedAt (המוצר כבר סומן אחרי פרסום).
 * REEL_PRODUCT=motzei
 */
async function findProduct(db, value) {
  const direct = await db.collection("products").doc(value).get();
  if (direct.exists) return toProduct(direct);

  const bySlug = await db
    .collection("products")
    .where("slug", "==", value)
    .limit(1)
    .get();
  if (!bySlug.empty) return toProduct(bySlug.docs[0]);

  return null;
}

async function pickProducts(db, limit = 5) {
  // הפקת בדיקה: מוצר אחד מפורש, גם אם כבר פורסם עליו סרטון.
  const forced = process.env.REEL_PRODUCT;
  if (forced) {
    const product = await findProduct(db, forced.trim());
    if (!product) {
      throw new Error(`REEL_PRODUCT="${forced}" was not found in products`);
    }
    console.log(`[product] forced by REEL_PRODUCT: ${product.id} | ${product.name}`);
    return [product];
  }

  const snapshot = await db
    .collection("products")
    .orderBy("postedAt", "desc")
    .limit(300)
    .get();

  const candidates = snapshot.docs
    .map(toProduct)
    .filter((item) => item.name && isMp4(item.videoUrl))
    .filter((item) => !item.videoPublishedAt);

  if (candidates.length === 0) return [];

  candidates.sort((a, b) => {
    const score = (item) =>
      (item.rating || 0) +
      (item.sales ? Math.log10(item.sales + 1) : 0) +
      Math.min(item.images.length, 4) * 0.5;
    return score(b) - score(a);
  });

  return candidates.slice(0, limit);
}

const DOWNLOAD_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
  Accept: "video/mp4,video/*,*/*;q=0.8",
};

async function downloadImage(url, target) {
  const response = await fetch(url, {
    headers: {...DOWNLOAD_HEADERS, Accept: "image/avif,image/webp,image/*,*/*;q=0.8"},
  });

  if (!response.ok) {
    throw new Error(`image download failed: ${response.status} ${url}`);
  }

  const type = response.headers.get("content-type") || "";
  if (!type.startsWith("image/")) {
    throw new Error(`not an image (${type}): ${url}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

// מוריד את סרטון המוצר ומאמת שזה באמת וידאו (ולא דף שגיאה או פלייליסט HLS).
async function downloadVideo(url) {
  const response = await fetch(url, {headers: DOWNLOAD_HEADERS});

  if (!response.ok) {
    throw new Error(`video download failed: ${response.status} ${url}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const type = response.headers.get("content-type") || "";
  const looksLikeMp4 = buffer.indexOf("ftyp", 0, "ascii") !== -1;

  if (!looksLikeMp4) {
    throw new Error(`not an mp4 (${type}, ${buffer.length} bytes): ${url}`);
  }
  if (buffer.length < 20 * 1024) {
    throw new Error(`video is too small (${buffer.length} bytes): ${url}`);
  }

  return buffer;
}

async function markVideoPublished(db, product, details) {
  await product.ref.set(
    {
      videoPublishedAt: new Date().toISOString(),
      videoLast: {
        file: details.file || null,
        url: details.url || null,
        audio: details.audio || null,
        channels: details.channels || [],
      },
    },
    {merge: true}
  );
}

module.exports = {
  initFirebase,
  pickProducts,
  downloadImage,
  downloadVideo,
  markVideoPublished,
  imageList,
  isMp4,
};
