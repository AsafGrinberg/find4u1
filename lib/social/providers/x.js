"use strict";

/**
 * x.js — מקום ה-webhook של X (טוויטר)
 * ---------------------------------------------------------------
 * ל-X יש Account Activity API, והיא דורשת מסלול בתשלום ורישום אפליקציה.
 * כמו בטיקטוק, גם שם אין "תגובה על פוסט" כמו בפייסבוק — יש אירועים ברמת
 * החשבון (אזכורים, תגובות לשרשור) שדורשים מיפוי נפרד.
 *
 * הנתיב קיים כדי שהוספת הרשת תהיה קובץ אחד, ולא ארכיטקטורה חדשה.
 */

function verify(req, res) {
  return res.status(501).json({
    ok: false,
    error: "X webhook is not connected yet",
  });
}

async function receive() {
  console.log("[webhook] x event ignored — integration is not configured");
  return {received: 0, answered: 0, note: "X is not connected yet"};
}

module.exports = {name: "x", platform: "x", verify, receive};
