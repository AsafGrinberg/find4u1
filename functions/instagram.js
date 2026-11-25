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
 *   pages_messaging (עבור עמוד פייסבוק שמקושר לחשבון האינסטגרם)
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

// שם המשתמש של החשבון שלנו, לזיהוי תגובות שאנחנו כתבנו (התגובה הראשונה
// שלנו וכל מענה קודם). נשמר בזיכרון — פעם אחת לריצה.
let ownUsernameCache = null;

async function ownUsername() {
  if (ownUsernameCache !== null) return ownUsernameCache;
  try {
    const json = await graphGet(String(process.env.IG_USER_ID), {
      fields: "username",
    });
    ownUsernameCache = String(json.username || "")
      .replace(/^@/, "")
      .toLowerCase();
  } catch (error) {
    ownUsernameCache = "";
  }
  return ownUsernameCache;
}

/**
 * התגובות על מדיה אחת. שדה from דורש הרשאת ניהול תגובות; אם הוא חסר
 * עובדים עם username בלבד.
 *
 * תגובות של החשבון שלנו מסוננות כאן: התגובה הראשונה שלנו מכילה את המילה
 * "המחירים", וזו הייתה הסיבה שהבוט ענה לעצמו בפוסטים.
 */
async function commentsOf(mediaId, limit = 50) {
  const json = await graphGet(`${mediaId}/comments`, {
    // אין from/parent_id בתגובות אינסטגרם — שדה לא נתמך מפיל את כל הקריאה.
    fields: "id,text,username,timestamp",
    limit: String(Math.min(Number(limit) || 50, 100)),
  });
  const own = await ownUsername();
  const ownId = String(process.env.IG_USER_ID || "");
  return (json.data || []).filter((comment) => {
    const author = String(comment.username || "")
      .replace(/^@/, "")
      .toLowerCase();
    if (own && author === own) return false;
    const authorId = String((comment.from && comment.from.id) || "");
    if (ownId && authorId && authorId === ownId) return false;
    return true;
  });
}

/** מענה ציבורי לתגובה. */
async function replyToComment(commentId, message) {
  const json = await graphPost(`${commentId}/replies`, {message});
  return json.id || null;
}

/**
 * הודעה פרטית למי שהגיב — Private Reply. חייבת להישלח עם comment_id,
 * ולא עם מזהה משתמש שנוחש מהתגובה.
 *
 * למטא יש שני נתיבים לאותה פעולה, והם תלויים בסוג הטוקן:
 *   • עמוד פייסבוק שמקושר לחשבון אינסטגרם עסקי (Facebook Login):
 *       POST /{PAGE_ID}/messages  + הרשאות pages_messaging
 *       ו-instagram_manage_comments.
 *   • כניסה עם אינסטגרם (Instagram Login / Platform):
 *       POST /{IG_USER_ID}/messages  + instagram_manage_messages.
 * אין דרך לדעת מראש איזה טוקן יש ביד, ולכן מנסים את נתיב העמוד קודם
 * (זה המצב אצלנו) ואם הוא נכשל — את נתיב האינסטגרם, לפני שמוותרים.
 */
async function sendPrivateReply(commentId, text) {
  const accounts = [process.env.FB_PAGE_ID, process.env.IG_USER_ID]
    .map((id) => String(id || "").trim())
    .filter(Boolean)
    .filter((id, index, list) => list.indexOf(id) === index);

  const errors = [];
  for (const account of accounts) {
    try {
      const json = await graphPost(`${account}/messages`, {
        recipient: JSON.stringify({comment_id: commentId}),
        message: JSON.stringify({text}),
      });
      return json.message_id || json.id || null;
    } catch (error) {
      errors.push(`${account}: ${error.message}`);
    }
  }

  throw new Error(
    errors.join(" | ") || "Instagram private reply: no account id is set"
  );
}

module.exports = {
  configured,
  recentMedia,
  commentsOf,
  replyToComment,
  sendPrivateReply,
};
