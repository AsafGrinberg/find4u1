"use strict";

/**
 * reply-social.js
 * ---------------------------------------------------------------
 * עונה לתגובות בפייסבוק ובאינסטגרם על הפוסטים שלנו, ושולח את הלינק גם
 * בהודעה פרטית (DM).
 *
 * למה זה קיים:
 * באינסטגרם אין קישור לחיץ בכיתוב, ובפייסבוק לא כולם פותחים את התגובה
 * הראשונה. מי שמגיב "אפשר לינק?" צריך לקבל תשובה — בתגובה וגם בהודעה.
 *
 * איך יודעים לאיזה מוצר שייך הפוסט?
 *   publish.js שומר על המוצר facebookPostIds / instagramMediaIds.
 *   כאן מחפשים את המוצר לפי המזהה הזה (array-contains), ולא מנחשים מטקסט.
 *
 * כללים:
 *   • עונים רק לתגובה שנראית כמו בקשה (לינק / מחיר / "אפשר" / מילת המפתח).
 *   • כל תגובה מסומנת ב-answeredComments, כך שריצה חוזרת לא שולחת שוב.
 *   • הניסוח מתחלף בין כמה אפשרויות, כדי שזה לא ייראה כמו רובוט.
 *   • כישלון ב-DM לא מונע את התגובה הציבורית, ולהיפך.
 *
 * הרצה מקומית (בלי לשלוח):
 *   node scripts/reply-social.js --dry-run
 *
 * סודות: FB_PAGE_ID / FB_PAGE_ACCESS_TOKEN / IG_USER_ID / IG_ACCESS_TOKEN
 *        FIREBASE_SERVICE_ACCOUNT / SITE_URL
 */

const {loadEnvFile, truthy} = require("./env");
loadEnvFile();

const socials = require("../../functions/socials");
const facebook = require("../../functions/facebook");
const instagram = require("../../functions/instagram");
const {initFirebase} = require("./product");
const {shortenUrl} = require("./short");

const SITE_URL = (process.env.SITE_URL || "https://find4u.vercel.app").replace(
  /\/$/,
  ""
);
const SITE_DOMAIN = SITE_URL.replace(/^https?:\/\//, "");
const MAX_REPLIES = Number(process.env.SOCIAL_REPLY_MAX_PER_RUN || 25);
const MAX_AGE_DAYS = Number(process.env.SOCIAL_REPLY_MAX_AGE_DAYS || 14);
const ARGV = process.argv.slice(2);
const DRY_RUN = ARGV.includes("--dry-run") || truthy(process.env.DRY_RUN);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// תגובה שנראית כמו בקשה. תגובה סתמית ("ואו", "אהבתי") לא מקבלת לינק,
// כדי שהתגובות לא ייראו כמו ספאם.
const REQUEST =
  /לינק|קישור|לינקים|מחיר|כמה (זה )?עולה|איפה (קונים|מזמינים)|אפשר|רוצה|צריך|מעוניין|מעניין|קונים|להזמין|link|price|where/i;

// ניסוחים מתחלפים. הבחירה לפי מזהה התגובה — יציבה אבל לא אחידה.
const PUBLIC_REPLIES = {
  facebook: [
    "שלחתי לך את הלינק בהודעה 📩 קיבלת? כל הפרטים גם כאן:",
    "כתבתי לך בפרטי ✅ ודף המוצר עם כל המחירים:",
    "הלינק אצלך ב-Messenger 📨 וכאן כל המידע:",
    "שלחתי!! כנס ותזמין, שווה כל שקל 😊 כל הפרטים כאן:",
  ],
  instagram: [
    "שלחתי לך בפרטי 📩 קיבלת? כל המידע בדף המוצר:",
    "אצלך ב-DM ✅ כל הפרטים והמחירים כאן:",
    "כתבתי לך בהודעה 📨 ודף המוצר עם כל המידע:",
    "שלחתי!! שווה כל שקל 😊 כל הפרטים כאן:",
  ],
};

function variantFor(list, seed) {
  const text = String(seed || "");
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) % 100000;
  }
  return list[hash % list.length];
}

function productPage(product) {
  if (product.slug) return `${SITE_URL}/product/${encodeURIComponent(product.slug)}`;
  return SITE_URL;
}

function purchaseUrl(product) {
  return product.link || product.affiliateUrl || "";
}

// הלינק של אליאקספרס וכתובת דף המוצר (עם ה-slug בעברית) ארוכים מאוד
// ונשברים לשורות בתגובה. מקצרים אותם פעם אחת לכל מוצר — בדיוק כמו
// שהפוסטים בטלגרם מציגים אותם.
async function shortLinksFor(product) {
  const cacheKey = String(product.id || product.slug || product.name || "");
  if (shortLinksCache.has(cacheKey)) return shortLinksCache.get(cacheKey);
  const links = {
    buy: await shortenUrl(purchaseUrl(product)),
    page: await shortenUrl(productPage(product)),
  };
  shortLinksCache.set(cacheKey, links);
  return links;
}

const shortLinksCache = new Map();

async function messageBody(product, signature, links) {
  const lines = [`🛍️ ${product.name || "מוצר מ-Find4U"}`];
  const price = Number(product.price);
  if (Number.isFinite(price) && price > 0) {
    lines.push(`💰 ${price.toLocaleString("he-IL")} ₪`);
  }
  if (links.buy) lines.push(`🛒 לרכישה: ${links.buy}`);
  lines.push(`🌐 דף המוצר: ${links.page}`);
  lines.push("📍 כל המידע והמחירים של המוצר אפשר למצוא בדף המוצר");
  if (signature) lines.push(signature);
  return lines.join("\n");
}

async function openStore(db) {
  const answered = db.collection("answeredComments");
  const products = db.collection("products");
  // נטענים רק כשצריך — לפוסטים ישנים בלי מזהה שמור.
  let cachedProducts = null;

  return {
    async answered(commentId) {
      const doc = await answered.doc(String(commentId)).get();
      return doc.exists ? doc.data() : null;
    },
    async remember(commentId, data) {
      await answered.doc(String(commentId)).set(data, {merge: true});
    },
    /** המוצר שהפוסט הזה פורסם עבורו — לפי המזהה שנשמר בפרסום. */
    async productFor(field, objectId) {
      const snapshot = await products
        .where(field, "array-contains", String(objectId))
        .limit(1)
        .get();
      if (snapshot.empty) return null;
      const doc = snapshot.docs[0];
      return {id: doc.id, ...doc.data()};
    },

    /**
     * גיבוי לפוסטים ותיקים (לפני שהתחלנו לשמור מזהים): מזהים את המוצר
     * לפי הכיתוב עצמו — קודם הלינק לדף המוצר, ואם אין — לפי שם המוצר
     * (הכיתוב שלנו תמיד כולל שורת "🛍️ <שם המוצר>").
     */
    async productForCaption(caption) {
      const text = String(caption || "");
      const match = /\/product\/([^\s?&"']+)/.exec(text);
      if (match) {
        let slug = match[1];
        try {
          slug = decodeURIComponent(slug);
        } catch (error) {
          // משאירים כמו שהוא — ה-slug כבר נקי.
        }
        const snapshot = await products.where("slug", "==", slug).limit(1).get();
        if (!snapshot.empty) {
          const doc = snapshot.docs[0];
          return {id: doc.id, ...doc.data()};
        }
      }

      if (!text) return null;
      if (!cachedProducts) {
        const snapshot = await products.limit(600).get();
        cachedProducts = snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));
      }

      let best = null;
      let bestScore = 0;
      for (const product of cachedProducts) {
        const words = String(product.name || "")
          .split(/\s+/)
          .filter((word) => word.length >= 4);
        if (words.length < 2) continue;
        const hits = words.filter((word) => text.includes(word)).length;
        const score = hits / words.length;
        if (score > bestScore) {
          best = product;
          bestScore = score;
        }
      }
      return bestScore >= 0.6 ? best : null;
    },
  };
}

async function answer(platform, store, objectId, product, comment, budget) {
  if (budget <= 0) return 0;
  const text = String(comment.message || comment.text || "");
  if (!REQUEST.test(text)) return 0;

  const commentId = comment.id;
  if (!commentId) return 0;

  const previous = await store.answered(commentId);
  // כבר נשלחו גם תגובה וגם הודעה — אין מה לעשות.
  if (previous && previous.dmId) return 0;
  // תגובה ציבורית כן נשלחה בריצה קודמת אבל ה-DM נכשל. אין טעם לענות
  // לתגובה שוב — מנסים רק את ההודעה הפרטית.
  const dmOnly = Boolean(previous);

  const signature = await socials.signature({skip: [platform]});
  const links = await shortLinksFor(product);
  const lines = [variantFor(PUBLIC_REPLIES[platform], commentId)];
  if (links.buy) lines.push(`🛒 ${links.buy}`);
  lines.push(`🌐 ${links.page}`, signature);
  const publicText = lines.filter(Boolean).join("\n");
  const dm = await messageBody(product, signature, links);

  if (DRY_RUN) {
    if (!dmOnly) {
      console.log(`[social] DRY_RUN ${platform} reply ${commentId}: ${publicText}`);
    }
    console.log(`[social] DRY_RUN ${platform} dm ${commentId}: ${dm}`);
    return 1;
  }

  let replyId = dmOnly ? previous.replyId || null : null;
  let dmId = null;

  if (!dmOnly) {
    try {
      replyId =
        platform === "facebook"
          ? await facebook.replyToComment(commentId, publicText)
          : await instagram.replyToComment(commentId, publicText);
    } catch (error) {
      console.warn(`[social] ${platform} reply ${commentId} failed — ${error.message}`);
    }
  }

  try {
    dmId =
      platform === "facebook"
        ? await facebook.sendPrivateReply(commentId, dm)
        : await instagram.sendPrivateReply(commentId, dm);
  } catch (error) {
    console.warn(`[social] ${platform} dm ${commentId} failed — ${error.message}`);
  }

  if (!replyId && !dmId) return 0;

  await store
    .remember(commentId, {
      platform,
      objectId: String(objectId),
      productId: product.id,
      replyId,
      dmId,
      // נשאר true עד שה-DM יישלח, כדי שריצה הבאה תנסה שוב (Private Reply
      // אחת לתגובה, ולכן לא שולחים תגובה ציבורית כפולה).
      dmPending: !dmId,
      attempts: Number(previous?.attempts || 0) + 1,
      repliedAt: new Date().toISOString(),
      source: "reply-social",
    })
    .catch(() => {});

  console.log(
    `[social] ${platform} ${commentId}: reply ${replyId ? "ok" : "no"}, dm ${dmId ? "ok" : "no"}`
  );
  return 1;
}

async function runPlatform(platform, db, store, budget) {
  const limit = Number(process.env.SOCIAL_REPLY_OBJECTS || 15);
  let replied = 0;
  let scanned = 0;

  const objects =
    platform === "facebook"
      ? await facebook.recentObjects(limit)
      : await instagram.recentMedia(limit);

  console.log(`[social] ${platform}: ${objects.length} recent posts`);

  for (const object of objects) {
    if (replied >= budget) break;

    let product = await store.productFor(
      platform === "facebook" ? "facebookPostIds" : "instagramMediaIds",
      object.id
    );
    if (!product) {
      const caption =
        platform === "facebook"
          ? await facebook.objectMessage(object.id)
          : object.caption;
      product = await store.productForCaption(caption);
    }
    if (!product) {
      console.log(`[social] ${platform} ${object.id}: no product mapping (skipped)`);
      continue;
    }

    let comments = [];
    try {
      comments =
        platform === "facebook"
          ? await facebook.commentsOf(object.id)
          : await instagram.commentsOf(object.id);
    } catch (error) {
      console.warn(`[social] ${platform} comments ${object.id} failed — ${error.message}`);
      continue;
    }

    const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
    for (const comment of comments) {
      if (replied >= budget) break;
      scanned += 1;
      const when = new Date(comment.created_time || comment.timestamp || 0).getTime();
      if (Number.isFinite(when) && when > 0 && when < cutoff) continue;

      replied += await answer(
        platform,
        store,
        object.id,
        product,
        comment,
        budget - replied
      );
      await sleep(400);
    }
  }

  console.log(
    `[social] ${platform}: scanned ${scanned} comments, answered ${replied}` +
      (DRY_RUN ? " (dry run — nothing was sent)" : "")
  );
  return replied;
}

async function main() {
  const db = initFirebase();
  const store = await openStore(db);
  let total = 0;

  if (facebook.configured() && process.env.SKIP_FACEBOOK !== "1") {
    total += await runPlatform("facebook", db, store, MAX_REPLIES - total);
  } else {
    console.log("[social] facebook is not configured — skipped");
  }

  if (instagram.configured()) {
    total += await runPlatform("instagram", db, store, MAX_REPLIES - total);
  } else {
    console.log("[social] instagram is not configured — skipped");
  }

  console.log(`[social] done. answered ${total} comments`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[social] failed:", error.message);
    process.exit(1);
  });
