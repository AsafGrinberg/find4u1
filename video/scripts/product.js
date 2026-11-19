"use strict";

/**
 * product.js
 * ---------------------------------------------------------------
 * שולף מ־Firestore את המוצר הבא לסרטון, מוריד את תמונותיו ומסמן
 * אותו אחרי שהסרטון נשלח/פורסם כדי שלא ייווצר עליו סרטון פעמיים.
 */

const admin = require("firebase-admin");

function initFirebase() {
  if (admin.apps.length) return admin.firestore();

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT is missing (service account JSON as one line)."
    );
  }

  const credentials = JSON.parse(raw);
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

/**
 * בוחר את המוצר שטרם קיבל סרטון. מעדיף מוצרים טריים עם כמה תמונות
 * ודירוג גבוה, ומדלג על כאלה שכבר הופיעו בריל.
 */
async function pickProduct(db) {
  const snapshot = await db
    .collection("products")
    .orderBy("postedAt", "desc")
    .limit(100)
    .get();

  const candidates = snapshot.docs
    .map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ref: doc.ref,
        name: String(data.name || data.sourceTitle || "").trim(),
        title: String(data.name || "").trim(),
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
        videoPublishedAt: data.videoPublishedAt || null,
      };
    })
    .filter((item) => item.name && item.images.length > 0)
    .filter((item) => !item.videoPublishedAt);

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const score = (item) =>
      Math.min(item.images.length, 4) * 2 +
      (item.rating || 0) +
      (item.sales ? Math.log10(item.sales + 1) : 0);
    return score(b) - score(a);
  });

  return candidates[0];
}

async function downloadImage(url, target) {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
      Accept: "image/avif,image/webp,image/*,*/*;q=0.8",
    },
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
  pickProduct,
  downloadImage,
  markVideoPublished,
  imageList,
};
