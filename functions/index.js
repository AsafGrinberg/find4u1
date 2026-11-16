const {setGlobalOptions} = require("firebase-functions");
const {onRequest} = require("firebase-functions/v2/https");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const axios = require("axios");

// הגבלת מספר מופעים בו זמנית של הפונקציה
setGlobalOptions({maxInstances: 10});

// אתחול Firebase Admin פעם אחת (כותב ל-Firestore בהרשאות שרת, לא לפי כללי האתר)
if (!admin.apps.length) {
  admin.initializeApp();
}

const {runRecommendedProducts} = require("./recommended");

const APP_KEY = "516306";
const APP_SECRET = "X9nN6qyLdlzwwNV7xw41nLLbA3PEOLXJ";
const REDIRECT_URI = "https://find4u-il-aefd0.web.app/callback.html";

exports.exchangeToken = onRequest(async (req, res) => {
  const authorizationCode = req.query.code;
  if (!authorizationCode) {
    return res.status(400).send("Missing code");
  }

  try {
    const response = await axios.post("https://oauth.aliexpress.com/token", null, {
      params: {
        grant_type: "authorization_code",
        client_id: APP_KEY,
        client_secret: APP_SECRET,
        code: authorizationCode,
        redirect_uri: REDIRECT_URI,
      },
    });

    res.json(response.data);
  } catch (error) {
    res.status(500).send(error.response ? error.response.data : error.message);
  }
});

// ---------------------------------------------------------------------------
// פירסום מוצרים מומלצים לאליאקספרס — פעם בשעה
// ---------------------------------------------------------------------------
exports.recommendedProductsHourly = onSchedule(
  {
    schedule: "every 60 minutes",
    timeZone: "Asia/Jerusalem",
    timeoutSeconds: 540,
    memory: "512MiB",
    retryCount: 0,
  },
  async () => {
    const result = await runRecommendedProducts();
    console.log("[recommendedProductsHourly] finished", JSON.stringify(result));
  }
);

// ---------------------------------------------------------------------------
// הרצה ידנית לבדיקה:
// https://us-central1-find4u-il-aefd0.cloudfunctions.net/recommendedProductsNow?token=find4u-2025-run
// ---------------------------------------------------------------------------
exports.recommendedProductsNow = onRequest(
  {timeoutSeconds: 540, memory: "512MiB"},
  async (req, res) => {
    const expectedToken =
      process.env.RECOMMEND_TRIGGER_TOKEN || "find4u-2025-run";

    if (req.query.token !== expectedToken) {
      res.status(403).send("Forbidden");
      return;
    }

    try {
      const result = await runRecommendedProducts();
      res.json({ok: true, result: result});
    } catch (error) {
      console.error("[recommendedProductsNow] failed", error);
      res.status(500).json({ok: false, error: error.message});
    }
  }
);
