"use strict";

/**
 * firebase-env.js
 * ---------------------------------------------------------------
 * אתחול Firebase מתוך הסוד FIREBASE_SERVICE_ACCOUNT.
 * משמש את ג'ובי ה-GitHub Actions שרצים בלי Cloud Functions
 * (run-deals.js, run-import.js), כדי שלא יהיה אתחול כפול בכל קובץ.
 */

const admin = require("firebase-admin");

function initFirebase() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (!raw || raw.trim() === "") {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is missing.");
  }

  let credentials;
  try {
    credentials = JSON.parse(raw);
  } catch (error) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is not valid JSON.");
  }

  if (!credentials.project_id || !credentials.private_key) {
    throw new Error(
      "Service account JSON is missing project_id or private_key."
    );
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(credentials),
      projectId: credentials.project_id,
    });
  }

  console.log(`[firebase] project: ${credentials.project_id}`);
  return admin.firestore();
}

module.exports = {initFirebase};
