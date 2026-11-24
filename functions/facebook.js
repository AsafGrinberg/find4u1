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

module.exports = {
  configured,
  publish,
  publishVideo,
  commentOn,
  tryPinComment,
};
