// fetchDebug.js
// Node.js 18+ כולל fetch מובנה

const APP_KEY = "517648"; // ה-AppKey שלך
const PRODUCT_ID = 1005007870885952; // מוצר לבדיקה
const ACCESS_TOKEN = "PUT_YOUR_ACCESS_TOKEN_HERE"; // אם נדרש (לפי התיעוד של AliExpress)

async function fetchProductDebug(productId) {
  try {
    // כאן בונים את ה-URL הרשמי לפי התיעוד של AliExpress
    const url = `https://openapi.aliexpress.com/openapi/param2/2/portals.open/api.getProductDetail/${APP_KEY}?productId=${productId}&fields=productId,title,image,product_gallery_images,description,price,brand&access_token=${ACCESS_TOKEN}`;

    const res = await fetch(url);
    const data = await res.json();

    console.log("RAW AliExpress API data for product:", JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Failed to fetch product:", err);
  }
}

fetchProductDebug(PRODUCT_ID);
