// --- פונקציה מתקדמת למשיכת מוצר מאליאקספרס כולל תיאור ותמונות ---
// import crypto from "crypto"; // כבר מיובא בהמשך הקובץ
// import fetch from "node-fetch"; // הסרת ייבוא node-fetch בסביבה דפדפן
import md5 from "js-md5";

const API_KEY = "517648";
const API_SECRET = "BaXt8XVfIl2kJhOU10vhgCfwkzYRIjp0";
const TRACKING_ID = "find4u_2025";

function signRequest(params) {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}${params[k]}`)
    .join("");
  const str = API_SECRET + sorted + API_SECRET;
  return md5(str).toUpperCase();
}

async function callAliExpressAPI(method, extraParams) {
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

  let fetchFn = typeof fetch !== 'undefined' ? fetch : null;
  if (!fetchFn) {
    // ייבוא דינמי של node-fetch רק אם אין fetch גלובלי
    const nodeFetch = await import('node-fetch');
    fetchFn = nodeFetch.default;
  }
  const res = await fetchFn(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    },
    body,
  });

  if (!res.ok) return null;
  return await res.json();
}

export async function fetchAliExpressFullProduct(productId) {
  // ניסיון כל השיטות לקבלת תיאור
  async function tryAllDescriptionMethods(productId) {
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
      const result = await callAliExpressAPI(method.name, method.params);
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
          return desc;
        }
      }
    }
    return "";
  }

  let description = await tryAllDescriptionMethods(productId);

  const detailRes = await callAliExpressAPI("aliexpress.affiliate.productdetail.get", {
    product_ids: productId,
    target_currency: "USD",
    target_language: "EN",
    tracking_id: TRACKING_ID,
  });

  const detail = detailRes?.aliexpress_affiliate_productdetail_get_response?.resp_result?.result?.products?.product?.[0] || {};

  return {
    id: detail.product_id || productId,
    title: detail.product_title || "No title available",
    description: description || "⚠️ Description not available through current API access.",
    images: detail.product_small_image_urls?.string || [],
    main_image: detail.product_main_image_url || "",
    price: detail.sale_price || "0",
    original_price: detail.original_price || "0",
    discount: detail.discount || "0%",
    promotion_link: detail.promotion_link || "",
    shop: {
      id: detail.shop_id || "",
      name: detail.shop_name || "Unknown shop",
      url: detail.shop_url || "",
    },
    category: {
      level1: detail.first_level_category_name || "",
      level2: detail.second_level_category_name || "",
    },
    sales: detail.lastest_volume || 0,
    product_url: detail.product_detail_url || `https://www.aliexpress.com/item/${productId}.html`,
  };
}
import * as cheerio from 'cheerio';
// מחלץ מזהה מוצר מתוך לינק אפיליאייט או לינק מלא
async function extractProductIdFromUrl(url) {
  try {
    // אם זה לינק מקוצר, נבצע רידיירקט ונקבל את ה-URL הסופי
    if (url.includes('s.click.aliexpress.com')) {
      const resp = await axios.get(url, { maxRedirects: 0, validateStatus: s => s >= 300 && s < 400 });
      const location = resp.headers.location || url;
      url = location;
    }
    // מחפש מזהה מוצר ב-URL
    const match = url.match(/item\/(\d{6,})\.html/) || url.match(/(\d{6,})/);
    return match ? match[1] : null;
  } catch {
    const match = (url || '').match(/(\d{6,})/);
    return match ? match[1] : null;
  }
}
import fs from 'fs';
import path from 'path';
import axios from 'axios';
// import crypto from 'crypto'; // כבר מיובא בתחילת הקובץ

function getAliExpressTimestamp() {
  const date = new Date();
  const yyyy = date.getUTCFullYear();
  const MM = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const HH = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}-${MM}-${dd} ${HH}:${mm}:${ss}`;
}

function generateSignature(params, secret) {
  const sortedKeys = Object.keys(params).sort();
  const baseString = sortedKeys.map(key => `${key}${params[key]}`).join('');
  const signString = `${secret}${baseString}${secret}`;
  return md5(signString).toUpperCase();
}

// fetch התמונה הראשית מהדף
async function fetchImageFromProductPage(url) {
  try {
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);
    const img = $('meta[property="og:image"]').attr('content');
    return img || null;
  } catch (err) {
    return null;
  }
}

// הורדת תמונה ושמירה כקובץ פיזי
async function downloadImage(url, productId) {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const ext = path.extname(url.split('?')[0]) || '.jpg';
    const dir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    const filePath = path.join(dir, `${productId}${ext}`);
    fs.writeFileSync(filePath, response.data);
    return filePath; // הנתיב של הקובץ שהורד
  } catch (err) {
    console.error('Download Image Error:', err.message);
    return null;
  }
}

export async function fetchAliExpressProductById(productId) {
  console.log('🔎 fetchAliExpressProductById: productId=', productId);
  // לוגים נוספים
  if (!productId) {
    console.warn('⚠️ productId is empty!');
  }
  const appKey = '517648';
  const appSecret = 'BaXt8XVfIl2kJhOU10vhgCfwkzYRIjp0';

  async function queryWithKeyword(keyword) {
    console.log('🔎 queryWithKeyword: keyword=', keyword);
    const params = {
      app_key: appKey,
      method: 'aliexpress.affiliate.product.query',
      keywords: keyword,
      target_currency: 'ILS',
      target_language: 'HE',
      ship_to_country: 'IL',
      page_no: '1',
      page_size: '50',
      timestamp: getAliExpressTimestamp(),
      sign_method: 'md5',
      v: '2.0',
      tracking_id: 'find4u_2025'
    };
    params.sign = generateSignature(params, appSecret);
    const response = await axios.get('https://api-sg.aliexpress.com/sync', { params });
  console.log('📦 API raw response:', JSON.stringify(response.data, null, 2));
    return response.data?.aliexpress_affiliate_product_query_response?.resp_result?.result?.products?.product || [];
  }

  // אם קיבלנו לינק, נחלץ מזהה מוצר
  let pid = String(productId);
  if (pid && pid.startsWith('http')) {
    pid = await extractProductIdFromUrl(pid);
  }
  if (!pid) return null;

  // חיפוש לפי מזהה
  let products = await queryWithKeyword(pid);
  console.log('🔎 products found:', products ? products.length : 0);
  if (products && products.length > 0) {
    console.log('🔎 products sample:', JSON.stringify(products[0], null, 2));
  }
  let product = products.find(p => String(p.product_id) === pid)
             || products.find(p => (p.product_detail_url || '').includes(`/item/${pid}.html`))
             || products.find(p => (p.promotion_link || '').includes(pid));

  // חיפוש לפי URL מלא אם לא מצאנו
  if (!product) {
    products = await queryWithKeyword(`https://www.aliexpress.com/item/${pid}.html`);
    product = products.find(p => (p.product_detail_url || '').includes(`/item/${pid}.html`))
           || products.find(p => String(p.product_id) === pid);
  }

  // אם עדיין לא נמצא מוצר מדויק, נחזיר מוצר דומה ראשון מהתוצאות
  if (!product && products && products.length > 0) {
    product = products[0];
    console.log('⚠️ לא נמצא מוצר מדויק, מחזיר מוצר דומה ראשון');
  }

  if (!product) return null;
  console.log('🔎 product found:', product && product.product_id);
  console.log('🔎 product object:', JSON.stringify(product, null, 2));

  // אוסף כל התמונות מה-API הרשמי
  let images = [];
  console.log('🔎 product object:', JSON.stringify(product, null, 2));
  if (product.product_main_image_url) images.push(product.product_main_image_url);
  if (product.product_small_image_urls && Array.isArray(product.product_small_image_urls.string)) {
    images.push(...product.product_small_image_urls.string);
  }
  if (product.product_image_list && Array.isArray(product.product_image_list)) {
    images.push(...product.product_image_list.map(img => img.image_url).filter(Boolean));
  }
  if (product.product_gallery_url) images.push(product.product_gallery_url);

  // אם אין תמונה, מנסה לגרד מהדף עצמו
  if ((images.length === 0 || (images[0] && images[0].includes('placeholder'))) && product.product_detail_url) {
    try {
      const { extractAliExpressProductData } = await import('./aliexpress-scraper.js');
      const scraped = await extractAliExpressProductData(product.product_detail_url);
      if (scraped && Array.isArray(scraped.images) && scraped.images.length > 0) {
        images = scraped.images;
        console.log('🔎 Scraper images used:', images);
      }
    } catch (err) {
      console.warn('Scraper fallback failed:', err);
    }
  }

  // fallback ל-placeholder
  if (images.length === 0) images.push('https://via.placeholder.com/300?text=No+Image');

  // הורדת התמונה הראשית כקובץ פיזי
  const mainImageFile = await downloadImage(images[0], productId);

  return {
    id: product.product_id,
    name: product.product_title,
    images, // מערך תמונות
    mainImageFile, // קובץ פיזי שניתן להעלות לטופס
    price: Number(product.target_sale_price) || 0,
    originalPrice: Number(product.target_original_price) || 0,
    category: `${product.first_level_category_name} / ${product.second_level_category_name}` || 'AliExpress',
    affiliateUrl: product.product_detail_url || product.promotion_link,
    source: 'aliexpress'
  };
}
