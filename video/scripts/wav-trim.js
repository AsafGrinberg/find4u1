"use strict";

/**
 * wav-trim.js
 * ---------------------------------------------------------------
 * חותך שקט מההתחלה ומהסוף של קובץ WAV (PCM16) בלי ffmpeg.
 *
 * למה: מנועי TTS מוסיפים חצי שנייה שקט לפני ואחרי כל משפט, וב־7
 * משפטים זה מצטבר לזנב שקט מורגש בסוף הסרטון (ובריל של 44 שניות
 * ארבע שניות שקט זה נצח). חותכים את השקט בפועל, ומשאירים קצה
 * קצר כדי שהמילה האחרונה לא תיחתך.
 */

const THRESHOLD = 0.006; // ~ -44dBFS
const KEEP_MS = 55;

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

function header({channels, sampleRate, bitsPerSample}, dataSize) {
  const blockAlign = (channels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const out = Buffer.alloc(44);
  out.write("RIFF", 0, "ascii");
  out.writeUInt32LE(36 + dataSize, 4);
  out.write("WAVE", 8, "ascii");
  out.write("fmt ", 12, "ascii");
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(channels, 22);
  out.writeUInt32LE(sampleRate, 24);
  out.writeUInt32LE(byteRate, 28);
  out.writeUInt16LE(blockAlign, 32);
  out.writeUInt16LE(bitsPerSample, 34);
  out.write("data", 36, "ascii");
  out.writeUInt32LE(dataSize, 40);
  return out;
}

/**
 * @returns {{buffer: Buffer, seconds: number, trimmedStart: number, trimmedEnd: number}}
 *          trimmedStart/trimmedEnd בשניות (0 אם לא נחתך כלום)
 */
function trimWavSilence(buffer) {
  const parsed = parseWav(buffer);
  if (!parsed || parsed.fmt.bitsPerSample !== 16 || parsed.fmt.audioFormat !== 1) {
    const bytesPerSecond =
      parsed && parsed.fmt.sampleRate
        ? parsed.fmt.sampleRate *
          parsed.fmt.channels *
          (parsed.fmt.bitsPerSample / 8)
        : 0;
    return {
      buffer,
      seconds: bytesPerSecond ? parsed.data.size / bytesPerSecond : 0,
      trimmedStart: 0,
      trimmedEnd: 0,
    };
  }

  const {channels, sampleRate} = parsed.fmt;
  const blockAlign = channels * 2;
  const frames = Math.floor(parsed.data.size / blockAlign);
  const dataStart = parsed.data.start;
  const limit = THRESHOLD * 32768;

  const loud = (frameIndex) => {
    const base = dataStart + frameIndex * blockAlign;
    for (let channel = 0; channel < channels; channel += 1) {
      if (Math.abs(buffer.readInt16LE(base + channel * 2)) > limit) return true;
    }
    return false;
  };

  let first = 0;
  while (first < frames && !loud(first)) first += 1;
  let last = frames - 1;
  while (last > first && !loud(last)) last -= 1;

  if (first >= frames) {
    // הכל שקט — לא נוגעים, שה־render יזהה משך חריג.
    return {
      buffer,
      seconds: frames / sampleRate,
      trimmedStart: 0,
      trimmedEnd: 0,
    };
  }

  const keepFrames = Math.round((KEEP_MS / 1000) * sampleRate);
  const startFrame = Math.max(0, first - Math.round(keepFrames * 0.4));
  const endFrame = Math.min(frames - 1, last + keepFrames);

  const dataSize = (endFrame - startFrame + 1) * blockAlign;
  const trimmed =
    startFrame === 0 && endFrame === frames - 1
      ? buffer
      : Buffer.concat([
          header(parsed.fmt, dataSize),
          buffer.subarray(
            dataStart + startFrame * blockAlign,
            dataStart + startFrame * blockAlign + dataSize
          ),
        ]);

  return {
    buffer: trimmed,
    seconds: dataSize / blockAlign / sampleRate,
    trimmedStart: startFrame / sampleRate,
    trimmedEnd: (frames - 1 - endFrame) / sampleRate,
  };
}

module.exports = {trimWavSilence};
