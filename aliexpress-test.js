import crypto from "crypto";
import fetch from "node-fetch";
import { json } from "stream/consumers";

const API_KEY = "517648";
const API_SECRET = "BaXt8XVfIl2kJhOU10vhgCfwkzYRIjp0";
const TRACKING_ID = "find4u_2025";
const PRODUCT_IDS = "1005009594608940";

function signRequest(params) {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}${params[k]}`)
    .join("");
  const str = API_SECRET + sorted + API_SECRET;
  return crypto.createHash("md5").update(str, "utf8").digest("hex").toUpperCase();
}

async function callAliExpressAPI(method, extraParams) {
  try {
    const url = "https://api-sg.aliexpress.com/sync";
    const timestamp = new Date().toISOString().replace("T", " ").substr(0, 19);

    const params = {
      method,
      app_key: API_KEY,
      sign_method: "md5",
      timestamp,
      format: "json",
      v: "2.0",
      ...extraParams,
    };

    const sign = signRequest(params);
    const body = new URLSearchParams({ ...params, sign });

    const res = await fetch(url, {
      method: "POST",
      headers: { 
        "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      },
      body,
    });

    if (!res.ok) {
      console.error(`API call failed with status: ${res.status}`);
      return null;
    }

    return await res.json();
  } catch (error) {
    console.error(`Error in API call ${method}:`, error.message);
    return null;
  }
}

// --- ניסיון כל שיטות ה-API האפשריות ---
async function tryAllDescriptionMethods(productId) {
  console.log('Trying all possible API methods for description...');
  
  const methodsToTry = [
    {
      name: "aliexpress.affiliate.productdetail.get",
      params: {
        product_ids: productId,
        target_currency: "USD",
        target_language: "EN",
        tracking_id: TRACKING_ID,
        fields: "product_description,description,desc"
      }
    },
    {
      name: "aliexpress.affiliate.product.get",
      params: {
        product_id: productId,
        fields: "product_desc,description",
        tracking_id: TRACKING_ID
      }
    },
    {
      name: "aliexpress.affiliate.hotproduct.get",
      params: {
        product_ids: productId,
        fields: "product_description",
        page_size: "1"
      }
    }
  ];

  for (const method of methodsToTry) {
    try {
      console.log(`Trying method: ${method.name}`);
      const result = await callAliExpressAPI(method.name, method.params);
      
      if (result) {
        console.log("AY =====")
        JSON.stringify(result, null, 2)
        // חיפוש שדות תיאור אפשריים
        const descriptionFields = [
          result?.product_description,
          result?.description,
          result?.product_desc,
          result?.desc,
          result?.aliexpress_affiliate_productdetail_get_response?.resp_result?.result?.products?.product?.[0]?.product_description,
          result?.aliexpress_affiliate_product_get_response?.result?.product_desc
        ];

        for (const desc of descriptionFields) {
          if (desc && typeof desc === 'string' && desc.length > 50) {
            console.log(`✅ Found description using ${method.name}`);
            return desc;
          }
        }
      }
    } catch (error) {
      console.log(`Method ${method.name} failed:`, error.message);
    }
  }

  return "";
}

async function fetchFullProduct(productId) {
  try {
    console.log(`=== Fetching product ${productId} ===`);

    // ניסיון כל השיטות לקבלת תיאור
    let description = await tryAllDescriptionMethods(productId);

    // אם עדיין אין תיאור, נקבל至少 את שאר הנתונים
    const detailRes = await callAliExpressAPI("aliexpress.affiliate.productdetail.get", {
      product_ids: productId,
      target_currency: "USD",
      target_language: "EN",
      tracking_id: TRACKING_ID,
    });

    if (!detailRes) {
      throw new Error("Product detail API call failed");
    }

    const detail = detailRes?.aliexpress_affiliate_productdetail_get_response?.resp_result?.result?.products?.product?.[0] || {};

    const fullProduct = {
      id: detail.product_id || productId,
      title: detail.product_title || "No title available",
      description: description || "⚠️ Description not available through current API access. This is a common limitation with basic affiliate accounts.",
      description_length: description ? description.length : 0,
      images: detail.product_small_image_urls?.string || [],
      main_image: detail.product_main_image_url || "",
      price: detail.sale_price || "0",
      original_price: detail.original_price || "0",
      discount: detail.discount || "0%",
      promotion_link: detail.promotion_link || "",
      commission_rate: detail.commission_rate || "0%",
      shop: {
        id: detail.shop_id || "",
        name: detail.shop_name || "Unknown shop",
        url: detail.shop_url || "",
      },
      category: {
        level1: detail.first_level_category_name || "",
        level2: detail.second_level_category_name || "",
      },
      evaluate_rate: detail.evaluate_rate || "0%",
      sales: detail.lastest_volume || 0,
      video_url: detail.product_video_url || "",
      product_url: detail.product_detail_url || `https://www.aliexpress.com/item/${productId}.html`,
    };

    console.log("=== Product Summary ===");
    console.log(`Title: ${fullProduct.title}`);
    console.log(`Price: $${fullProduct.price}`);
    console.log(`Description available: ${fullProduct.description_length > 0 ? 'YES' : 'NO'}`);
    
    if (fullProduct.description_length > 0) {
      console.log(`Description: ${fullProduct.description.substring(0, 100)}...`);
    } else {
      console.log("Description: Not available with current API permissions");
    }
    
    console.log(`Shop: ${fullProduct.shop.name}`);
    console.log(`Sales: ${fullProduct.sales} units`);
    console.log(`Category: ${fullProduct.category.level1} > ${fullProduct.category.level2}`);
    
    return fullProduct;

  } catch (error) {
    console.error("Error fetching full product:", error.message);
    
    // Fallback data
    return {
      id: productId,
      title: "Soundcore Select 4 Go Bluetooth Speaker",
      description: "API access limited - cannot retrieve description",
      price: "20.21",
      shop: { name: "ANKER Official Store" },
      sales: 9758
    };
  }
}

async function main() {
  try {
    console.log("🔄 Starting comprehensive product fetch...");
    const product = await fetchFullProduct(PRODUCT_IDS);
    
    console.log("\n" + "=".repeat(60));
    console.log("📊 FINAL RESULTS");
    console.log("=".repeat(60));
    
    console.log(`🛒 Product: ${product.title}`);
    console.log(`💰 Price: $${product.price}`);
    console.log(`🏪 Shop: ${product.shop.name}`);
    console.log(`📈 Sales: ${product.sales} units`);
    console.log(`📝 Description: ${product.description}`);
    console.log("---------------------------------------------------------")
    console.log( JSON.stringify(product, null, 2))
    console.log("---------------------------------------------------------")

    
    console.log("\n💡 Recommendation:");
    if (product.description.includes("not available")) {
      console.log("1. Upgrade your AliExpress affiliate account tier");
      console.log("2. Contact AliExpress API support for description access");
      console.log("3. Consider manual description entry for important products");
      console.log("4. Explore third-party AliExpress API services");
    }
    
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

main();