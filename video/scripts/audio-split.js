"use strict";

/**
 * audio-split.js
 * ---------------------------------------------------------------
 * מפצל קובץ WAV אחד להקראה ארוכה (Gemini TTS) למקטעים לפי המשפטים.
 *
 * למה זה נחוץ: המכסה החינמית של Gemini TTS היא 10 בקשות ביום למודל.
 * הקראה של 10 משפטים בבקשה-לכל-משפט שורפת בקשה שלמה על סרטון אחד,
 * ולכן כל התסריט נשלח בבקשה אחת — וזה גם נותן פרוזודיה זורמת יותר.
 * אלא שאז אין לנו משך לכל משפט, והמשך הזה קובע את הכתוביות ואת
 * חילופי הקליפים (timeline.js). לכן מפצלים את האודיו בחזרה.
 *
 * השיטה: מאתרים שקט בין משפטים (חלון 20ms, סף יחסי לרמת הדיבור),
 * ובוחרים את השקטים הארוכים ביותר כמספר הגבולות הדרוש. אם המנוע דיבר
 * רצוף בלי הפסקות — מפצלים לפי אורך הטקסט של כל משפט, כדי שהצינור
 * לא ייפול ואף פעם לא ייצא סרטון בלי משך לכל משפט.
 *
 * מחזיר [{buffer, seconds, boundary: "silence"|"estimate"}] או null.
 */

const WINDOW_MS = 20;
const MIN_SILENCE_MS = 90;
const KEEP_EDGE_MS = 30;

function parseWav(buffer) {
  if (
    buffer.length < 44 ||
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WAVE"
  ) {
    return null;
  }

  let offset = 12;
  let fmt = null;
  let data = null;

  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;

    if (id === "fmt ") {
      fmt = {
        audioFormat: buffer.readUInt16LE(body),
        channels: buffer.readUInt16LE(body + 2),
        sampleRate: buffer.readUInt32LE(body + 4),
        bitsPerSample: buffer.readUInt16LE(body + 14),
      };
    }
    if (id === "data") {
      data = {start: body, size: Math.min(size, buffer.length - body)};
      break;
    }
    offset = body + size + (size % 2);
  }

  if (!fmt || !data) return null;
  return {fmt, data};
}

function wavHeader({channels, sampleRate, bitsPerSample}, dataSize) {
  const blockAlign = (channels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * blockAlign, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(dataSize, 40);
  return header;
}

/**
 * @param {Buffer} buffer  WAV PCM16
 * @param {number[]} weights  אורך יחסי לכל משפט (מספר תווים)
 * @returns {Array<{buffer: Buffer, seconds: number, boundary: string}>|null}
 */
function splitWavBySentences(buffer, weights) {
  const parsed = parseWav(buffer);
  if (!parsed || parsed.fmt.bitsPerSample !== 16 || parsed.fmt.audioFormat !== 1) {
    return null;
  }
  const count = weights.length;
  if (count === 0) return null;
  if (count === 1) {
    const seconds = parsed.data.size / (parsed.fmt.sampleRate * parsed.fmt.channels * 2);
    return [{buffer, seconds, boundary: "single"}];
  }

  const {channels, sampleRate} = parsed.fmt;
  const blockAlign = channels * 2;
  const frames = Math.floor(parsed.data.size / blockAlign);
  if (!frames) return null;

  const windowFrames = Math.max(1, Math.round((WINDOW_MS / 1000) * sampleRate));
  const windowCount = Math.ceil(frames / windowFrames);
  const peaks = new Float64Array(windowCount);

  for (let w = 0; w < windowCount; w += 1) {
    const from = w * windowFrames;
    const to = Math.min(frames, from + windowFrames);
    let peak = 0;
    for (let f = from; f < to; f += 1) {
      const base = parsed.data.start + f * blockAlign;
      for (let channel = 0; channel < channels; channel += 1) {
        const value = Math.abs(buffer.readInt16LE(base + channel * 2));
        if (value > peak) peak = value;
      }
    }
    peaks[w] = peak / 32768;
  }

  const sorted = Array.from(peaks).sort((a, b) => a - b);
  const speechLevel = sorted[Math.floor(sorted.length * 0.9)] || 0;
  const threshold = Math.max(0.004, Math.min(0.03, speechLevel * 0.04));

  // אזורי שקט פנימיים (לא בהתחלה ובסוף).
  const silences = [];
  let runStart = -1;
  for (let w = 0; w < windowCount; w += 1) {
    const quiet = peaks[w] <= threshold;
    if (quiet && runStart === -1) runStart = w;
    if ((!quiet || w === windowCount - 1) && runStart !== -1) {
      const runEnd = quiet ? w : w - 1;
      const startFrame = runStart * windowFrames;
      const endFrame = Math.min(frames, (runEnd + 1) * windowFrames);
      const durationMs = ((endFrame - startFrame) / sampleRate) * 1000;
      if (
        durationMs >= MIN_SILENCE_MS &&
        startFrame > KEEP_EDGE_MS * 24 &&
        endFrame < frames - KEEP_EDGE_MS * 24
      ) {
        silences.push({
          center: Math.round((startFrame + endFrame) / 2),
          durationMs,
        });
      }
      runStart = -1;
    }
  }

  const totalWeight = weights.reduce((sum, w) => sum + w, 0) || count;
  const cuts = [];

  if (silences.length >= count - 1) {
    const chosen = [...silences]
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, count - 1)
      .sort((a, b) => a.center - b.center);
    chosen.forEach((silence) => cuts.push({frame: silence.center, type: "silence"}));
  } else {
    // נפילה לאחור: פיצול לפי אורך הטקסט, מוצמד לשקט הקרוב אם יש.
    let cumulative = 0;
    for (let i = 1; i < count; i += 1) {
      cumulative += weights[i - 1];
      const target = Math.round((cumulative / totalWeight) * frames);
      const nearest = silences.reduce((best, silence) => {
        if (!best) return silence;
        return Math.abs(silence.center - target) < Math.abs(best.center - target)
          ? silence
          : best;
      }, null);
      const frame =
        nearest && Math.abs(nearest.center - target) < sampleRate * 0.35
          ? nearest.center
          : target;
      cuts.push({frame, type: nearest === null ? "estimate" : "estimated-silence"});
    }
    cuts.sort((a, b) => a.frame - b.frame);
  }

  const segments = [];
  let cursor = 0;
  for (let i = 0; i <= cuts.length; i += 1) {
    const end = i < cuts.length ? cuts[i].frame : frames;
    const startFrame = cursor;
    const endFrame = Math.max(startFrame + 1, Math.min(frames, end));
    const dataSize = (endFrame - startFrame) * blockAlign;
    segments.push({
      buffer: Buffer.concat([
        wavHeader(parsed.fmt, dataSize),
        buffer.subarray(
          parsed.data.start + startFrame * blockAlign,
          parsed.data.start + startFrame * blockAlign + dataSize
        ),
      ]),
      seconds: dataSize / blockAlign / sampleRate,
      boundary: i < cuts.length ? cuts[i].type : "end",
    });
    cursor = endFrame;
  }

  return segments;
}

module.exports = {splitWavBySentences};
