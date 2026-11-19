"use strict";

/**
 * render.js
 * ---------------------------------------------------------------
 * מייצר ריל אחד (1080x1920, 30fps) למוצר הבא בתור:
 *   1. שולף מוצר מ־Firestore
 *   2. כותב תסריט עברי ומקליט אותו (Google TTS / ElevenLabs)
 *   3. מוריד את תמונות המוצר
 *   4. מרנדר עם Remotion
 *   5. מעתיק את ה־MP4 ל־public/videos כדי שיהיה לו URL ציבורי
 *      (אינסטגרם מקבל רק קובץ שנגיש בכתובת ציבורית)
 *
 * דורש: FIREBASE_SERVICE_ACCOUNT, GOOGLE_TTS_API_KEY or ELEVENLABS_API_KEY.
 */

const fs = require("fs");
const path = require("path");
const {bundle} = require("@remotion/bundler");
const {selectComposition, renderMedia} = require("@remotion/renderer");

const {initFirebase, pickProduct, downloadImage} = require("./product");
const {synthesizeHebrew} = require("./tts");
const {mp3DurationSeconds} = require("./mp3-duration");
const {
  buildSentences,
  speechText,
  captionTimings,
  captionText,
  formatShekels,
  socialText,
} = require("./script");

const VIDEO_DIR = path.join(__dirname, "..");
const PUBLIC_DIR = path.join(VIDEO_DIR, "public");
const MEDIA_DIR = path.join(PUBLIC_DIR, "media");
const OUT_DIR = path.join(VIDEO_DIR, "out");
const SITE_DIR = path.join(VIDEO_DIR, "..", "public");
const SITE_VIDEO_DIR = path.join(SITE_DIR, "videos");
const SITE_URL = (process.env.SITE_URL || "https://find4u.vercel.app").replace(
  /\/$/,
  ""
);

const FPS = 30;
const AUDIO_START_FRAME = 45; // 1.5 שניות של הוק לפני הדיבור
const OUTRO_FRAMES = 90; // 3 שניות של קריאה לפעולה

function ensureDir(dir) {
  fs.mkdirSync(dir, {recursive: true});
}

function cleanDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir)) {
    fs.rmSync(path.join(dir, entry), {recursive: true, force: true});
  }
}

function safeName(value) {
  const base = String(value || "reel")
    .replace(/[^\p{L}\p{N}-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  return base || "reel";
}

async function main() {
  ensureDir(OUT_DIR);
  ensureDir(MEDIA_DIR);
  cleanDir(MEDIA_DIR);

  const db = initFirebase();
  const product = await pickProduct(db);

  if (!product) {
    console.log(
      "[render] no product is waiting for a reel — every recent product already has videoPublishedAt. Nothing to do."
    );
    return;
  }

  console.log(
    `[render] product: ${product.id} | ${product.name} | ${formatShekels(
      product.price
    )} | ${product.category} | ${product.images.length} images`
  );

  // ---- 1. תסריט + הקראה ------------------------------------------------
  const sentences = buildSentences(product);
  const text = speechText(sentences);
  console.log(`[render] script (${text.length} chars)`);
  sentences.forEach((item, index) =>
    console.log(`  ${index + 1}. ${item.text}`)
  );

  const {buffer: audioBuffer, source: audioSource} = await synthesizeHebrew(text);
  const audioFile = path.join(PUBLIC_DIR, "tts.mp3");
  fs.writeFileSync(audioFile, audioBuffer);

  const audioSeconds = mp3DurationSeconds(audioBuffer);
  const audioFrames = Math.ceil(audioSeconds * FPS);
  console.log(
    `[render] audio: ${audioSeconds.toFixed(2)}s (${audioFrames} frames) via ${audioSource}`
  );

  // ---- 2. תמונות -------------------------------------------------------
  const images = [];
  const wanted = product.images.slice(0, 4);
  for (let index = 0; index < wanted.length; index += 1) {
    const fileName = `product-${index + 1}.jpg`;
    try {
      const bytes = await downloadImage(wanted[index], fileName);
      fs.writeFileSync(path.join(MEDIA_DIR, fileName), bytes);
      images.push(`media/${fileName}`);
    } catch (error) {
      console.warn(`[render] image ${index + 1} skipped: ${error.message}`);
    }
  }

  if (images.length === 0) {
    throw new Error("No product image could be downloaded — aborting render.");
  }

  // ---- 3. פריימים וכתוביות --------------------------------------------
  const totalFrames = AUDIO_START_FRAME + audioFrames + OUTRO_FRAMES;
  const captions = captionTimings(sentences, audioFrames, AUDIO_START_FRAME);

  const inputProps = {
    brand: "Find4U",
    site: SITE_URL.replace(/^https?:\/\//, ""),
    title: product.title || product.name,
    category: product.category,
    price: formatShekels(product.price),
    originalPrice:
      product.originalPrice && product.originalPrice > (product.price || 0)
        ? formatShekels(product.originalPrice)
        : "",
    discount: product.discount ? `${Math.round(product.discount)}% הנחה` : "",
    social: socialText(product),
    images,
    audio: "tts.mp3",
    audioStartFrame: AUDIO_START_FRAME,
    audioFrames,
    captions,
    totalFrames,
  };

  // ---- 4. רינדור -------------------------------------------------------
  console.log(`[render] bundling Remotion… (${totalFrames} frames)`);
  const serveUrl = await bundle({
    entryPoint: path.join(VIDEO_DIR, "src", "index.js"),
    publicDir: PUBLIC_DIR,
  });

  const composition = await selectComposition({
    serveUrl,
    id: "ProductReel",
    inputProps,
  });

  const outputLocation = path.join(OUT_DIR, "reel.mp4");
  console.log(
    `[render] rendering ${composition.durationInFrames} frames @ ${composition.width}x${composition.height}…`
  );

  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation,
    inputProps,
    crf: 21,
    x264Preset: "medium",
    imageFormat: "jpeg",
    jpegQuality: 90,
    onProgress: ({progress}) => {
      if (Math.round(progress * 100) % 20 === 0) {
        console.log(`[render] ${Math.round(progress * 100)}%`);
      }
    },
  });

  // ---- 5. העתקה לאתר (URL ציבורי לאינסטגרם / טלגרם) --------------------
  ensureDir(SITE_VIDEO_DIR);
  const fileName = `${safeName(product.slug || product.id)}.mp4`;
  const siteFile = path.join(SITE_VIDEO_DIR, fileName);
  fs.copyFileSync(outputLocation, siteFile);

  const publicUrl = `${SITE_URL}/videos/${encodeURIComponent(fileName)}`;
  const meta = {
    productId: product.id,
    productName: product.name,
    category: product.category,
    price: product.price,
    originalPrice: product.originalPrice,
    discount: product.discount,
    rating: product.rating,
    sales: product.sales,
    slug: product.slug,
    file: path.relative(VIDEO_DIR, outputLocation).split(path.sep).join("/"),
    publicFile: `public/videos/${fileName}`,
    publicUrl,
    audioSource,
    durationSeconds: Number(audioSeconds.toFixed(2)),
    totalFrames,
    caption: captionText(product, sentences, SITE_URL.replace(/^https?:\/\//, "")),
    sentences,
  };

  fs.writeFileSync(
    path.join(OUT_DIR, "reel.json"),
    JSON.stringify(meta, null, 2)
  );

  fs.writeFileSync(
    path.join(VIDEO_DIR, "props.json"),
    JSON.stringify(inputProps, null, 2)
  );

  console.log(`[render] done: ${outputLocation}`);
  console.log(`[render] public: ${publicUrl}`);
  console.log(`[render] metadata: out/reel.json`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[render] failed:", error.message);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  });
