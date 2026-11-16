"use strict";

/**
 * run-once.js
 * ---------------------------------------------------------------
 * מריץ ריצה אחת של פרסום המוצרים המומלצים.
 * מיועד להרצה מתוזמנת ב GitHub Actions (בלי Blaze ובלי כרטיס אשראי).
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

  console.log(`[verify] firebase project: ${credentials.project_id}`);

  const {runRecommendedProducts} = require("./recommended");
  const result = await runRecommendedProducts();

  // Confirm the documents really landed in the database this job writes to.
  const firestore = admin.firestore();
  const productsCount = await firestore.collection("products").count().get();
  const categoriesCount = await firestore.collection("categories").count().get();

  console.log(`[verify] products in database: ${productsCount.data().count}`);
  console.log(`[verify] categories in database: ${categoriesCount.data().count}`);

  for (const item of result.published) {
    const doc = await firestore.collection("products").doc(item.docId).get();
    if (doc.exists) {
      const data = doc.data();
      console.log(
        `[verify] saved ${item.docId} | ${data.name} | ${data.price} ${data.currency} | ${data.category}`
      );
    } else {
      console.log(`[verify] MISSING ${item.docId}`);
    }
  }

  console.log("Finished:", JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error("Job failed:", error);
  process.exit(1);
});
