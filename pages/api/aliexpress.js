// pages/api/aliexpress.js
import axios from "axios";
import crypto from "crypto";

export default async function handler(req, res) {
  const { keyword = "shoes", limit = "12", page_no = "1", random = "false" } = req.query;

  const appKey = process.env.ALIEXPRESS_APP_KEY || "517648";
  const trackingId = process.env.ALIEXPRESS_TRACKING_ID || "find4u_2025";
  const appSecret =
    process.env.ALIEXPRESS_APP_SECRET ||
    "BaXt8XVfIl2kJhOU10vhgCfwkzYRIjp0";

  if (!appKey || !trackingId || !appSecret) {
    return res
      .status(500)
      .json({ error: "Missing AliExpress credentials" });
  }

  try {
    const timestamp = new Date()
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");

    // If random is true, use a random keyword from popular categories
    const randomKeywords = ["electronics", "fashion", "home", "toys", "sports", "beauty", "automotive", "garden"];
    const searchKeyword = random === "true" 
      ? randomKeywords[Math.floor(Math.random() * randomKeywords.length)]
      : keyword;

    const baseParams = {
      app_key: appKey,
      method: "aliexpress.affiliate.product.query",
      sign_method: "md5",
      timestamp,
      v: "2.0",
      target_currency: "ILS",
      target_language: "HE",
      tracking_id: trackingId,
      keywords: searchKeyword,
      page_no: random === "true" ? Math.floor(Math.random() * 10 + 1).toString() : page_no,
      page_size: limit,
    };

    const sign = generateSignature(baseParams, appSecret);
    const finalParams = { ...baseParams, sign };

    const response = await axios.get(
      "https://api-sg.aliexpress.com/sync",
      { params: finalParams }
    );

    // 🔑 שליפה נכונה של המוצרים
    const products =
      response.data?.aliexpress_affiliate_product_query_response
        ?.resp_result?.result?.products?.product || [];

    const simplified = products.map((p) => {
      // The API returns prices in ILS already (based on target_sale_price_currency: "ILS")
      const ilsPrice = parseFloat(p.target_sale_price) || 0;
      const originalIlsPrice = parseFloat(p.target_original_price) || 0;
      
      // Translate category names
      const categoryTranslations = {
        'electronics': 'אלקטרוניקה',
        'fashion': 'אופנה',
        'home': 'בית',
        'toys': 'צעצועים',
        'sports': 'ספורט',
        'beauty': 'יופי',
        'automotive': 'רכב',
        'garden': 'גן'
      };
      
      const translatedCategory = categoryTranslations[searchKeyword] || searchKeyword;
      
             return {
         id: p.product_id,
         title: p.product_title,
         image: p.product_main_image_url,
         price: ilsPrice.toFixed(2) + " ₪",
         originalPrice: originalIlsPrice.toFixed(2) + " ₪",
        affiliateUrl: p.promotion_link || p.product_detail_url,
        description: p.product_description || `מוצר איכותי מ-AliExpress - ${p.lastest_volume ? `נמכרו ${p.lastest_volume} יחידות` : 'מוצר פופולרי'}`,
        category: translatedCategory,
        sales: p.lastest_volume || 0,
        gallery: p.product_small_image_urls?.string || [],
        shopName: p.shop_name || "חנות AliExpress",
        evaluateRate: p.evaluate_rate || "0%",
      };
    });

    return res.status(200).json(simplified);
  } catch (error) {
    console.error("API Error:", {
      message: error.message,
      response: error.response?.data,
    });
    return res.status(500).json({
      error: "Failed to fetch products",
      details: error.response?.data || error.message,
    });
  }
}

function generateSignature(params, secret) {
  const sortedKeys = Object.keys(params).sort();
  const baseString = sortedKeys
    .filter((key) => key !== "sign")
    .map((key) => `${key}${params[key]}`)
    .join("");
  const signString = `${secret}${baseString}${secret}`;
  return crypto
    .createHash("md5")
    .update(signString)
    .digest("hex")
    .toUpperCase();
}
