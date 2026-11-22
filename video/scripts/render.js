"use strict";

/**
 * render.js
 * ---------------------------------------------------------------
 * מייצר ריל אחד (1080x1920, 30fps) למוצר הבא בתור:
 *   1. שולף מוצר מ־Firestore שיש לו סרטון של המוכר באליאקספרס
 *   2. מוריד את הסרטון (זה הבסיס לריל — לא תמונות)
 *   3. כותב תסריט עברי ומקליט אותו משפט-משפט (Google Voice / ElevenLabs)
 *   4. בונה ציר זמן אמיתי מהמשכים שנמדדו (timeline.js): כתוביות,
 *      החלפת קליפ לכל משפט, ומסך סיום קצר
 *   5. מרנדר עם Remotion
 *   6. מעתיק את ה־MP4 ל־public/videos כדי שיהיה לו URL ציבורי
 *
 * דורש: FIREBASE_SERVICE_ACCOUNT, GOOGLE_TTS_API_KEY or ELEVENLABS_API_KEY.
 */

const fs = require("fs");
const path = require("path");
const {bundle} = require("@remotion/bundler");
const {selectComposition, renderMedia} = require("@remotion/renderer");

const {initFirebase, pickProducts, downloadVideo} = require("./product");
const {synthesizeSentences} = require("./tts");
const {mp4DurationSeconds} = require("./mp4-duration");
const {buildTimeline} = require("./timeline");
const {planSourceShots} = require("./scene-cuts");
const {
  buildScript,
  speechText,
  captionText,
  formatShekels,
  SENTENCE_SECONDS,
} = require("./script");

const VIDEO_DIR = path.join(__dirname, "..");
const PUBLIC_DIR = path.join(VIDEO_DIR, "public");
const MEDIA_DIR = path.join(PUBLIC_DIR, "media");
const TTS_DIR = path.join(PUBLIC_DIR, "tts");
const OUT_DIR = path.join(VIDEO_DIR, "out");
const SITE_DIR = path.join(VIDEO_DIR, "..", "public");
const SITE_VIDEO_DIR = path.join(SITE_DIR, "videos");
const SITE_URL = (process.env.SITE_URL || "https://find4u.vercel.app").replace(
  /\/$/,
  ""
);

const FPS = 30;
// הדיבור מתחיל מיד: ההוק הוא הפריים הראשון, לא כרטיס פתיחה.
const LEAD_IN_FRAMES = 6; // 0.2s
const OUTRO_FRAMES = 45; // 1.5s מסך סיום

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
      console.warn(`[render] video skipped for ${product.id}: ${error.message}`);
    }
  }

  console.log("[render] none of the candidate product videos could be downloaded.");
  return null;
}

async function main() {
  ensureDir(OUT_DIR);
  ensureDir(MEDIA_DIR);
  ensureDir(TTS_DIR);
  cleanDir(MEDIA_DIR);
  cleanDir(TTS_DIR);

  const db = initFirebase();
  const chosen = await resolveProduct(db);
  if (!chosen) return;

  const {product, bytes: videoBytes} = chosen;
  const videoFile = path.join(MEDIA_DIR, "product.mp4");
  fs.writeFileSync(videoFile, videoBytes);

  const videoSeconds = mp4DurationSeconds(videoBytes);
  // floor ולא round: סרטון של 58.125s הוא 1743 פריימים ולא 1746, וביקוש
  // לפריים מעבר לסוף הסרטון מפיל את הרינדור ("No frame found at position").
  const videoFrames = Math.max(1, Math.floor((videoSeconds || 8) * FPS));

  // גבולות השוטים האמיתיים של הסרטון — החיתוכים בריל ייפלו עליהם, ולא
  // באמצע תנועה. אם ffmpeg לא זמין או לא נמצאו חיתוכים, planSourceShots
  // מחזיר חלוקה שווה.
  const {shots, source: shotSource} = planSourceShots(videoFile, {
    fps: FPS,
    seconds: videoSeconds || 8,
  });
  console.log(
    `[render] shots: ${shots.length} (${shotSource}) — ${shots
      .map((shot) => (shot.frames / FPS).toFixed(1) + "s")
      .join(", ")}`
  );

  console.log(
    `[render] product: ${product.id} | ${product.name} | ${formatShekels(
      product.price
    )} | ${product.category} | video ${videoSeconds
      ? videoSeconds.toFixed(2) + "s"
      : "unknown"} (${(videoBytes.length / 1024 / 1024).toFixed(1)} MB)`
  );

  // ---- 1. תסריט --------------------------------------------------------
  // סרטון של 14 שניות לא יכול לשאת קריינות של 26 שניות: בלי התקרה הזאת
  // אותה תנועה חוזרת שלוש פעמים וזה נראה כמו עריכה שבורה.
  const maxSentences = Math.max(
    7,
    Math.round(((videoSeconds || 8) * 1.15) / SENTENCE_SECONDS)
  );
  const {sentences, keyword} = buildScript(product, {maxSentences});
  const text = speechText(sentences);
  console.log(
    `[render] script (${text.length} chars, ${sentences.length}/${maxSentences} sentences, keyword "${keyword}")`
  );
  sentences.forEach((item, index) =>
    console.log(`  ${index + 1}. [${item.role}] ${item.speech} (${item.rate}x)`)
  );

  // ---- 2. הקראה משפט-משפט ---------------------------------------------
  const {provider, voice, segments} = await synthesizeSentences(sentences);
  segments.forEach((segment, index) => {
    const file = `${String(index + 1).padStart(2, "0")}.${segment.format}`;
    fs.writeFileSync(path.join(TTS_DIR, file), segment.buffer);
    segment.file = `tts/${file}`;
  });

  // ---- 3. ציר זמן ------------------------------------------------------
  const timeline = buildTimeline({
    sentences,
    durations: segments.map((segment) => segment.seconds),
    videoFrames,
    shots,
    fps: FPS,
    leadInFrames: LEAD_IN_FRAMES,
    outroFrames: OUTRO_FRAMES,
  });

  const audioSegments = segments.map((segment, index) => ({
    file: segment.file,
    from: timeline.audioSegments[index].from,
    durationInFrames: timeline.audioSegments[index].durationInFrames,
    playbackRate: segment.playbackRate,
  }));

  const audioSeconds = timeline.audioEndFrame / FPS;
  console.log(
    `[render] timeline: ${audioSeconds.toFixed(
      2
    )}s narration, ${timeline.totalFrames} frames (${(
      timeline.totalFrames / FPS
    ).toFixed(2)}s total) via ${provider} / ${voice}`
  );
  console.log(
    `[render] captions: ${timeline.captions.length} cues, first "${timeline.captions[0].text}" @${timeline.captions[0].from}`
  );
  console.log(
    `[render] clips: ${timeline.clips.length} — ` +
      timeline.clips
        .map(
          (clip) =>
            `${clip.layout}@${(clip.from / FPS).toFixed(1)}s ${clip.playbackRate}x`
        )
        .join(", ")
  );

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
    keyword,
    video: "media/product.mp4",
    videoFrames,
    audioSegments,
    audioStartFrame: timeline.audioStartFrame,
    audioFrames: timeline.audioEndFrame - timeline.audioStartFrame,
    captions: timeline.captions,
    clips: timeline.clips,
    heroEnd: timeline.heroEnd,
    outroStart: timeline.outroStart,
    totalFrames: timeline.totalFrames,
  };

  fs.writeFileSync(
    path.join(VIDEO_DIR, "props.json"),
    JSON.stringify(inputProps, null, 2)
  );

  // ---- 4. רינדור -------------------------------------------------------
  console.log(`[render] bundling Remotion… (${timeline.totalFrames} frames)`);
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

  // ---- 5. העתקה לאתר (URL ציבורי לאינסטגרם / טלגרם) -------------------
  // בהרצת בדיקה מקומית לא דורסים את הקובץ המפורסם באתר.
  const fileName = `${safeName(product.slug || product.id)}.mp4`;
  if (process.env.REEL_SKIP_PUBLISH_COPY === "1") {
    console.log("[render] REEL_SKIP_PUBLISH_COPY=1 — public/videos was not touched");
  } else {
    ensureDir(SITE_VIDEO_DIR);
    fs.copyFileSync(outputLocation, path.join(SITE_VIDEO_DIR, fileName));
  }

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
    sourceShots: shots.map((shot) => ({
      start: Number((shot.start / FPS).toFixed(2)),
      seconds: Number((shot.frames / FPS).toFixed(2)),
    })),
    shotSource,
    file: path.relative(VIDEO_DIR, outputLocation).split(path.sep).join("/"),
    publicFile: `public/videos/${fileName}`,
    publicUrl,
    audioSource: provider,
    audioVoice: voice,
    audioSegments: segments.map((segment) => ({
      file: segment.file,
      seconds: Number(segment.seconds.toFixed(2)),
      playbackRate: segment.playbackRate,
      format: segment.format,
      pace: segment.pace,
    })),
    durationSeconds: Number(audioSeconds.toFixed(2)),
    totalSeconds: Number((timeline.totalFrames / FPS).toFixed(2)),
    totalFrames: timeline.totalFrames,
    outroFrames: OUTRO_FRAMES,
    captions: timeline.captions,
    caption: captionText(
      product,
      sentences,
      SITE_URL.replace(/^https?:\/\//, ""),
      keyword
    ),
    script: text,
    sentences,
  };

  fs.writeFileSync(
    path.join(OUT_DIR, "reel.json"),
    JSON.stringify(meta, null, 2)
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
