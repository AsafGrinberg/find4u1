"use strict";

/**
 * backfill-galleries.js
 * ---------------------------------------------------------------
 * ממלא גלריה מלאה וסרטון למוצרים ותיקים שנוצרו כשהיה רק תמונה אחת.
 * משתמש באותו חשבון שירות של run-once.js, ולכן רץ ב GitHub Actions
 * (workflow dispatch או פעם בשבוע) ולא ב Cloud Functions.
 *
 * דורש משתנה סביבה FIREBASE_SERVICE_ACCOUNT שמכיל את תוכן
 * מפתח חשבון השירות (JSON) של הפרויקט.
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

  const {refreshMissingGalleries} = require("./recommended");
  const result = await refreshMissingGalleries();
  console.log("Finished:", JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error("Job failed:", error);
  process.exit(1);
});
