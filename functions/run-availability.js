"use strict";

/**
 * run-availability.js
 * ---------------------------------------------------------------
 * רץ אחרי הג'וב ההורלי: בודק אילו מוצרים בקטלוג עדיין קיימים באליאקספרס.
 *
 * מוצר שנמחק על ידי המוכר:
 *   • מסומן unavailable — האתר מסתיר אותו ומציע מוצר חלופי דומה
 *   • videoLinks שמפנים אליו מסומנים broken + מקבלים לינק חלופי
 *   • פוסטים בטלגרם נמחקים, אם הם בני פחות מ־48 שעות (מגבלת ה-Bot API)
 *
 * מוצר שחזר להיות זמין — הסימון מוסר אוטומטית.
 *
 * דורש FIREBASE_SERVICE_ACCOUNT (כמו run-once.js).
 */

const admin = require("firebase-admin");

async function main() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (!raw || raw.trim() === "") {
    console.error("FIREBASE_SERVICE_ACCOUNT is missing.");
    process.exit(1);
  }

  let credentials;
  try {
    credentials = JSON.parse(raw);
  } catch (error) {
    console.error("FIREBASE_SERVICE_ACCOUNT is not valid JSON.");
    process.exit(1);
  }

  if (!credentials.project_id || !credentials.private_key) {
    console.error("Service account JSON is missing project_id or private_key.");
    process.exit(1);
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(credentials),
      projectId: credentials.project_id,
    });
  }

  const {checkProductAvailability} = require("./recommended");
  const result = await checkProductAvailability();
  console.log("Finished:", JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error("Availability check failed:", error.message);
  process.exit(1);
});
