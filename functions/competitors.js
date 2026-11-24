"use strict";

/**
 * competitors.js
 * ---------------------------------------------------------------
 * יבוא מוצרים מערוצי מתחרים.
 *
 * מה זה עושה:
 *   1. קורא פוסטים מערוצי טלגרם ציבוריים (t.me/s/<channel>, בלי בוט ובלי
 *      הרשאות מיוחדות) ומקובץ "תיבה" שבו מדביקים פוסטים מוואטסאפ/ערוץ סגור.
 *   2. מחלץ מהפוסט רק את מזהה המוצר באליאקספרס ומפיק קישור שותפים משלנו
 *      (aliexpress.affiliate.link.generate) — לא מעתיק את הקישור שלהם.
 *   3. שולף את פרטי המוצר מהפיילייט API: שם, מחיר, תמונות, סרטון המוכר.
 *   4. כותב כיתוב עברי חדש משלנו (לא מעתיק את הטקסט שלהם), שומר את המוצר
 *      בקטלוג ומפרסם לערוץ שלנו.
 *
 * "מוצר כן, תוכן לא": אנחנו לוקחים את *המוצר* ומגישים אותו במילים שלנו.
 * הסרטון של המוכר נכנס לקטלוג, וה-AI מייצר ממנו ריל חדש עם קריינות עברית
 * בריצה היומית של weekly-reel — כך גם הווידאו מקבל עריכה וקול שלנו.
 *
 * קישורי אליבאבא (offer.alibaba.com/cps/...): אין API ליצירת קישור שותפים,
 * ולכן הם נשמרים כ"דורש לינק ידני" ולא מפורסמים אוטומטית.
 */

const fs = require("fs");
const path = require("path");

const {__test: ali} = require("./recommended");
const {escapeHtml, shekels, telegramApi, siteUrlOf} = require("./deals");

const SITE_URL = (process.env.SITE_URL || "https://find4u.vercel.app").replace(
  /\/$/,
  ""
);
const TELEGRAM_CHANNEL = process.env.TELEGRAM_CHANNEL || "@Find4U_official";
const IMPORT_LIMIT = Number(process.env.IMPORT_LIMIT || 2);
const DRY_RUN = process.env.IMPORT_DRY_RUN === "1";

const INBOX_FILE = path.join(__dirname, "..", "imports", "inbox.txt");
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36";

// ---- ערוצים -------------------------------------------------------------

// COMPETITOR_CHANNELS="shodedim, @another_channel, https://t.me/third"
const DEFAULT_CHANNELS = ["shodedim"];

function channelsFromEnv() {
  return String(process.env.COMPETITOR_CHANNELS || DEFAULT_CHANNELS.join(","))
    .split(/[,\s]+/)
    .map((value) => value.trim())
    .map((value) =>
      value
        .replace(/^https?:\/\/t\.me\//i, "")
        .replace(/^@/, "")
        .replace(/^s\//, "")
        .replace(/\/+$/, "")
    )
    .filter(Boolean);
}

// ---- HTML ---------------------------------------------------------------

function decodeEntities(text) {
  return String(text || "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function stripTags(html) {
  return decodeEntities(
    String(html || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// כל הודעה בעמוד הציבורי של טלגרם יושבת ב-div עם data-post="channel/id".
function parseChannelPage(html, channel) {
  const posts = [];
  const chunks = String(html || "").split('data-post="').slice(1);

  chunks.forEach((chunk) => {
    const postId = chunk.slice(0, chunk.indexOf('"'));
    if (!postId) return;

    const textMatch = chunk.match(
      /class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/
    );
    const text = textMatch ? stripTags(textMatch[1]) : "";

    const links = [];
    const hrefRe = /href="([^"]+)"/g;
    let match;
    while ((match = hrefRe.exec(chunk)) && links.length < 60) {
      const url = decodeEntities(match[1]);
      if (!/^https?:\/\//i.test(url)) continue;
      if (/^https?:\/\/t\.me\//i.test(url)) continue;
      if (!links.includes(url)) links.push(url);
    }

    const images = [];
    const bgRe = /background-image:url\('([^']+)'\)/g;
    while ((match = bgRe.exec(chunk))) {
      const url = match[1];
      if (/telegram\.org\/img\/emoji/.test(url)) continue;
      images.push(url.startsWith("//") ? `https:${url}` : url);
    }

    const videoMatch = chunk.match(/<video[^>]+src="([^"]+)"/);
    const video = videoMatch ? decodeEntities(videoMatch[1]) : null;

    posts.push({channel, postId, text, links, images, video});
  });

  return posts;
}

async function fetchChannelPosts(channel) {
  const response = await fetch(`https://t.me/s/${encodeURIComponent(channel)}`, {
    headers: {"User-Agent": USER_AGENT, "Accept-Language": "he-IL,he;q=0.9,en;q=0.8"},
    signal: AbortSignal.timeout(20000),
  });

  if (!response.ok) {
    throw new Error(`t.me/s/${channel} answered ${response.status}`);
  }

  const html = await response.text();
  const posts = parseChannelPage(html, channel);
  console.log(`[import] ${channel}: ${posts.length} posts on the public page`);
  return posts;
}

// ---- זיהוי מוצרים מתוך טקסט --------------------------------------------

const ALIEXPRESS_ITEM = /aliexpress\.com\/(?:item|i)\/(\d{6,})/gi;
const ALIEXPRESS_SHORT =
  /https?:\/\/(?:a|s\.click)\.aliexpress\.com\/[^\s"'<>]+/gi;
// קישור CPS של אליבאבא נושא את מזהה המוצר בפרמטר productId.
const ALIBABA_PRODUCT =
  /(https?:\/\/[^\s"'<>]*alibaba\.com\/[^\s"'<>]*productId=(\d+)[^\s"'<>]*)/gi;

function findProductIds(text) {
  const value = String(text || "");
  const aliExpress = [];
  const shortLinks = [];
  const alibaba = [];

  let match;
  ALIEXPRESS_ITEM.lastIndex = 0;
  while ((match = ALIEXPRESS_ITEM.exec(value))) {
    if (!aliExpress.includes(match[1])) aliExpress.push(match[1]);
  }

  ALIEXPRESS_SHORT.lastIndex = 0;
  while ((match = ALIEXPRESS_SHORT.exec(value))) {
    const url = match[0].replace(/[),.]+$/, "");
    if (!shortLinks.includes(url)) shortLinks.push(url);
  }

  ALIBABA_PRODUCT.lastIndex = 0;
  while ((match = ALIBABA_PRODUCT.exec(value))) {
    const url = decodeEntities(match[1]);
    const id = match[2];
    if (!alibaba.some((item) => item.id === id)) alibaba.push({id, url});
  }

  return {aliExpress, shortLinks, alibaba};
}

// קישור מקוצר של אליאקספרס (a.aliexpress.com/...) מסתיר את מזהה המוצר.
// פותחים אותו ידנית ועוקבים אחרי ההפניה עד שמגיעים לכתובת המוצר.
async function resolveShortLink(url, hops = 0) {
  if (hops > 5) return null;

  try {
    const response = await fetch(url, {
      redirect: "manual",
      headers: {"User-Agent": USER_AGENT},
      signal: AbortSignal.timeout(15000),
    });

    const location = response.headers.get("location");
    if (!location) {
      // לפעמים ההפניה נעשתה בצד השרת — בודקים את הכתובת הסופית.
      const finalId = response.url.match(/aliexpress\.com\/(?:item|i)\/(\d{6,})/i);
      return finalId ? finalId[1] : null;
    }

    const next = new URL(location, url).toString();
    const direct = next.match(/aliexpress\.com\/(?:item|i)\/(\d{6,})/i);
    if (direct) return direct[1];

    return resolveShortLink(next, hops + 1);
  } catch (error) {
    console.warn(`[import] short link failed (${url}): ${error.message}`);
    return null;
  }
}

// ---- כיתוב ---------------------------------------------------------------

// הכיתוב נכתב אצלנו מהנתונים של אליאקספרס. שום טקסט של המתחרה לא מועתק.
function importCaption(product) {
  const price = shekels(product.price);
  const original = shekels(product.originalPrice);
  const lines = [`🆕 <b>מצאנו בשבילכם</b>`, "", `<b>${escapeHtml(product.name)}</b>`, ""];

  if (price && original && Number(product.originalPrice) > Number(product.price)) {
    lines.push(`💰 <b>${price}</b> במקום ${original}`);
  } else if (price) {
    lines.push(`💰 <b>${price}</b>`);
  }
  if (Number(product.discountPercent) > 0) {
    lines.push(`📉 ${Math.round(Number(product.discountPercent))}% הנחה`);
  }
  if (Number(product.rating) > 0) {
    lines.push(`⭐ דירוג ${Number(product.rating).toFixed(1)} מתוך 5`);
  }
  if (Number(product.sales) > 0) {
    lines.push(`🔥 ${Number(product.sales).toLocaleString("he-IL")} נמכרו`);
  }

  lines.push("", "🚚 משלוח לישראל");
  return lines.join("\n").trim();
}

async function postImport(product, links) {
  const caption = [
    importCaption(product),
    "",
    links.affiliate ? `🛒 <b>לרכישה:</b>\n${escapeHtml(links.affiliate)}` : "",
    links.site ? `🔗 <b>דף המוצר באתר:</b>\n${escapeHtml(links.site)}` : "",
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 1024);

  const keyboard = [];
  if (product.link) {
    keyboard.push([{text: "🛒 לרכישה עכשיו", url: String(product.link)}]);
  }
  const site = siteUrlOf(product);
  if (site) keyboard.push([{text: "🔗 לדף המוצר", url: site}]);

  const message = await telegramApi("sendPhoto", {
    chat_id: TELEGRAM_CHANNEL,
    photo: product.image,
    caption,
    parse_mode: "HTML",
    reply_markup: keyboard.length > 0 ? {inline_keyboard: keyboard} : {},
  });

  return message && message.message_id ? message.message_id : null;
}

// ---- תיבה ידנית ----------------------------------------------------------

// פוסטים מוואטסאפ או מערוץ סגור מדביקים ל-imports/inbox.txt, מופרדים
// בשורה שמכילה רק ===. אותו טיפול בדיוק כמו פוסט מערוץ ציבורי.
function readInbox() {
  if (!fs.existsSync(INBOX_FILE)) return [];

  const text = fs.readFileSync(INBOX_FILE, "utf8");
  const blocks = text
    .split(/^\s*===+\s*$/m)
    // שורות שמתחילות ב-# הן הסבר, לא פוסט.
    .map((block) =>
      block
        .split("\n")
        .filter((line) => !/^\s*#/.test(line))
        .join("\n")
        .trim()
    )
    .filter(Boolean);

  return blocks.map((block, index) => ({
    channel: "inbox",
    postId: `inbox/${index + 1}`,
    text: block,
    links: (block.match(/https?:\/\/[^\s"'<>]+/g) || []).map((url) =>
      url.replace(/[),.]+$/, "")
    ),
    images: [],
    video: null,
  }));
}

// ---- יבוא ----------------------------------------------------------------

function importedDocId(post) {
  return `${post.channel}_${post.postId}`.replace(/[^\w-]/g, "_");
}

async function alreadyImported(firestore, post) {
  const doc = await firestore.collection("imports").doc(importedDocId(post)).get();
  return doc.exists && doc.get("status") !== "failed";
}

async function markImported(firestore, post, data) {
  await firestore
    .collection("imports")
    .doc(importedDocId(post))
    .set(
      {
        channel: post.channel,
        postId: post.postId,
        ...data,
        updatedAt: new Date().toISOString(),
      },
      {merge: true}
    );
}

/**
 * הופך מזהה מוצר לכרטיס מוצר מלא אצלנו: שם עברי, מחיר, תמונות, קישור שותפים.
 * מחזיר null אם אליאקספרס לא מחזיר את המוצר (נמחק / לא זמין לישראל).
 */
async function buildCandidate(productId, post) {
  let details = [];
  try {
    details = await ali.productDetails([productId]);
  } catch (error) {
    console.warn(`[import] details failed for ${productId}: ${error.message}`);
    return null;
  }

  const detail = details.find(
    (item) => String(item.product_id) === String(productId)
  );
  if (!detail) {
    console.log(`[import] ${productId} is not available from the affiliate API`);
    return null;
  }

  const affiliateLink = await ali.buildAffiliateLink(detail).catch((error) => {
    console.warn(`[import] affiliate link failed for ${productId}: ${error.message}`);
    return null;
  });

  if (!affiliateLink) return null;

  const nameHe = await ali.hebrewName(detail);
  const categoryEn = String(detail.second_level_category_name || "").trim();
  const categoryHe =
    (categoryEn && (await ali.translateToHebrew(categoryEn))) || "דילים";
  const slug = ali.slugFor(nameHe, productId);

  return {
    productId: String(productId),
    detail,
    affiliateLink,
    nameHe,
    categoryHe,
    slug,
    source: {channel: post.channel, postId: post.postId},
  };
}

async function publishCandidate(firestore, candidate) {
  const {productId, detail, affiliateLink, nameHe, categoryHe, slug, source} =
    candidate;

  const docId = `aliexpress_${productId}`;
  const ref = firestore.collection("products").doc(docId);
  const existing = await ref.get();

  if (existing.exists) {
    // מוצר שכבר נמצא אצלנו — לא דורסים את הנתונים שלו, רק מסמנים מקור.
    await ref.set({importedFrom: source}, {merge: true});
    return {docId, created: false, posted: false};
  }

  await ali.saveProduct(detail, affiliateLink, nameHe, categoryHe, slug);
  await ref.set({importedFrom: source}, {merge: true});

  const saved = {
    name: nameHe,
    price: ali.salePrice(detail),
    originalPrice: ali.originalPrice(detail),
    discountPercent: ali.discountPercent(detail),
    rating: Number(detail.evaluate_rate)
      ? ali.ratingOutOfFive(detail)
      : null,
    sales: Number(detail.lastest_volume) || null,
    image: ali.mainImage(detail),
    link: affiliateLink,
    slug,
  };

  if (DRY_RUN) {
    console.log(
      `[import] would post ${docId}\n${importCaption(saved)}\naffiliate: ${saved.link}`
    );
    return {docId, created: true, posted: false, dryRun: true};
  }

  const messageId = await postImport(saved, {
    affiliate: await ali.shortenUrl(affiliateLink),
    site: await ali.shortenUrl(siteUrlOf(saved) || ""),
  }).catch((error) => {
    console.error(`[import] telegram failed for ${docId}: ${error.message}`);
    return null;
  });

  if (messageId) {
    await ref.set(
      {
        telegramMessageIds: [messageId],
        dealPostedAt: new Date().toISOString(),
      },
      {merge: true}
    );
  }

  return {docId, created: true, posted: Boolean(messageId), messageId};
}

/**
 * מריץ יבוא אחד: ערוצים ציבוריים + התיבה הידנית.
 * מחזיר סיכום מלא כדי שאפשר יהיה לראות בלוג מה נכנס ומה נדחה.
 */
async function runImports(firestore) {
  const channels = channelsFromEnv();
  const sourcePosts = [];

  for (const channel of channels) {
    try {
      const posts = await fetchChannelPosts(channel);
      sourcePosts.push(...posts.slice(-25));
    } catch (error) {
      console.error(`[import] channel ${channel} failed: ${error.message}`);
    }
  }

  const inbox = readInbox();
  if (inbox.length > 0) {
    console.log(`[import] inbox: ${inbox.length} posts`);
    sourcePosts.push(...inbox);
  }

  if (sourcePosts.length === 0) {
    console.log(
      "[import] no sources. Set COMPETITOR_CHANNELS (public Telegram channels) " +
        "or paste posts into imports/inbox.txt."
    );
    return {posts: 0, imported: [], alibaba: [], skipped: 0};
  }

  const imported = [];
  const alibaba = [];
  const seen = new Set();
  let skipped = 0;

  for (const post of sourcePosts) {
    if (imported.length >= IMPORT_LIMIT) break;

    if (await alreadyImported(firestore, post)) {
      skipped += 1;
      continue;
    }

    const {aliExpress, shortLinks, alibaba: alibabaIds} = findProductIds(
      [post.text, ...(post.links || [])].join("\n")
    );

    if (alibabaIds.length > 0) {
      // אין API לקישור שותפים של אליבאבא: שומרים את מזהה המוצר ואת הכתובת
      // שאליה הקישור שלהם מוביל, כדי שההשלמה הידנית תהיה שני קליקים.
      alibaba.push({
        channel: post.channel,
        postId: post.postId,
        products: alibabaIds,
      });
      console.log(
        `[import] ${post.channel}/${post.postId}: Alibaba products ` +
          alibabaIds.map((item) => item.id).join(",") +
          " — need a manual affiliate link (no Alibaba API)"
      );
      await markImported(firestore, post, {
        status: "needs-manual-link",
        alibaba: alibabaIds,
      });
    }

    const ids = [...aliExpress];
    for (const shortLink of shortLinks.slice(0, 3)) {
      const resolved = await resolveShortLink(shortLink);
      if (resolved && !ids.includes(resolved)) ids.push(resolved);
    }

    if (ids.length === 0) {
      skipped += 1;
      if (alibabaIds.length === 0) {
        await markImported(firestore, post, {status: "no-product-link"});
      }
      continue;
    }

    let handled = false;
    for (const productId of ids) {
      if (imported.length >= IMPORT_LIMIT) break;
      if (seen.has(productId)) continue;
      seen.add(productId);

      const candidate = await buildCandidate(productId, post);
      if (!candidate) continue;

      try {
        const result = await publishCandidate(firestore, candidate);
        console.log(
          `[import] ${result.docId} | ${candidate.nameHe} | created: ${result.created} | posted: ${result.posted}`
        );
        imported.push({
          docId: result.docId,
          name: candidate.nameHe,
          source: `${post.channel}/${post.postId}`,
          posted: result.posted,
          dryRun: Boolean(result.dryRun),
        });
        handled = true;
      } catch (error) {
        console.error(
          `[import] save failed for ${productId}: ${error.message}`
        );
      }
    }

    if (handled) {
      await markImported(firestore, post, {
        status: "imported",
        products: ids,
      });
    }
  }

  console.log(
    `[import] done: ${imported.length} imported, ${alibaba.length} Alibaba posts ` +
      `need a manual link, ${skipped} already handled`
  );

  return {posts: sourcePosts.length, imported, alibaba, skipped};
}

module.exports = {
  runImports,
  // לבדיקות
  parseChannelPage,
  findProductIds,
  resolveShortLink,
  channelsFromEnv,
  readInbox,
  importCaption,
};
