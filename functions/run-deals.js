"use strict";

/**
 * run-deals.js
 * ---------------------------------------------------------------
 * ריצה אחת של פוסטי הדילים לטלגרם. מיועד ל-GitHub Actions.
 * דורש FIREBASE_SERVICE_ACCOUNT ו-TELEGRAM_BOT_TOKEN.
 * DEALS_DRY_RUN=1 מדפיס מה היה נשלח בלי לשלוח כלום.
 */

const {initFirebase} = require("./firebase-env");
const {runDealPosts} = require("./deals");

async function main() {
  const firestore = initFirebase();
  const result = await runDealPosts(firestore);

  console.log("[deals] summary:", JSON.stringify(result, null, 2));

  if (result.posted.length === 0 && result.candidates > 0) {
    console.log(
      "[deals] there were candidates but nothing was posted — see the skipped list."
    );
  }
}

main().catch((error) => {
  console.error("[deals] job failed:", error.message);
  process.exit(1);
});
