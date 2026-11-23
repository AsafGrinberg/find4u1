"use strict";

/**
 * auth-token.js
 * ---------------------------------------------------------------
 * מנפיק טוקנים פעם אחת מהמחשב שלכם, בלי שירות צד שלישי:
 *
 *   YouTube (refresh token ארוך טווח):
 *     node scripts/auth-token.js youtube
 *     node scripts/auth-token.js youtube --client-secret "C:\\path\\client_secret_xxx.json"
 *
 *   TikTok (access + refresh token):
 *     node scripts/auth-token.js tiktok
 *
 * מאיפה מגיעים פרטי הלקוח של גוגל (לפי הסדר):
 *   1. YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET במשתני הסביבה
 *   2. video/.env (הסקריפט טוען אותו לבד — אין צורך "להדביק" ידנית)
 *   3. GOOGLE_CLIENT_SECRET_FILE=/path/to/client_secret.json, או קובץ JSON
 *      שהורדתם מ-Google Cloud ומועבר כארגומנט אחרי youtube
 *
 * הסקריפט פותח שרת מקומי בכתובת http://127.0.0.1:53682/callback, מדפיס
 * קישור לאישור, ומחזיר את הטוקנים. את הכתובת הזאת צריך לרשום באפליקציה
 * (Google: Authorized redirect URI, TikTok: Redirect URI).
 *
 * ההרשאות המבוקשות מיוטיוב הן העלאה + ניהול תגובות (youtube.force-ssl),
 * כדי שאותו טוקן ישמש גם את ג'וב המענה האוטומטי לתגובות.
 */

const fs = require("fs");
const http = require("http");
const path = require("path");
const {URL} = require("url");
const {loadEnvFile} = require("./env");

loadEnvFile();

const PORT = Number(process.env.OAUTH_PORT || 53682);
const REDIRECT = `http://127.0.0.1:${PORT}/callback`;
const argv = process.argv.slice(2);
const provider = (argv[0] || "").toLowerCase();

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

// קובץ client_secret שהורד מ-Google Cloud מכיל "installed" או "web".
function clientFromSecretFile(file) {
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  const block = json.installed || json.web || json;
  return {clientId: block.client_id, clientSecret: block.client_secret};
}

function googleClient() {
  let clientId = process.env.YOUTUBE_CLIENT_ID;
  let clientSecret = process.env.YOUTUBE_CLIENT_SECRET;

  if (clientId && clientSecret) return {clientId, clientSecret};

  const flagIndex = argv.indexOf("--client-secret");
  const flagFile = flagIndex >= 0 ? argv[flagIndex + 1] : null;
  const file =
    flagFile ||
    process.env.GOOGLE_CLIENT_SECRET_FILE ||
    argv.find((value) => value.toLowerCase().endsWith(".json"));

  if (file) {
    const resolved = path.resolve(file);
    if (!fs.existsSync(resolved)) {
      throw new Error(`client secret file not found: ${resolved}`);
    }
    const fromFile = clientFromSecretFile(resolved);
    clientId = clientId || fromFile.clientId;
    clientSecret = clientSecret || fromFile.clientSecret;
  }

  if (!clientId || !clientSecret) {
    throw new Error(
      "YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET are missing. " +
        "Put them in video/.env, or pass the downloaded JSON: " +
        'node scripts/auth-token.js youtube --client-secret "C:\\path\\client_secret_xxx.json"'
    );
  }

  return {clientId, clientSecret};
}

async function youtube() {
  const {clientId, clientSecret} = googleClient();

  // העלאה + ניהול תגובות. youtube.force-ssl הוא מה שמאפשר לענות לתגובות
  // בערוץ; בלי הוא כל comments.insert מחזיר 403 insufficient scope.
  const scope = [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.force-ssl",
  ].join(" ");

  const state = String(Date.now());
  const authUrl =
    "https://accounts.google.com/o/oauth2/v2/auth?" +
    new URLSearchParams({
      client_id: clientId,
      redirect_uri: REDIRECT,
      response_type: "code",
      scope,
      access_type: "offline",
      prompt: "consent",
      state,
    }).toString();

  console.log(`redirect URI (רק לאפליקציה מסוג Web application): ${REDIRECT}`);
  console.log(
    "באפליקציה מסוג Desktop (כמו Find4UDesktopapp) אין צורך לרשום redirect URI — פשוט אשרו בדפדפן."
  );
  console.log(
    "הדף /callback נפתח על ידי הסקריפט הזה שרץ כרגע. אם הוא לא נטען — לא לפתוח את הכתובת ידנית אחרי שהסקריפט נסגר."
  );
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

  console.log("\nהעתיקו לסודות GitHub (Secret בשם YOUTUBE_REFRESH_TOKEN):");
  console.log(`YOUTUBE_REFRESH_TOKEN=${json.refresh_token}`);
  console.log("\nהטוקן הזה כולל גם הרשאת מענה לתגובות (youtube.force-ssl).");
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
