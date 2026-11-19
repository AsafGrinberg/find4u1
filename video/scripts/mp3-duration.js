"use strict";

/**
 * mp3-duration.js
 * ---------------------------------------------------------------
 * חישוב אורך קובץ MP3 בלי תלות חיצונית (בלי ffmpeg).
 * הולך על כל פריימים ומסכם דגימות — מדויק גם ל־VBR.
 */

const BITRATES_MPEG1_L3 = [
  0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0,
];
const BITRATES_MPEG2_L3 = [
  0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0,
];

// versionBits: 3 = MPEG-1, 2 = MPEG-2, 0 = MPEG-2.5
const SAMPLE_RATES = {
  3: [44100, 48000, 32000],
  2: [22050, 24000, 16000],
  0: [11025, 12000, 8000],
};

function id3Size(buffer) {
  if (buffer.length < 10) return 0;
  if (buffer.toString("ascii", 0, 3) !== "ID3") return 0;
  const flags = buffer[5];
  const size =
    ((buffer[6] & 0x7f) << 21) |
    ((buffer[7] & 0x7f) << 14) |
    ((buffer[8] & 0x7f) << 7) |
    (buffer[9] & 0x7f);
  // כותרת 10 בייטים, footer אופציונלי של 10 בייטים.
  return 10 + size + (flags & 0x10 ? 10 : 0);
}

function mp3DurationSeconds(buffer) {
  let offset = id3Size(buffer);
  let total = 0;
  let frames = 0;

  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff || (buffer[offset + 1] & 0xe0) !== 0xe0) {
      offset += 1;
      continue;
    }

    const b1 = buffer[offset + 1];
    const b2 = buffer[offset + 2];

    const versionBits = (b1 >> 3) & 0x03;
    const layerBits = (b1 >> 1) & 0x03;
    const bitrateIndex = (b2 >> 4) & 0x0f;
    const rateIndex = (b2 >> 2) & 0x03;
    const padding = (b2 >> 1) & 0x01;

    if (
      layerBits !== 1 ||
      versionBits === 1 ||
      rateIndex === 3 ||
      bitrateIndex === 0 ||
      bitrateIndex === 15
    ) {
      offset += 1;
      continue;
    }

    const table = versionBits === 3 ? BITRATES_MPEG1_L3 : BITRATES_MPEG2_L3;
    const bitrate = table[bitrateIndex] * 1000;
    const sampleRate = SAMPLE_RATES[versionBits][rateIndex];
    const samples = versionBits === 3 ? 1152 : 576;
    const frameLength =
      Math.floor(((versionBits === 3 ? 144 : 72) * bitrate) / sampleRate) +
      padding;

    if (frameLength <= 4) {
      offset += 1;
      continue;
    }

    total += samples / sampleRate;
    frames += 1;
    offset += frameLength;
  }

  if (frames < 5) {
    throw new Error(
      "Could not read MP3 frames — the TTS response may not be an MP3 file."
    );
  }

  return total;
}

module.exports = {mp3DurationSeconds};
