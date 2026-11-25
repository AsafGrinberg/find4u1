"use strict";

/**
 * instagram.js
 * ---------------------------------------------------------------
 * אינסטגרם עסקי דרך Graph API (אותו טוקן של IG_ACCESS_TOKEN).
 *
 * למה זה קיים:
 * פוסט באינסטגרם לא מאפשר קישור לחיץ בכיתוב, ולכן מי שמבקש "לינק" מגיב
 * בתגובות. כאן קוראים את התגובות, עונים להן עם דף המוצר, ושולחים את
 * הלינק גם בהודעה פרטית (Private Reply) — היא מותרת עד 7 ימים אחרי התגובה.
 *
 * הרשאות נדרשות לטוקן:
 *   instagram_basic, instagram_manage_comments, instagram_manage_messages
 *
 * כל פונקציה זורקת שגיאה עם הודעת Graph. אף פעם לא ממציאים הצלחה.
 */

const GRAPH = "https://graph.facebook.com/v21.0";

function configured() {
  return Boolean(process.env.IG_USER_ID && process.env.IG_ACCESS_TOKEN);
}

async function readJson(response, what) {
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.error) {
    throw new Error(
      `Instagram ${what}: ${response.status} ${JSON.stringify(
        json.error || json
      ).slice(0, 300)}`
    );
  }
  return json;
}

async function graphGet(endpoint, params = {}) {
  const query = new URLSearchParams({
    ...params,
    access_token: process.env.IG_ACCESS_TOKEN,
  });
  const response = await fetch(`${GRAPH}/${endpoint}?${query.toString()}`);
  return readJson(response, endpoint);
}

async function graphPost(endpoint, params = {}) {
  const response = await fetch(`${GRAPH}/${endpoint}`, {
    method: "POST",
    headers: {"Content-Type": "application/x-www-form-urlencoded"},
    body: new URLSearchParams({
      ...params,
      access_token: process.env.IG_ACCESS_TOKEN,
    }).toString(),
  });
  return readJson(response, endpoint);
}

/** המדיה האחרונה בחשבון (רילים ופוסטים), מהחדש לישן. */
async function recentMedia(limit = 25) {
  const json = await graphGet(`${process.env.IG_USER_ID}/media`, {
    fields: "id,timestamp,permalink,media_type,caption",
    limit: String(Math.min(Number(limit) || 25, 50)),
  });
  return json.data || [];
}

/**
 * התגובות על מדיה אחת. שדה from דורש הרשאת ניהול תגובות; אם הוא חסר
 * עובדים עם username בלבד.
 */
async function commentsOf(mediaId, limit = 50) {
  const json = await graphGet(`${mediaId}/comments`, {
    // אין from/parent_id בתגובות אינסטגרם — שדה לא נתמך מפיל את כל הקריאה.
    fields: "id,text,username,timestamp",
    limit: String(Math.min(Number(limit) || 50, 100)),
  });
  return json.data || [];
}

/** מענה ציבורי לתגובה. */
async function replyToComment(commentId, message) {
  const json = await graphPost(`${commentId}/replies`, {message});
  return json.id || null;
}

/**
 * הודעה פרטית למי שהגיב — Private Reply. חייבת להישלח עם comment_id,
 * ולא עם מזהה משתמש שנוחש מהתגובה.
 */
async function sendPrivateReply(commentId, text) {
  const json = await graphPost(`${process.env.IG_USER_ID}/messages`, {
    recipient: JSON.stringify({comment_id: commentId}),
    message: JSON.stringify({text}),
  });
  return json.message_id || json.id || null;
}

module.exports = {
  configured,
  recentMedia,
  commentsOf,
  replyToComment,
  sendPrivateReply,
};
