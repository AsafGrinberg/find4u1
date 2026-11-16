"use strict";

/**
 * יוצר גרסת לוגו לטקסט לבן מתוך הלוגו הרגיל.
 * משתמש רק ב zlib של Node, בלי תלויות חיצוניות.
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const SOURCE = path.join(
  __dirname,
  "..",
  "public",
  "assets",
  "images",
  "FIND4ULOGGO.png"
);
const TARGET = path.join(
  __dirname,
  "..",
  "public",
  "assets",
  "images",
  "FIND4ULOGGO-white.png"
);

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, "ascii");
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(
    crc32(Buffer.concat([typeBuffer, data])),
    0
  );
  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function unfilter(raw, width, height, bpp) {
  const stride = width * bpp;
  const out = Buffer.alloc(stride * height);

  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const lineStart = y * (stride + 1) + 1;
    const targetStart = y * stride;

    for (let x = 0; x < stride; x += 1) {
      const value = raw[lineStart + x];
      const left = x >= bpp ? out[targetStart + x - bpp] : 0;
      const up = y > 0 ? out[targetStart - stride + x] : 0;
      const upLeft = y > 0 && x >= bpp ? out[targetStart - stride + x - bpp] : 0;

      let result;
      switch (filter) {
        case 0:
          result = value;
          break;
        case 1:
          result = value + left;
          break;
        case 2:
          result = value + up;
          break;
        case 3:
          result = value + Math.floor((left + up) / 2);
          break;
        case 4:
          result = value + paeth(left, up, upLeft);
          break;
        default:
          throw new Error(`Unknown filter ${filter}`);
      }
      out[targetStart + x] = result & 0xff;
    }
  }

  return out;
}

function main() {
  const file = fs.readFileSync(SOURCE);

  if (file.slice(1, 4).toString("ascii") !== "PNG") {
    throw new Error("Not a PNG file");
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  let bitDepth = 0;
  const idat = [];

  while (offset < file.length) {
    const length = file.readUInt32BE(offset);
    const type = file.slice(offset + 4, offset + 8).toString("ascii");
    const data = file.slice(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
  }

  if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) {
    throw new Error(`Unsupported PNG: depth=${bitDepth} colorType=${colorType}`);
  }

  const bpp = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const pixels = unfilter(raw, width, height, bpp);

  for (let i = 0; i < pixels.length; i += bpp) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const alpha = bpp === 4 ? pixels[i + 3] : 255;

    if (alpha === 0) continue;

    const isYellow = r > 200 && g > 150 && b < 110;
    if (isYellow) continue;

    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (luminance < 140) {
      pixels[i] = 255;
      pixels[i + 1] = 255;
      pixels[i + 2] = 255;
    }
  }

  const stride = width * bpp;
  const filtered = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    filtered[y * (stride + 1)] = 0;
    pixels.copy(filtered, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = colorType;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const out = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(filtered, {level: 9})),
    chunk("IEND", Buffer.alloc(0)),
  ]);

  fs.writeFileSync(TARGET, out);
  console.log(`Wrote ${TARGET} (${width}x${height}, colorType ${colorType})`);
}

main();
