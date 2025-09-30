// fetchAliExpressProduct.js
// Node.js 18+ כולל fetch מובנה

const APP_KEY = "517648"; // ה-AppKey שלך
const APP_SECRET = "BaXt8XVfIl2kJhOU10vhgCfwkzYRIjp0"; // ה-AppSecret שלך
const REDIRECT_URI = "https://find4u.vercel.app/callback"; // מה שהגדרת ב-App
const PRODUCT_ID = 1005007870885952; // החלף במוצר לבדיקה

// שלב 1: אחרי שהמשתמש עובר ל-URL authorize ומאשר
// אתה מקבל code ב-callback URL
const AUTH_CODE = "PASTE_YOUR_AUTH_CODE_HERE"; // קוד שאתה מקבל פעם אחת מהדפדפן

// פונקציה לקבלת Access Token
async function getAccessToken(authCode) {
  try {
    const url = `https://gw.openservice.aliexpress.com/openapi/param2/1/system.oauth2/getToken/${APP_KEY}`;
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      code: authCode,
      client_id: APP_KEY,
      client_secret: APP_SECRET,
      redirect_uri: REDIRECT_URI
    });

    const res = await fetch(`${url}?${params.toString()}`);
    const data = await res.json();
    console.log("Access token data:", data);
    return data.access_token;
  } catch (err) {
    console.error("Failed to get access token:", err);
  }
}

// פונקציה למשיכת פרטי מוצר מלאים
async function fetchProductFull(productId, accessToken) {
  try {
    const url = `https://gw.openservice.aliexpress.com/openapi/param2/2/portals.open/api.getProductDetail/${APP_KEY}`;
    const params = new URLSearchParams({
      productId: productId,
      fields: "productId,title,image,product_gallery_images,description,price,brand",
      access_token: accessToken
    });

    const res = await fetch(`${url}?${params.toString()}`);
    const data = await res.json();
    console.log("Product full data:", JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Failed to fetch product:", err);
  }
}

// Main
(async () => {
  const token = await getAccessToken(AUTH_CODE);
  if (token) {
    await fetchProductFull(PRODUCT_ID, token);
  }
})();
