"use strict";

/**
 * facebook.js
 * ---------------------------------------------------------------
 * פרסום לדף הפייסבוק שלנו דרך Graph API (אותו טוקן של הדף).
 *
 * כל פוסט מקבל שני חלקים, כמו שביקשנו:
 *   1. הפוסט עצמו — תמונה + כל פרטי המוצר והלינקים.
 *   2. תגובה ראשונה של הדף לאותו פוסט — שוב כל הפרטים והלינקים,
 *      כדי שהלינקים יהיו זמינים גם למי שפותח את התגובות.
 *
 * הערה חשובה: ל-Graph API אין דרך לנעוץ תגובה. "נעיצת תגובה" קיימת רק
 * בממשק של פייסבוק, ולכן מנסים אותה בקריאה שלא מפילה את הפרסום, ורושמים
 * בלוג שהנעיצה (אם צריך) נעשית ידנית.
 *
 * פוסט נופל חזרה ל-/feed (טקסט + לינק) אם אין תמונה או אם העלאת התמונה
 * נכשלה — כדי שמוצר בלי תמונה עדיין יתפרסם.
 */

const GRAPH = "https://graph.facebook.com/v21.0";
const GRAPH_VIDEO = "https://graph-video.facebook.com/v21.0";

function configured() {
  return Boolean(process.env.FB_PAGE_ID && process.env.FB_PAGE_ACCESS_TOKEN);
}

function disabled() {
  return process.env.SKIP_FACEBOOK === "1";
}

async function readJson(response, what) {
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.error) {
    throw new Error(
      `Facebook ${what}: ${response.status} ${JSON.stringify(
        json.error || json
      ).slice(0, 300)}`
    );
  }
  return json;
}

async function graphPost(endpoint, params) {
  const response = await fetch(`${GRAPH}/${endpoint}`, {
    method: "POST",
    headers: {"Content-Type": "application/x-www-form-urlencoded"},
    body: new URLSearchParams({
      ...params,
      access_token: process.env.FB_PAGE_ACCESS_TOKEN,
    }).toString(),
  });
  return readJson(response, endpoint);
}

async function createPhotoPost({message, image}) {
  const json = await graphPost(`${process.env.FB_PAGE_ID}/photos`, {
    url: image,
    caption: message,
  });
  // בתמונות מזהה הפוסט הוא post_id; id הוא מזהה התמונה.
  return json.post_id || json.id;
}

async function createFeedPost({message, link}) {
  const params = {message};
  if (link) params.link = link;
  const json = await graphPost(`${process.env.FB_PAGE_ID}/feed`, params);
  return json.id;
}

async function commentOn(postId, message) {
  const json = await graphPost(`${postId}/comments`, {message});
  return json.id || null;
}

// לא מתועד ב-Graph API, ולכן לא מכשילים את הפרסום אם הוא נכשל.
async function tryPinComment(commentId) {
  if (!commentId) return false;
  try {
    await graphPost(commentId, {is_pinned: "true"});
    console.log(`[facebook] pinned comment ${commentId}`);
    return true;
  } catch (error) {
    console.log(
      `[facebook] comment ${commentId} was not pinned (Graph API has no pin for comments) — pin it in the app if needed`
    );
    return false;
  }
}

/**
 * מפרסם פוסט בדף + תגובה ראשונה של הדף.
 * message — הטקסט של הפוסט (כל פרטי המוצר והלינקים).
 * comment — טקסט התגובה; ברירת מחדל: אותו טקסט.
 * image   — תמונת המוצר (רשות).
 * link    — קישור לרכישה, לשימוש רק כשאין תמונה.
 */
async function publish({message, comment, image, link} = {}) {
  if (disabled()) return {ok: false, reason: "SKIP_FACEBOOK=1"};
  if (!configured()) {
    return {
      ok: false,
      reason: "FB_PAGE_ID / FB_PAGE_ACCESS_TOKEN are not set",
    };
  }

  const text = String(message || "").trim();
  if (!text) return {ok: false, reason: "nothing to post"};

  let postId = null;
  if (image) {
    try {
      postId = await createPhotoPost({message: text, image});
    } catch (error) {
      console.warn(`[facebook] photo post failed (${error.message}) — trying a text post`);
    }
  }
  if (!postId) postId = await createFeedPost({message: text, link});

  let commentId = null;
  try {
    commentId = await commentOn(postId, String(comment || text).trim());
  } catch (error) {
    console.warn(`[facebook] first comment failed for ${postId}: ${error.message}`);
  }
  await tryPinComment(commentId);

  console.log(`[facebook] published ${postId}${commentId ? ` (comment ${commentId})` : ""}`);
  return {
    ok: true,
    id: postId,
    commentId,
    url: `https://www.facebook.com/${postId}`,
  };
}

/**
 * העלאת סרטון (ריל) לדף. הפוסט עצמו נושא את הכיתוב, והתגובה הראשונה
 * נשלחת אחר כך דרך publishVideoComment.
 */
async function publishVideo({file, description, title} = {}) {
  if (disabled()) return {ok: false, reason: "SKIP_FACEBOOK=1"};
  if (!configured()) {
    return {
      ok: false,
      reason: "FB_PAGE_ID / FB_PAGE_ACCESS_TOKEN are not set",
    };
  }
  if (!file) return {ok: false, reason: "video file is missing"};

  const fs = require("fs");
  const path = require("path");
  const form = new FormData();
  form.append("access_token", process.env.FB_PAGE_ACCESS_TOKEN);
  form.append("description", String(description || ""));
  form.append("title", String(title || "Find4U").slice(0, 100));
  form.append(
    "source",
    new Blob([fs.readFileSync(file)], {type: "video/mp4"}),
    path.basename(file)
  );

  const response = await fetch(
    `${GRAPH_VIDEO}/${process.env.FB_PAGE_ID}/videos`,
    {method: "POST", body: form}
  );
  const json = await readJson(response, "video");
  console.log(`[facebook] video published ${json.id}`);
  return {
    ok: true,
    id: json.id,
    url: json.id ? `https://www.facebook.com/${json.id}` : undefined,
  };
}

/**
 * תגובות על פוסט או סרטון בדף. מחזיר רק תגובות של אנשים אחרים — תגובות
 * של הדף עצמו (התגובה הראשונה שלנו) מסוננות כאן.
 */
async function commentsOf(postId, limit = 50) {
  const json = await graphGet(`${postId}/comments`, {
    fields: "id,message,created_time,permalink_url,from,parent",
    limit: String(Math.min(Number(limit) || 50, 100)),
    filter: "stream",
  });
  const pageId = String(process.env.FB_PAGE_ID || "");
  return (json.data || []).filter(
    (comment) => String(comment.from?.id || "") !== pageId
  );
}

/** הפוסטים והסרטונים האחרונים בדף — מהם קוראים את התגובות. */
async function recentObjects(limit = 15) {
  const size = String(Math.min(Number(limit) || 15, 50));
  const objects = [];

  try {
    const posts = await graphGet(`${process.env.FB_PAGE_ID}/posts`, {
      fields: "id,created_time,permalink_url",
      limit: size,
    });
    (posts.data || []).forEach((post) =>
      objects.push({id: post.id, createdTime: post.created_time})
    );
  } catch (error) {
    console.warn(`[facebook] could not list posts: ${error.message}`);
  }

  try {
    const videos = await graphGet(`${process.env.FB_PAGE_ID}/videos`, {
      fields: "id,created_time,permalink_url",
      limit: size,
    });
    (videos.data || []).forEach((video) =>
      objects.push({id: video.id, createdTime: video.created_time})
    );
  } catch (error) {
    console.warn(`[facebook] could not list videos: ${error.message}`);
  }

  return objects;
}

/** הכיתוב של פוסט/סרטון — משמש כגיבוי לזיהוי המוצר כשאין מזהה שמור. */
async function objectMessage(objectId) {
  try {
    const json = await graphGet(String(objectId), {fields: "message,description"});
    return json.message || json.description || "";
  } catch (error) {
    return "";
  }
}

/** מענה ציבורי לתגובה. */
async function replyToComment(commentId, message) {
  const json = await graphPost(`${commentId}/comments`, {message});
  return json.id || null;
}

/**
 * הודעה פרטית (Private Reply) למי שהגיב — דרך ה-Messenger של הדף.
 * חייבת להישלח עם comment_id של התגובה, בתוך 7 ימים ממנה.
 */
async function sendPrivateReply(commentId, text) {
  const json = await graphPost(`${process.env.FB_PAGE_ID}/messages`, {
    recipient: JSON.stringify({comment_id: commentId}),
    messaging_type: "RESPONSE",
    message: JSON.stringify({text}),
  });
  return json.message_id || json.id || null;
}

async function graphGet(endpoint, params = {}) {
  const query = new URLSearchParams({
    ...params,
    access_token: process.env.FB_PAGE_ACCESS_TOKEN,
  });
  const response = await fetch(`${GRAPH}/${endpoint}?${query.toString()}`);
  return readJson(response, endpoint);
}

/**
 * תגובה ראשונה לסרטון שזה עתה עלה. פייסבוק מקבלת את מזהה הסרטון לפני
 * שהפוסט עצמו מוכן לתגובות, ולכן מנסים שוב במקום לוותר בשקט — זו הסיבה
 * שהתגובה הראשונה לא הופיעה על הריל.
 */
async function commentWhenReady(postId, message, options = {}) {
  const attempts = Number(options.attempts || 5);
  const delayMs = Number(options.delayMs || 15000);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const commentId = await commentOn(postId, message);
      if (commentId) return commentId;
    } catch (error) {
      console.warn(
        `[facebook] comment attempt ${attempt}/${attempts} on ${postId} failed: ${error.message}`
      );
    }
    if (attempt < attempts) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return null;
}

module.exports = {
  configured,
  publish,
  publishVideo,
  commentOn,
  commentWhenReady,
  commentsOf,
  recentObjects,
  objectMessage,
  replyToComment,
  sendPrivateReply,
  tryPinComment,
};
