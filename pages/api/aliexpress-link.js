// pages/api/aliexpress-link.js

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid url' });
  }

  // לוגיקת המרה אמיתית עם AppKey ו-Tracking ID
  const appKey = '517648'; // AppKey שלך
  const trackingId = 'find4u_2025'; // Tracking ID שלך
  let affiliateUrl = url;

  // המרה ללינק שותפים בפורמט הרשמי של AliExpress
  // תמיד משתמשים בדומיין האנגלי www.aliexpress.com/item/PRODUCT_ID.html
  let productIdMatch = url.match(/item\/(\d{6,})\.html/);
  if (productIdMatch) {
    const englishLink = `https://www.aliexpress.com/item/${productIdMatch[1]}.html`;
    affiliateUrl = `https://portals.aliexpress.com/link?appKey=${appKey}&trackingId=${trackingId}&link=${encodeURIComponent(englishLink)}`;
  }

  // אפשר להוסיף כאן לוגיקה מתקדמת או קריאה ל-API חיצוני

  return res.status(200).json({ affiliateUrl });
}
