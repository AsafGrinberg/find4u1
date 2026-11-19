"use strict";

/**
 * wav-duration.js
 * ---------------------------------------------------------------
 * אורך קובץ WAV (LINEAR16) בלי ffmpeg — קריאת כותרות RIFF/fmt/data.
 * Google TTS מחזיר LINEAR16 באיכות מלאה (48kHz), לעומת MP3 דחוס
 * שנשמע דק ו"טלפוני" בריל.
 */

function wavDurationSeconds(buffer) {
  if (
    buffer.length < 44 ||
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WAVE"
  ) {
    throw new Error("Not a WAV file — the TTS response could not be read.");
  }

  let offset = 12;
  let byteRate = 0;
  let dataSize = 0;

  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);

    if (id === "fmt ") byteRate = buffer.readUInt32LE(offset + 16);
    if (id === "data") {
      dataSize = Math.min(size, buffer.length - offset - 8);
      break;
    }

    offset += 8 + size + (size % 2);
  }

  if (!byteRate || !dataSize) {
    throw new Error("Could not read WAV duration (missing fmt/data chunk).");
  }

  return dataSize / byteRate;
}

module.exports = {wavDurationSeconds};
