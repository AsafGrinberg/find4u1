"use strict";

/**
 * tiktok.js — מקום ה-webhook של טיקטוק (עדיין לא מחובר)
 * ---------------------------------------------------------------
 * ל-TikTok יש webhooks ל-Developer/Business API, אבל אין בהן אירוע של
 * תגובה חדשה על סרטון, ולכן גם כאן אי אפשר "לענות לתגובות בזמן אמת" —
 * זה עדיין דורש סריקה דרך ה-API.
 *
 * כשמחברים חשבון: מוסיפים כאן את אימות החתימה (TikTok חותם עם
 * Client Secret) ואת מיפוי האירועים. עד אז הנתיב מוכן ומחזיר תשובה
 * ברורה, ולא מעמיד פנים שהתקבל משהו.
 */

function verify(req, res) {
  return res.status(501).json({
    ok: false,
    error: "TikTok webhook is not connected yet",
  });
}

async function receive() {
  console.log("[webhook] tiktok event ignored — integration is not configured");
  return {received: 0, answered: 0, note: "TikTok is not connected yet"};
}

module.exports = {name: "tiktok", platform: "tiktok", verify, receive};
