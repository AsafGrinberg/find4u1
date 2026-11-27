"use strict";

/**
 * meta.js — ה-webhook של פייסבוק ואינסטגרם
 * ---------------------------------------------------------------
 * כתובת אחת לשני המוצרים של אותה אפליקציית מטא:
 *
 *   Callback URL:  https://find4u.vercel.app/api/social/webhook
 *   Verify token:  META_WEBHOOK_VERIFY_TOKEN
 *
 * מה מגיע לכאן (אחרי שמינויים מוגדרים ב-App Dashboard):
 *   • feed       — תגובה חדשה על פוסט/ריל של הדף. עונים בתגובה + Private Reply.
 *   • comments   — תגובה חדשה על מדיה באינסטגרם. עונים בתגובה + Private Reply.
 *   • messages   — הודעה פרטית נכנסת ב-Messenger או ב-Direct. עונים מיד.
 *
 * למה זה קיים:
 * הסריקה כל חצי שעה כבר עונה לתגובות, אבל (א) היא לא עונה להודעות פרטיות
 * בכלל, ו-(ב) בודק של מטא שמגיב ומייחל לתשובה לא ממתין חצי שעה. ה-webhook
 * עונה מיד, והסריקה נשארת כגיבוי למקרה שאירוע אבד.
 *
 * כפילויות: מטא שולחת אירוע שוב אם לא השבנו 200. כל אירוע נרשם בזיכרון
 * (לפי mid / comment_id) וגם ב-answeredComments כשמוגדר שירות חשבון, כדי
 * שהסריקה לא תענה לאותה תגובה פעם שנייה.
 *
 * אבטחה: חתימת X-Hub-Signature-256 על הגוף הגולמי עם FB_APP_SECRET.
 * בלי סוד — מסרבים (אין מצב שמקבלים אירוע לא חתום), אלא אם במפורש
 * SOCIAL_WEBHOOK_INSECURE=1 בסביבת פיתוח.
 */

const crypto = require("node:crypto");

const facebook = require("../../../functions/facebook");
const instagram = require("../../../functions/instagram");
const socials = require("../../../functions/socials");
const store = require("../store");
const lookup = require("../lookup");
const replies = require("../replies");

const GRAPH = "https://graph.facebook.com/v21.0";

const PAGE_ID = String(process.env.FB_PAGE_ID || "");
const IG_ID = String(process.env.IG_USER_ID || "");
const APP_SECRET = String(process.env.FB_APP_SECRET || "");
const VERIFY_TOKEN =
  process.env.META_WEBHOOK_VERIFY_TOKEN ||
  process.env.WEBHOOK_VERIFY_TOKEN ||
  "";
const MAX_AGE_DAYS = Number(process.env.SOCIAL_WEBHOOK_MAX_AGE_DAYS || 7);
const MAX_EVENTS = Number(process.env.SOCIAL_WEBHOOK_MAX_EVENTS || 10);
const INSECURE = /^(1|true|yes)$/i.test(
  String(process.env.SOCIAL_WEBHOOK_INSECURE || "")
);

// אירועים שכבר טופלו במופע הזה — הגנה מפני שליחה כפולה של מטא.
const seen = new Map();
const SEEN_TTL_MS = 10 * 60 * 1000;

function markSeen(key) {
  const id = String(key || "");
  if (!id) return false;
  const now = Date.now();
  for (const [stored, expires] of seen) {
    if (expires < now) seen.delete(stored);
  }
  if (seen.has(id)) return false;
  seen.set(id, now + SEEN_TTL_MS);
  if (seen.size > 1000) seen.delete(seen.keys().next().value);
  return true;
}

class WebhookError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ---- אימות --------------------------------------------------------------

/** GET של מטא: מאמתים את ה-verify token ומחזירים את ה-challenge כמו שהוא. */
function verify(req, res) {
  const query = req.query || {};
  const mode = query["hub.mode"];
  const token = query["hub.verify_token"];
  const challenge = query["hub.challenge"];

  if (mode !== "subscribe") {
    return res.status(400).json({ok: false, error: "hub.mode must be subscribe"});
  }
  if (!VERIFY_TOKEN) {
    console.error("[webhook] META_WEBHOOK_VERIFY_TOKEN is not set");
    return res
      .status(500)
      .json({ok: false, error: "META_WEBHOOK_VERIFY_TOKEN is not set"});
  }
  if (String(token || "") !== VERIFY_TOKEN) {
    return res.status(403).json({ok: false, error: "verify token mismatch"});
  }
  return res.status(200).send(String(challenge || ""));
}

function signatureMatches(raw, header) {
  const received = String(header || "");
  if (!received.startsWith("sha256=")) return false;
  const expected = crypto
    .createHmac("sha256", APP_SECRET)
    .update(raw)
    .digest("hex");
  const got = received.slice("sha256=".length);
  const a = Buffer.from(got, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ---- כלי עזר ------------------------------------------------------------

function pageIdOf(platform) {
  return platform === "instagram" ? IG_ID : PAGE_ID;
}

function tokenOf(platform) {
  return platform === "instagram"
    ? process.env.IG_ACCESS_TOKEN
    : process.env.FB_PAGE_ACCESS_TOKEN;
}

async function graphPost(platform, path, params) {
  const token = tokenOf(platform);
  if (!token) throw new Error(`${platform}: access token is not set`);
  const response = await fetch(`${GRAPH}/${path}`, {
    method: "POST",
    headers: {"Content-Type": "application/x-www-form-urlencoded"},
    body: new URLSearchParams({...params, access_token: token}).toString(),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.error) {
    throw new Error(
      `${platform} ${path}: ${response.status} ${JSON.stringify(
        json.error || json
      ).slice(0, 300)}`
    );
  }
  return json;
}

async function graphGet(platform, path, params = {}) {
  const token = tokenOf(platform);
  if (!token) return {};
  const query = new URLSearchParams({...params, access_token: token});
  const response = await fetch(`${GRAPH}/${path}?${query.toString()}`);
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.error) return {};
  return json;
}

/**
 * הודעה פרטית למי שכתב לנו (Messenger / Instagram Direct).
 *
 * accountId — המזהה שממנו שולחים. ב-Messenger זה חייב להיות הדף שקיבל את
 * ההודעה (entry.id של ה-webhook). FB_PAGE_ID יכול להיות מיושן, ואז
 * POST /{id}/messages מחזיר 100 "Object with ID ... does not exist".
 */
async function sendMessage(platform, recipientId, text, accountId) {
  const account = String(accountId || pageIdOf(platform) || "").trim();
  if (!account) throw new Error(`${platform}: account id is not set`);
  const json = await graphPost(platform, `${account}/messages`, {
    recipient: JSON.stringify({id: String(recipientId)}),
    messaging_type: "RESPONSE",
    message: JSON.stringify({text: String(text)}),
  });
  return json.message_id || json.id || null;
}

/** הכיתוב של מדיה באינסטגרם — גיבוי לזיהוי המוצר. */
async function mediaCaption(mediaId) {
  const json = await graphGet("instagram", String(mediaId), {fields: "caption"});
  return json.caption || "";
}

async function answeredBefore(commentId) {
  try {
    return await store.readAnswered(commentId);
  } catch (error) {
    return null;
  }
}

async function remember(commentId, data) {
  try {
    await store.saveAnswered(commentId, data);
  } catch (error) {
    console.warn(`[webhook] could not record ${commentId}: ${error.message}`);
  }
}

// ---- הודעות פרטיות ------------------------------------------------------

async function handleMessaging(item, entryId) {
  const message = item && item.message;
  // delivery / read / postback / reaction — לא הודעה שצריך לענות לה.
  if (!message) return 0;
  // הודעה שהדף/החשבון שלנו שלח — אסור לענות לעצמי.
  if (message.is_echo) return 0;

  const text = String(message.text || "").trim();
  if (!text) return 0; // מדיה בלי טקסט

  const platform = String(entryId) === IG_ID ? "instagram" : "facebook";
  // הדף ששלח את ה-webhook הוא הדף שקיבל את ההודעה — ממנו חייבים לענות.
  const account =
    platform === "facebook" ? String(entryId || PAGE_ID) : pageIdOf(platform);
  if (platform === "facebook" && PAGE_ID && entryId && entryId !== PAGE_ID) {
    console.warn(
      `[webhook] FB_PAGE_ID=${PAGE_ID} but the event came from page ${entryId} — sending from ${entryId}`
    );
  }
  const sender = String((item.sender && item.sender.id) || "");
  const own = account;
  if (!sender || (own && sender === own)) return 0;

  const key = `message:${message.mid || `${sender}:${message.timestamp || ""}`}`;
  if (!markSeen(key)) return 0;

  const signature = await socials.signature({skip: [platform]});
  const body = replies.dmGreetingText({text, signature});

  const messageId = await sendMessage(platform, sender, body, account);
  console.log(
    `[webhook] ${platform} dm ${sender}: ${messageId ? "answered" : "no id"}`
  );
  return messageId ? 1 : 0;
}

// ---- תגובות -------------------------------------------------------------

/**
 * תגובה חדשה על פוסט/ריל. עונים רק לבקשה (לינק/מחיר/אפשר...) — כמו הסריקה —
 * ותמיד גם בהודעה פרטית, כי באינסטגרם אין קישור לחיץ בכיתוב.
 */
async function handleComment(platform, value) {
  const data = value || {};
  const commentId = String(data.id || data.comment_id || "");
  const text = String(data.text || data.message || "");
  const objectId = String(
    (data.media && data.media.id) || data.post_id || data.parent_id || ""
  );
  if (!commentId || !objectId) return 0;

  const authorId = String((data.from && data.from.id) || "");
  const own = pageIdOf(platform);
  if (authorId && own && authorId === own) return 0;
  if (replies.isOwnComment({from: data.from, message: text, text})) return 0;
  if (!replies.REQUEST.test(text)) return 0;

  if (!markSeen(`comment:${commentId}`)) return 0;

  const previous = await answeredBefore(commentId);
  if (previous && previous.dmId) return 0;

  const when = Number(data.created_time || 0) * 1000 || Date.parse(data.timestamp || "");
  if (Number.isFinite(when) && when > 0) {
    const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
    if (when < cutoff) return 0;
  }

  const field = platform === "instagram" ? "instagramMediaIds" : "facebookPostIds";
  let product = await lookup.productForObject(field, objectId);
  if (!product) {
    const caption =
      platform === "instagram"
        ? await mediaCaption(objectId)
        : await facebook.objectMessage(objectId);
    product = await lookup.productFromCaption(caption);
  }
  if (!product) {
    console.log(
      `[webhook] ${platform} ${commentId}: no product mapping for ${objectId} (skipped)`
    );
    return 0;
  }

  const signature = await socials.signature({skip: [platform]});
  const links = await replies.linksFor(product);
  const publicText = replies.commentReplyText({
    platform,
    seed: commentId,
    links,
    signature,
  });
  const dmText = replies.dmText({product, links, signature});

  let replyId = (previous && previous.replyId) || null;
  let dmId = (previous && previous.dmId) || null;

  if (!replyId) {
    try {
      replyId =
        platform === "facebook"
          ? await facebook.replyToComment(commentId, publicText)
          : await instagram.replyToComment(commentId, publicText);
    } catch (error) {
      console.warn(`[webhook] ${platform} reply ${commentId} failed — ${error.message}`);
    }
  }

  if (!dmId) {
    try {
      dmId =
        platform === "facebook"
          ? await facebook.sendPrivateReply(commentId, dmText)
          : await instagram.sendPrivateReply(commentId, dmText);
    } catch (error) {
      console.warn(`[webhook] ${platform} dm ${commentId} failed — ${error.message}`);
    }
  }

  if (!replyId && !dmId) return 0;

  await remember(commentId, {
    platform,
    objectId: String(objectId),
    productId: product.id,
    replyId,
    dmId,
    dmPending: !dmId,
    attempts: Number((previous && previous.attempts) || 0) + 1,
    repliedAt: new Date().toISOString(),
    source: "webhook",
  });

  console.log(
    `[webhook] ${platform} ${commentId}: reply ${replyId ? "ok" : "no"}, dm ${dmId ? "ok" : "no"}`
  );
  return 1;
}

// ---- פירוק ה-payload ----------------------------------------------------

function collectJobs(payload) {
  const jobs = [];

  for (const entry of payload.entry || []) {
    const entryId = String(entry.id || "");

    for (const item of entry.messaging || []) {
      jobs.push(() => handleMessaging(item, entryId));
    }

    for (const change of entry.changes || []) {
      const field = String(change.field || "");
      const value = change.value || {};

      if (field === "feed") {
        // רק תגובות חדשות. לייקים, שיתופים ועריכות לא מעניינים כאן.
        if (value.item !== "comment" || value.verb !== "add") continue;
        jobs.push(() => handleComment("facebook", value));
        continue;
      }

      if (field === "comments") {
        jobs.push(() => handleComment("instagram", value));
        continue;
      }

      // mentions / message_reactions / live_comments — נספרים בלוג בלבד.
      console.log(`[webhook] meta change "${field}" ignored`);
    }
  }

  return jobs;
}

// ---- כניסה --------------------------------------------------------------

async function receive({raw, headers}) {
  if (INSECURE) {
    console.warn("[webhook] SOCIAL_WEBHOOK_INSECURE=1 — signature not checked");
  } else if (!APP_SECRET) {
    throw new WebhookError(500, "FB_APP_SECRET is not set");
  } else if (!signatureMatches(raw, headers["x-hub-signature-256"])) {
    throw new WebhookError(401, "signature mismatch");
  }

  let payload;
  try {
    payload = JSON.parse(raw.toString("utf8") || "{}");
  } catch (error) {
    throw new WebhookError(400, "body is not JSON");
  }

  if (payload.object !== "page" && payload.object !== "instagram") {
    return {received: 0, answered: 0, note: `object ${payload.object} ignored`};
  }

  const jobs = collectJobs(payload);
  let answered = 0;

  // מספיק לאירוע בודד; תקרה כדי שבקשה אחת לא תרוץ יותר מהזמן של הפונקציה.
  for (const job of jobs.slice(0, MAX_EVENTS)) {
    try {
      answered += await job();
    } catch (error) {
      // לא מפילים את כל הבקשה בגלל אירוע אחד — מטא תחזור שוב על כולם.
      console.warn(`[webhook] event failed — ${error.message}`);
    }
  }

  return {received: jobs.length, answered};
}

module.exports = {
  name: "meta",
  platform: "facebook, instagram",
  verify,
  receive,
  sendMessage,
  WebhookError,
};
