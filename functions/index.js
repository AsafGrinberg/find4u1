const {setGlobalOptions} = require("firebase-functions");
const {onRequest} = require("firebase-functions/https");
const axios = require("axios");

// הגבלת מספר מופעים בו זמנית של הפונקציה
setGlobalOptions({maxInstances: 10});

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
