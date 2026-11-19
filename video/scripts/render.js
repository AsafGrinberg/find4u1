"use strict";

/**
 * render.js
 * ---------------------------------------------------------------
 * מייצר ריל אחד (1080x1920, 30fps) למוצר הבא בתור:
 *   1. שולף מוצר מ־Firestore שיש לו סרטון של המוכר באליאקספרס
 *   2. מוריד את הסרטון (זה הבסיס לריל — לא תמונות)
 *   3. כותב תסריט עברי ומקליט אותו (Google Chirp 3 HD / ElevenLabs)
 *   4. מרנדר עם Remotion: הסרטון עם קריינות וכתוביות מעליו
 *   5. מעתיק את ה־MP4 ל־public/videos כדי שיהיה לו URL ציבורי
 *      (אינסטגרם מקבל רק קובץ שנגיש בכתובת ציבורית)
 *
 * דורש: FIREBASE_SERVICE_ACCOUNT, GOOGLE_TTS_API_KEY or ELEVENLABS_API_KEY.
 */

const fs = require("fs");
const path = require("path");
const {bundle} = require("@remotion/bundler");
const {selectComposition, renderMedia} = require("@remotion/renderer");

const {initFirebase, pickProducts, downloadVideo} = require("./product");
const {synthesizeHebrew} = require("./tts");
const {mp3DurationSeconds} = require("./mp3-duration");
const {wavDurationSeconds} = require("./wav-duration");
const {mp4DurationSeconds} = require("./mp4-duration");
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

// מנסה את המוצרים לפי הסדר עד שסרטון אחד יורד בהצלחה.
async function resolveProduct(db) {
  const candidates = await pickProducts(db, 5);

  if (candidates.length === 0) {
    console.log(
      "[render] no product with a seller video is waiting for a reel. " +
        "Every recent product either already has videoPublishedAt or has no videoUrl."
    );
    return null;
  }

  for (const product of candidates) {
    try {
      const bytes = await downloadVideo(product.videoUrl);
      return {product, bytes};
    } catch (error) {
      console.warn(
        `[render] video skipped for ${product.id}: ${error.message}`
      );
    }
  }

  console.log("[render] none of the candidate product videos could be downloaded.");
  return null;
}

async function main() {
  ensureDir(OUT_DIR);
  ensureDir(MEDIA_DIR);
  cleanDir(MEDIA_DIR);

  const db = initFirebase();
  const chosen = await resolveProduct(db);
  if (!chosen) return;

  const {product, bytes: videoBytes} = chosen;
  const videoFile = path.join(MEDIA_DIR, "product.mp4");
  fs.writeFileSync(videoFile, videoBytes);

  const videoSeconds = mp4DurationSeconds(videoBytes);
  const videoFrames = Math.max(1, Math.round((videoSeconds || 8) * FPS));

  console.log(
    `[render] product: ${product.id} | ${product.name} | ${formatShekels(
      product.price
    )} | ${product.category} | video ${videoSeconds
      ? videoSeconds.toFixed(2) + "s"
      : "unknown"} (${(videoBytes.length / 1024 / 1024).toFixed(1)} MB)`
  );

  // ---- 1. תסריט + הקראה ------------------------------------------------
  const sentences = buildSentences(product);
  const text = speechText(sentences);
  console.log(`[render] script (${text.length} chars)`);
  sentences.forEach((item, index) =>
    console.log(`  ${index + 1}. ${item.text}  |  ${item.speech}`)
  );

  const {
    buffer: audioBuffer,
    source: audioSource,
    format: audioFormat,
    rate: audioRate,
  } = await synthesizeHebrew(text);

  // מנקים את שני הפורמטים האפשריים כדי שלא יישאר קובץ אודיו ישן.
  for (const name of ["tts.mp3", "tts.wav"]) {
    const stale = path.join(PUBLIC_DIR, name);
    if (fs.existsSync(stale)) fs.rmSync(stale, {force: true});
  }

  const audioExt = audioFormat === "wav" ? "wav" : "mp3";
  const audioFile = path.join(PUBLIC_DIR, `tts.${audioExt}`);
  fs.writeFileSync(audioFile, audioBuffer);

  const rawAudioSeconds =
    audioExt === "wav"
      ? wavDurationSeconds(audioBuffer)
      : mp3DurationSeconds(audioBuffer);
  // ה־<Audio> מתנגן ב־playbackRate, ולכן משך האודיו האפקטיבי קצר יותר.
  const audioSeconds = rawAudioSeconds / audioRate;
  const audioFrames = Math.ceil(audioSeconds * FPS);
  console.log(
    `[render] audio: ${audioSeconds.toFixed(2)}s (${audioFrames} frames) via ${audioSource} [${audioExt} @${audioRate}x]`
  );

  // ---- 2. פריימים וכתוביות --------------------------------------------
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
    video: "media/product.mp4",
    videoFrames,
    audio: `tts.${audioExt}`,
    audioRate,
    audioStartFrame: AUDIO_START_FRAME,
    audioFrames,
    captions,
    totalFrames,
  };

  // ---- 3. רינדור -------------------------------------------------------
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

  // ---- 4. העתקה לאתר (URL ציבורי לאינסטגרם / טלגרם) --------------------
  ensureDir(SITE_VIDEO_DIR);
  const fileName = `${safeName(product.slug || product.id)}.mp4`;
  const siteFile = path.join(SITE_VIDEO_DIR, fileName);
  fs.copyFileSync(outputLocation, siteFile);

  const publicUrl = `${SITE_URL}/videos/${encodeURIComponent(fileName)}`;
  const meta = {
    productId: product.id,
    productName: product.name,
    sourceTitle: product.sourceTitle || null,
    category: product.category,
    price: product.price,
    originalPrice: product.originalPrice,
    discount: product.discount,
    rating: product.rating,
    sales: product.sales,
    slug: product.slug,
    sourceVideo: product.videoUrl,
    sourceVideoSeconds: videoSeconds ? Number(videoSeconds.toFixed(2)) : null,
    file: path.relative(VIDEO_DIR, outputLocation).split(path.sep).join("/"),
    publicFile: `public/videos/${fileName}`,
    publicUrl,
    audioSource,
    audioFormat: audioExt,
    audioRate,
    durationSeconds: Number(audioSeconds.toFixed(2)),
    totalFrames,
    caption: captionText(product, sentences, SITE_URL.replace(/^https?:\/\//, "")),
    script: text,
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
