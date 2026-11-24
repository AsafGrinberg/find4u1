"use strict";

/**
 * run-import.js
 * ---------------------------------------------------------------
 * ריצה אחת של יבוא מוצרים מערוצי מתחרים. מיועד ל-GitHub Actions.
 * דורש FIREBASE_SERVICE_ACCOUNT, TELEGRAM_BOT_TOKEN ומפתחות הפיילייט
 * של אליאקספרס. IMPORT_DRY_RUN=1 מדפיס מה היה נכנס בלי לפרסם.
 */

const {initFirebase} = require("./firebase-env");
const {runImports} = require("./competitors");

async function main() {
  const firestore = initFirebase();
  const result = await runImports(firestore);

  console.log("[import] summary:", JSON.stringify(result, null, 2));

  if (result.alibaba.length > 0) {
    console.log(
      "[import] Alibaba links have no affiliate API — complete them by hand: " +
        "ads.alibaba.com → Deep Link Generator → paste the product URL → " +
        "use the same subid as the channel post."
    );
  }
}

main().catch((error) => {
  console.error("[import] job failed:", error.message);
  process.exit(1);
});
