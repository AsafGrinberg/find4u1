"use strict";

/**
 * scene-cuts.js
 * ---------------------------------------------------------------
 * מוצא איפה באמת מתחלף שוט בסרטון של המוכר, כדי שהקליפים בריל
 * ייחתכו על מעבר אמיתי ולא באמצע תנועה.
 *
 * למה זה חשוב: קודם הסרטון נחתך לחלקים שווים לפי מספר המשפטים.
 * ב־25 שניות ו־10 משפטים זה יוצא מקטע של 2.5 שניות עם חיתוך באמצע
 * שוט ועם לופ שחוזר על עצמו — בדיוק מה שנראה "חתוך מדי".
 *
 * ffmpeg מסמן פריים כחתך כשהיסט התמונה עובר סף (scene). מכאן נגזרים
 * גבולות השוטים. אם ffmpeg לא זמין או לא נמצאו חיתוכים — נפילה
 * לחלוקה שווה, כדי שרינדור לא ייכשל בגלל זה.
 */

const {spawnSync} = require("child_process");

const DEFAULT_THRESHOLD = 0.32;
// שוט קצר מזה הוא בדרך כלל הבהוב מעבר — לא שווה קליפ.
const MIN_SHOT_SECONDS = 0.8;
// לא חותכים קרוב מדי לסוף: פריים גבולי מפיל את הרינדור.
const TAIL_GUARD_SECONDS = 0.25;
const EVEN_SHOTS = 5;
const FFMPEG_TIMEOUT_MS = 120000;

function parseTimes(stderr) {
  const times = [];
  const pattern = /pts_time:([0-9]+(?:\.[0-9]+)?)/g;
  let match;
  while ((match = pattern.exec(stderr))) times.push(Number(match[1]));
  return times;
}

/**
 * מחזיר את זמני החיתוך בשניות (בלי 0 ובלי הסוף), או null אם ffmpeg
 * לא עבד או שלא נמצאו חיתוכים.
 */
function detectCutTimes(file, {threshold = DEFAULT_THRESHOLD} = {}) {
  const result = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-nostats",
      "-i",
      file,
      "-filter:v",
      `select='gt(scene\\,${threshold})',showinfo`,
      "-an",
      "-f",
      "null",
      "-",
    ],
    {encoding: "utf8", timeout: FFMPEG_TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024}
  );

  if (!result || result.error) return null;

  const times = parseTimes(String(result.stderr || ""));
  return times.length ? times : null;
}

/**
 * גבולות שוטים בפריימים של הקומפוזיציה (30fps), כולל 0 והסוף.
 * @returns {{cuts:number[], shots:Array<{start:number, frames:number}>, source:string}}
 */
function planSourceShots(file, {fps = 30, seconds, threshold} = {}) {
  const totalFrames = Math.max(1, Math.round((Number(seconds) || 8) * fps));
  const times = file ? detectCutTimes(file, {threshold}) : null;

  const cutFrames = new Set([0, totalFrames]);
  for (const time of times || []) {
    if (!Number.isFinite(time)) continue;
    if (time < MIN_SHOT_SECONDS) continue;
    if (time > (Number(seconds) || 0) - TAIL_GUARD_SECONDS) continue;
    const frame = Math.round(time * fps);
    if (frame > 0 && frame < totalFrames) cutFrames.add(frame);
  }

  let cuts = [...cutFrames].sort((a, b) => a - b);
  let source = times ? "ffmpeg" : "even";

  if (cuts.length < 3) {
    // אין מה לחלק: חלוקה שווה, אבל לפחות לא לפי מספר המשפטים.
    const step = Math.max(1, Math.round(totalFrames / EVEN_SHOTS));
    cuts = [0];
    for (let frame = step; frame < totalFrames; frame += step) cuts.push(frame);
    cuts.push(totalFrames);
    source = "even";
  }

  const shots = [];
  for (let i = 0; i < cuts.length - 1; i += 1) {
    const start = cuts[i];
    const frames = Math.min(cuts[i + 1] - start, totalFrames - start);
    if (frames >= 1) shots.push({start, frames});
  }

  return {cuts, shots, source};
}

module.exports = {planSourceShots, detectCutTimes, MIN_SHOT_SECONDS};
