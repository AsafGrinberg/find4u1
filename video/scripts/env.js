"use strict";

/**
 * env.js
 * ---------------------------------------------------------------
 * טעינה של video/.env בקובץ אחד משותף לכל הסקריפטים, בלי תלות חיצונית.
 * משתנה סביבה אמיתי (כמו ב-GitHub Actions) תמיד גובר על מה שכתוב בקובץ.
 */

const fs = require("fs");
const path = require("path");

const VIDEO_DIR = path.join(__dirname, "..");
const ENV_FILE = path.join(VIDEO_DIR, ".env");

function loadEnvFile(file = ENV_FILE) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(line);
    if (!match) continue;
    const key = match[1];
    const value = match[2].trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

function truthy(value) {
  return /^(1|true|yes|y)$/i.test(String(value || "").trim());
}

module.exports = {loadEnvFile, truthy, VIDEO_DIR, ENV_FILE};
