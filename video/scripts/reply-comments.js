"use strict";

/**
 * reply-comments.js
 * ---------------------------------------------------------------
 * עונה אוטומטית לכל מי שמגיב על הסרטונים שאנחנו העלינו ליוטיוב, עם
 * הלינק למוצר שמופיע בסרטון.
 *
 * איך זה יודע איזה מוצר זה?
 *   publish.js כותב לכל סרטון שעלה ליוטיוב מסמך ב-videoLinks/<videoId>
 *   עם הלינק למוצר. כאן קוראים את המסמך הזה — בלי לנחש לפי טקסט.
 *
 * כללים:
 *   • תגובה ראשית שכל השרשור שלה כבר קיבל ממני תגובה עם הלינק — לא נוגעים.
 *   • מי שמגיב על התגובה שלנו ("כמה זה עולה?") מקבל תשובה קבועה שמפנה
 *     לדף המוצר באתר — אין דרך להבין את השאלה, ולכן לא ממציאים תשובה.
 *   • הלינקים בכל התגובות מקוצרים, כי הקישור הארוך של אליאקספרס לא
 *     ניתן ללחיצה.
 *   • כל תגובה שענינו עליה נרשמת ב-answeredComments/<commentId>, כדי
 *     שריצה חוזרת לא תשלח את אותו לינק פעמיים.
 *   • תקרת תגובות לריצה (ברירת מחדל 30) כדי לא לשרוף את המכסה של יוטיוב.
 *
 * הרצה מקומית:
 *   FIREBASE_SERVICE_ACCOUNT_FILE=serviceAccount.json \
 *   YOUTUBE_CLIENT_ID=... YOUTUBE_CLIENT_SECRET=... YOUTUBE_REFRESH_TOKEN=... \
 *   node scripts/reply-comments.js
 *
 * בדיקה בלי לשלוח כלום:
 *   node scripts/reply-comments.js --dry-run
 * (ב-Windows CMD אין DRY_RUN=1 לפני הפקודה — לכן יש דגל.)
 *
 * את YOUTUBE_* אפשר לשים ב-video/.env; הסקריפט טוען אותו לבד.
 * אם חסרים פרטי לקוח, אפשר גם GOOGLE_CLIENT_SECRET_FILE=<client_secret.json>.
 *
 * בלי שום הגדרה מקומית אפשר להריץ את ה-workflow
 * "YouTube comment replies" ידנית מ-GitHub Actions עם dry_run=true.
 *
 * דורש הרשאת youtube.force-ssl בטוקן (auth-token.js מבקש אותה).
 */

const fs = require("fs");
const {loadEnvFile, truthy} = require("./env");
const {shortenUrl} = require("./short");
const socials = require("../../functions/socials");

loadEnvFile();

const API = "https://www.googleapis.com/youtube/v3";
const SITE_URL = (process.env.SITE_URL || "https://find4u.vercel.app").replace(
  /\/$/,
  ""
);

const MAX_REPLIES = Number(process.env.REPLY_MAX_PER_RUN || 30);
const MAX_AGE_DAYS = Number(process.env.REPLY_MAX_AGE_DAYS || 30);
const VIDEO_LIMIT = Number(process.env.REPLY_VIDEOS || 25);
const ARGV = process.argv.slice(2);
const DRY_RUN = ARGV.includes("--dry-run") || truthy(process.env.DRY_RUN);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// פרטי הלקוח: משתני סביבה, או קובץ client_secret שהורד מגוגל.
function clientCredentials() {
  let clientId = process.env.YOUTUBE_CLIENT_ID;
  let clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  if (clientId && clientSecret) return {clientId, clientSecret};

  const file = process.env.GOOGLE_CLIENT_SECRET_FILE;
  if (file && fs.existsSync(file)) {
    const json = JSON.parse(fs.readFileSync(file, "utf8"));
    const block = json.installed || json.web || json;
    clientId = clientId || block.client_id;
    clientSecret = clientSecret || block.client_secret;
  }

  return {clientId, clientSecret};
}

async function accessToken() {
  const {clientId, clientSecret} = clientCredentials();
  const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "חסרים YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET / YOUTUBE_REFRESH_TOKEN. " +
        "בהרצה מקומית שימו אותם ב-video/.env (או GOOGLE_CLIENT_SECRET_FILE לפרטי הלקוח), " +
        "או הריצו את ה-workflow \"YouTube comment replies\" ידנית מ-GitHub Actions — " +
        "שם הסודות כבר מוגדרים."
    );
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {"Content-Type": "application/x-www-form-urlencoded"},
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }).toString(),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.access_token) {
    throw new Error(`YouTube token: ${JSON.stringify(json).slice(0, 300)}`);
  }
  return json.access_token;
}

async function api(token, pathname, params = {}, init = {}) {
  const query = new URLSearchParams(params).toString();
  const url = `${API}/${pathname}${query ? `?${query}` : ""}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      ...(init.headers || {}),
    },
  });
  const json = await response.json().catch(() => ({}));

  if (response.status === 403) {
    const reason = json?.error?.errors?.[0]?.reason || "";
    if (/scope|forbidden/i.test(reason) || /insufficient/i.test(reason)) {
      throw new Error(
        "הטוקן של יוטיוב לא כולל הרשאת תגובות (youtube.force-ssl). " +
          "יש להריץ שוב: node scripts/auth-token.js youtube, ולעדכן את YOUTUBE_REFRESH_TOKEN"
      );
    }
  }

  if (!response.ok || json.error) {
    throw new Error(
      `YouTube ${pathname}: ${response.status} ${JSON.stringify(
        json.error || json
      ).slice(0, 400)}`
    );
  }
  return json;
}

async function myChannel(token) {
  const json = await api(token, "channels", {
    part: "id,contentDetails",
    mine: "true",
  });
  const channel = (json.items || [])[0];
  if (!channel) throw new Error("לא נמצא ערוץ יוטיוב מחובר לטוקן הזה");
  return {
    channelId: channel.id,
    uploads:
      channel.contentDetails?.relatedPlaylists?.uploads || null,
  };
}

async function recentVideoIds(token, uploads) {
  if (!uploads) return [];
  const json = await api(token, "playlistItems", {
    part: "contentDetails",
    playlistId: uploads,
    maxResults: String(Math.min(VIDEO_LIMIT, 50)),
  });
  return (json.items || [])
    .map((item) => item.contentDetails?.videoId)
    .filter(Boolean);
}

function videoIdOf(url) {
  const match = /(?:youtu\.be\/|v=|shorts\/|embed\/)([\w-]{6,})/i.exec(
    String(url || "")
  );
  return match ? match[1] : null;
}

// ---- שמירת מצב ----------------------------------------------------------
// ב-GitHub Actions יש service account, ואז כל תגובה שנרשמה נשמרת ב-Firestore.
// בהרצה מקומית בלי מפתח — עובדים בזיכרון בלבד, וזה מספיק לבדיקה.

async function openStore() {
  try {
    // נטען רק כאן, כדי שבדיקת dry-run מקומית תעבוד גם בלי firebase-admin מותקן.
    const {initFirebase} = require("./product");
    const db = initFirebase();
    const answered = db.collection("answeredComments");
    const links = db.collection("videoLinks");

    // מפת videoId → {url, productName} נטענת מראש (מסמכים בודדים, לא סריקה).
    return {
      persistent: true,
      async alreadyAnswered(commentId) {
        const doc = await answered.doc(String(commentId)).get();
        return doc.exists;
      },
      async remember(commentId, data) {
        await answered.doc(String(commentId)).set(data, {merge: true});
      },
      async linkFor(videoId) {
        const doc = await links.doc(String(videoId)).get();
        return doc.exists ? {...doc.data(), ref: doc.ref} : null;
      },
      // כל התגובות שאנחנו כתבנו על הסרטון (כדי לערוך את הלינק כשהמוצר נמחק).
      async repliesFor(videoId) {
        const snapshot = await answered
          .where("videoId", "==", String(videoId))
          .get();
        return snapshot.docs.map((item) => item.data());
      },
    };
  } catch (error) {
    console.warn(
      `[reply] Firestore is not available (${error.message.split("\n")[0]}) — ` +
        "using memory only; replies may repeat between runs"
    );
    const seen = new Set();
    const links = new Map();
    const rows = [];
    return {
      persistent: false,
      async alreadyAnswered(commentId) {
        return seen.has(String(commentId));
      },
      async remember(commentId, data) {
        seen.add(String(commentId));
        if (data) rows.push(data);
      },
      async linkFor(videoId) {
        return links.get(String(videoId)) || null;
      },
      async repliesFor(videoId) {
        return rows.filter((row) => String(row.videoId) === String(videoId));
      },
      _links: links,
    };
  }
}

function productUrl(link) {
  if (link.url) return link.url;
  if (link.slug) return `${SITE_URL}/product/${encodeURIComponent(link.slug)}`;
  return null;
}

// ביוטיוב שורטס הלינק בתגובה אינו לחיץ (מדיניות של יוטיוב), ולכן כל תגובה
// כוללת גם את כתובת האתר בטקסט רגיל — אותה אפשר להקליד או להעתיק בקלות.
const SITE_DOMAIN = SITE_URL.replace(/^https?:\/\//, "");

async function replyText(link) {
  const url = await shortenUrl(productUrl(link) || "");
  const signature = await socials.signature({skip: ["youtube"]});
  const name = String(link.productName || "").trim();
  if (!url) return name || "המוצר שלנו באתר Find4U";
  return [
    name,
    `🛒 ${url}`,
    `🌐 ${SITE_DOMAIN}`,
    "📍 כל המידע והמחירים של המוצר אפשר למצוא בדף המוצר",
    signature,
  ]
    .filter(Boolean)
    .join("\n");
}

// תשובה למי שמגיב על התגובה שלנו עם הלינק. הוא יכול לשאול כל דבר, ולכן
// במקום לנסות לנחש — מפנים אותו לדף המוצר, שבו כל הפרטים.
async function infoText(link) {
  const url = await shortenUrl(productUrl(link) || "");
  const signature = await socials.signature({skip: ["youtube"]});
  const lines = url
    ? [
        `כל המידע והמחירים של המוצר אפשר למצוא בדף המוצר שלנו 👉 ${url}`,
        `🌐 ${SITE_DOMAIN}`,
      ]
    : ["כל המידע והמחירים של המוצר אפשר למצוא בדף המוצר באתר Find4U"];
  if (signature) lines.push(signature);
  return lines.join("\n");
}

// מוצר שנמחק: מפנים למוצר החלופי במקום ללינק מת. בלי חלופה — לעמוד באתר,
// שמציג שהמוצר לא זמין.
function replyTarget(link) {
  if (link.broken && (link.replacementUrl || link.replacementLink)) {
    return {
      url: link.replacementUrl || link.replacementLink,
      productName: link.productName,
    };
  }
  return link;
}

async function editComment(token, commentId, text) {
  await api(
    token,
    "comments",
    {part: "snippet"},
    {
      method: "PUT",
      body: JSON.stringify({id: commentId, snippet: {textOriginal: text}}),
    }
  );
}

/**
 * אם המוצר של הסרטון נמחק מהחנות — מעדכנים את הלינק בתגובה הראשונה
 * ובכל התגובות שכתבנו בעבר על אותו סרטון, פעם אחת בלבד (repairedAt).
 */
async function repairBrokenLinks(token, store, link) {
  if (!link.broken) return;
  if (!(link.replacementUrl || link.replacementLink)) return;
  if (link.repairedAt) return;

  const text = await replyText(replyTarget(link));
  const ids = [];

  if (link.firstCommentId) ids.push(link.firstCommentId);
  try {
    const rows = await store.repliesFor(link.videoId);
    rows.forEach((row) => {
      if (row && row.replyId) ids.push(row.replyId);
    });
  } catch (error) {
    console.warn(`[reply] could not load old replies: ${error.message}`);
  }

  let edited = 0;
  for (const commentId of [...new Set(ids)]) {
    if (DRY_RUN) {
      console.log(`[reply] DRY_RUN would edit ${commentId}: ${text}`);
      edited += 1;
      continue;
    }
    try {
      await editComment(token, commentId, text);
      edited += 1;
    } catch (error) {
      console.warn(`[reply] edit ${commentId} failed — ${error.message}`);
    }
    await sleep(400);
  }

  if (edited > 0) {
    console.log(
      `[reply] ${link.videoId}: replaced a broken link with the replacement product (${edited} comments)`
    );
  }

  if (!DRY_RUN && link.ref) {
    await link.ref
      .set({repairedAt: new Date().toISOString(), repairedComments: edited}, {
        merge: true,
      })
      .catch(() => {});
  }
}

// תגובות ישירות לתגובה שלנו: קוראים אותן לפי parentId, ועונים לכל אחת
// פעם אחת בלבד (answeredComments).
async function repliesToOurComment(token, ourCommentId) {
  const json = await api(token, "comments", {
    part: "snippet",
    parentId: ourCommentId,
    maxResults: "100",
    textFormat: "plainText",
  });
  return json.items || [];
}

async function answerRepliesToOurs(
  token,
  store,
  videoId,
  ourCommentId,
  channelId,
  link,
  budget
) {
  if (!ourCommentId || budget <= 0) return 0;

  let children = [];
  try {
    children = await repliesToOurComment(token, ourCommentId);
  } catch (error) {
    console.warn(
      `[reply] ${videoId}: could not read replies to our comment — ${error.message}`
    );
    return 0;
  }

  if (children.length === 0) return 0;
  const text = await infoText(link);
  let answered = 0;

  for (const child of children) {
    if (answered >= budget) break;
    const snippet = child.snippet || {};
    if (!child.id) continue;
    if (snippet.authorChannelId?.value === channelId) continue;
    if (await store.alreadyAnswered(child.id)) continue;

    if (DRY_RUN) {
      console.log(`[reply] DRY_RUN would answer nested ${child.id}: ${text}`);
      answered += 1;
      continue;
    }

    try {
      const created = await api(
        token,
        "comments",
        {part: "snippet"},
        {
          method: "POST",
          body: JSON.stringify({
            snippet: {parentId: child.id, textOriginal: text},
          }),
        }
      );
      await store.remember(child.id, {
        videoId,
        commentId: child.id,
        replyId: created.id || null,
        productId: link.productId || null,
        nested: true,
        repliedAt: new Date().toISOString(),
      });
      answered += 1;
      console.log(`[reply] ${videoId}: answered nested ${child.id}`);
    } catch (error) {
      console.warn(
        `[reply] ${videoId}: nested reply failed — ${error.message}`
      );
    }

    await sleep(400);
  }

  return answered;
}

async function main() {
  const token = await accessToken();
  const store = await openStore();

  const {channelId, uploads} = await myChannel(token);
  console.log(`[reply] channel: ${channelId}`);

  const videoIds = await recentVideoIds(token, uploads);
  if (videoIds.length === 0) {
    console.log("[reply] no uploads found on the channel.");
    return;
  }
  console.log(`[reply] scanning ${videoIds.length} recent videos`);

  const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  let replied = 0;
  let scanned = 0;

  for (const videoId of videoIds) {
    if (replied >= MAX_REPLIES) break;

    const link = await store.linkFor(videoId);
    if (!link) {
      console.log(`[reply] ${videoId}: no product mapping (skipped)`);
      continue;
    }

    // מוצר שנמחק — מתקנים קודם את הלינקים בתגובות הקיימות.
    try {
      await repairBrokenLinks(token, store, link);
    } catch (error) {
      console.warn(`[reply] ${videoId}: link repair failed — ${error.message}`);
    }

    const target = replyTarget(link);

    // מונים לכל סרטון — כדי שבלוג יהיה אפשר לראות מיד אם הסרטון בכלל
    // נסרק, אם התגובה שלנו נמצאה, ואם היו תגובות שהשארנו בלי מענה.
    let threadsSeen = 0;
    let threadsWithOurs = 0;

    let pageToken = null;
    do {
      let threads;
      try {
        threads = await api(token, "commentThreads", {
          part: "snippet,replies",
          videoId,
          maxResults: "100",
          order: "time",
          textFormat: "plainText",
          ...(pageToken ? {pageToken} : {}),
        });
      } catch (error) {
        console.warn(`[reply] ${videoId}: ${error.message}`);
        break;
      }

      for (const thread of threads.items || []) {
        if (replied >= MAX_REPLIES) break;

        const top = thread.snippet?.topLevelComment;
        const snippet = top?.snippet || {};
        const commentId = top?.id || thread.id;
        scanned += 1;
        threadsSeen += 1;

        // תגובה שלי — לא עונים לעצמי.
        if (snippet.authorChannelId?.value === channelId) continue;

        // כבר יש תגובה שלי בשרשור. את התגובה הראשית כבר לא עונים — אבל
        // מי שהגיב על התגובה שלנו עם הלינק מקבל הפניה לדף המוצר.
        const replies = thread.replies?.comments || [];
        const ours = replies.filter(
          (item) => item.snippet?.authorChannelId?.value === channelId
        );
        if (ours.length > 0) {
          threadsWithOurs += 1;
          for (const ourComment of ours) {
            if (replied >= MAX_REPLIES) break;
            try {
              replied += await answerRepliesToOurs(
                token,
                store,
                videoId,
                ourComment.id,
                channelId,
                target,
                MAX_REPLIES - replied
              );
            } catch (error) {
              console.warn(
                `[reply] ${videoId}: nested answers failed — ${error.message}`
              );
            }
          }
          continue;
        }

        if (snippet.publishedAt) {
          const published = new Date(snippet.publishedAt).getTime();
          if (Number.isFinite(published) && published < cutoff) continue;
        }

        if (await store.alreadyAnswered(commentId)) continue;

        const text = await replyText(target);
        if (DRY_RUN) {
          console.log(`[reply] DRY_RUN would answer ${commentId}: ${text}`);
          replied += 1;
          continue;
        }

        try {
          const created = await api(
            token,
            "comments",
            {part: "snippet"},
            {
              method: "POST",
              body: JSON.stringify({
                snippet: {parentId: top.id, textOriginal: text},
              }),
            }
          );
          await store.remember(commentId, {
            videoId,
            commentId,
            replyId: created.id || null,
            productId: link.productId || null,
            repliedAt: new Date().toISOString(),
          });
          replied += 1;
          console.log(`[reply] ${videoId}: answered ${commentId}`);
        } catch (error) {
          console.warn(`[reply] ${videoId}: reply failed — ${error.message}`);
        }

        await sleep(400);
      }

      pageToken = threads.nextPageToken || null;
    } while (pageToken && replied < MAX_REPLIES);

    console.log(
      `[reply] ${videoId}: threads ${threadsSeen}, with our comment ${threadsWithOurs}, ` +
        `total replies so far ${replied}`
    );
  }

  console.log(
    `[reply] done. scanned ${scanned} comments, replied ${replied}` +
      (DRY_RUN ? " (dry run — nothing was sent)" : "")
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[reply] failed:", error.message);
    process.exit(1);
  });
