"use strict";

/**
 * auth-token.js
 * ---------------------------------------------------------------
 * מנפיק טוקנים פעם אחת מהמחשב שלכם, בלי שירות צד שלישי:
 *
 *   YouTube (refresh token ארוך טווח):
 *     YOUTUBE_CLIENT_ID=... YOUTUBE_CLIENT_SECRET=... \
 *       node scripts/auth-token.js youtube
 *
 *   TikTok (access + refresh token):
 *     TIKTOK_CLIENT_KEY=... TIKTOK_CLIENT_SECRET=... \
 *       node scripts/auth-token.js tiktok
 *
 * הסקריפט פותח שרת מקומי בכתובת http://127.0.0.1:53682/callback, מדפיס
 * קישור לאישור, ומחזיר את הטוקנים. את הכתובת הזאת צריך לרשום באפליקציה
 * (Google: Authorized redirect URI, TikTok: Redirect URI).
 *
 * אין כאן שום סוד קבוע — הכול מגיע ממשתני הסביבה שאתם ממלאים.
 */

const http = require("http");
const {URL} = require("url");

const PORT = Number(process.env.OAUTH_PORT || 53682);
const REDIRECT = `http://127.0.0.1:${PORT}/callback`;
const provider = (process.argv[2] || "").toLowerCase();

function openAuthUrl(url) {
  console.log("\nפתחו את הקישור הזה בדפדפן ואשרו:\n");
  console.log(url);
  console.log("");
}

function waitForCode(state) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const url = new URL(request.url, REDIRECT);
      if (url.pathname !== "/callback") {
        response.writeHead(404).end("not found");
        return;
      }

      const error = url.searchParams.get("error");
      const code = url.searchParams.get("code");
      const returnedState = url.searchParams.get("state");

      if (error) {
        response.writeHead(400, {"Content-Type": "text/plain; charset=utf-8"});
        response.end("האישור נכשל. אפשר לסגור את החלון.");
        server.close();
        reject(new Error(error));
        return;
      }

      if (!code || (state && returnedState !== state)) {
        response.writeHead(400, {"Content-Type": "text/plain; charset=utf-8"});
        response.end("חסר קוד או state לא תואם.");
        server.close();
        reject(new Error("invalid callback"));
        return;
      }

      response.writeHead(200, {"Content-Type": "text/html; charset=utf-8"});
      response.end(
        "<h2>האישור הושלם</h2><p>אפשר לסגור את החלון ולחזור לטרמינל.</p>"
      );
      server.close();
      resolve(code);
    });

    server.listen(PORT, "127.0.0.1");
  });
}

async function youtube() {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET are missing");
  }

  const state = String(Date.now());
  const authUrl =
    "https://accounts.google.com/o/oauth2/v2/auth?" +
    new URLSearchParams({
      client_id: clientId,
      redirect_uri: REDIRECT,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/youtube.upload",
      access_type: "offline",
      prompt: "consent",
      state,
    }).toString();

  openAuthUrl(authUrl);
  const code = await waitForCode(state);

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {"Content-Type": "application/x-www-form-urlencoded"},
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT,
      grant_type: "authorization_code",
    }).toString(),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.refresh_token) {
    throw new Error(`Google token: ${JSON.stringify(json).slice(0, 300)}`);
  }

  console.log("\nהעתיקו לסודות GitHub:");
  console.log(`YOUTUBE_REFRESH_TOKEN=${json.refresh_token}`);
}

async function tiktok() {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  if (!clientKey || !clientSecret) {
    throw new Error("TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET are missing");
  }

  const state = String(Date.now());
  const authUrl =
    "https://www.tiktok.com/v2/auth/authorize/?" +
    new URLSearchParams({
      client_key: clientKey,
      scope: "user.info.basic,video.upload,video.publish",
      response_type: "code",
      redirect_uri: REDIRECT,
      state,
    }).toString();

  openAuthUrl(authUrl);
  const code = await waitForCode(state);

  const response = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: {"Content-Type": "application/x-www-form-urlencoded"},
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: REDIRECT,
    }).toString(),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.access_token) {
    throw new Error(`TikTok token: ${JSON.stringify(json).slice(0, 300)}`);
  }

  console.log("\nהעתיקו לסודות GitHub:");
  console.log(`TIKTOK_REFRESH_TOKEN=${json.refresh_token}`);
  console.log(`# access token תקף 24 שעות — לא צריך לשמור אותו`);
}

async function main() {
  if (provider === "youtube") return youtube();
  if (provider === "tiktok") return tiktok();
  throw new Error("usage: node scripts/auth-token.js youtube|tiktok");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[auth] failed:", error.message);
    process.exit(1);
  });
