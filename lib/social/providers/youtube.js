"use strict";

/**
 * youtube.js — WebSub (PubSubHubbub) של יוטיוב
 * ---------------------------------------------------------------
 * יוטיוב *לא* דוחפת תגובות. מה שכן אפשר לקבל בדחיפה זה הודעה על סרטון
 * חדש בערוץ, דרך WebSub:
 *
 *   Callback URL: https://find4u.vercel.app/api/social/webhook/youtube
 *   Verify token: YOUTUBE_WEBHOOK_VERIFY_TOKEN
 *   Topic:        https://www.youtube.com/xml/feeds/videos.xml?channel_id=<CHANNEL_ID>
 *
 * כלומר: ה-webhook הזה מיידע אותנו על סרטון חדש, אבל המענה לתגובות ביוטיוב
 * נשאר בסריקה (youtube-comment replies) — כי אין API שדוחף תגובות.
 * אם בעתיד יוטיוב תוסיף דחיפת תגובות, כאן המקום להוסיף את המענה.
 */

const VERIFY_TOKEN =
  process.env.YOUTUBE_WEBHOOK_VERIFY_TOKEN ||
  process.env.WEBHOOK_VERIFY_TOKEN ||
  "";

function verify(req, res) {
  const query = req.query || {};
  if (query["hub.mode"] !== "subscribe") {
    return res.status(400).json({ok: false, error: "hub.mode must be subscribe"});
  }
  if (!VERIFY_TOKEN) {
    return res
      .status(500)
      .json({ok: false, error: "YOUTUBE_WEBHOOK_VERIFY_TOKEN is not set"});
  }
  if (String(query["hub.verify_token"] || "") !== VERIFY_TOKEN) {
    return res.status(403).json({ok: false, error: "verify token mismatch"});
  }
  return res.status(200).send(String(query["hub.challenge"] || ""));
}

/** גוף ההודעה הוא Atom XML; מוציאים ממנו את מזהה הסרטון לצורך לוג. */
function videoIds(xml) {
  const ids = [];
  const pattern = /<yt:videoId>([^<]+)<\/yt:videoId>/g;
  let match = pattern.exec(xml);
  while (match) {
    ids.push(match[1]);
    match = pattern.exec(xml);
  }
  return ids;
}

async function receive({raw}) {
  const ids = videoIds(raw.toString("utf8"));
  console.log(
    `[webhook] youtube notification: ${ids.length ? ids.join(", ") : "no video id"} ` +
      "(comments are still handled by the polling workflow)"
  );
  return {
    received: ids.length || 1,
    answered: 0,
    note: "YouTube does not push comments; the polling workflow answers them",
  };
}

module.exports = {name: "youtube", platform: "youtube", verify, receive};
