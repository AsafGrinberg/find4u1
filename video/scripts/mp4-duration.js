"use strict";

/**
 * mp4-duration.js
 * ---------------------------------------------------------------
 * קורא את משך הווידאו ישירות מכותרת ה־MP4 (אטום mvhd), בלי תלות
 * חיצונית ובלי ffmpeg. משמש כדי לדעת מתי לסיים לולאה של סרטון
 * המוצר (הסרטון של אליאקספרס קצר מהקריינות שלנו).
 *
 * מחזיר שניות (Number) או null אם הקובץ לא מזוהה.
 */

function mp4DurationSeconds(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 32) return null;

  const index = buffer.indexOf("mvhd", 0, "ascii");
  if (index === -1) return null;

  try {
    const version = buffer[index + 4];

    // version 1: זמנים באורך 64 סיביות.
    if (version === 1) {
      const timescale = buffer.readUInt32BE(index + 24);
      const duration = Number(buffer.readBigUInt64BE(index + 28));
      if (!timescale || !duration) return null;
      return duration / timescale;
    }

    // version 0: creation(4) modification(4) timescale(4) duration(4)
    const timescale = buffer.readUInt32BE(index + 16);
    const duration = buffer.readUInt32BE(index + 20);
    if (!timescale || !duration) return null;
    return duration / timescale;
  } catch (error) {
    return null;
  }
}

module.exports = {mp4DurationSeconds};
