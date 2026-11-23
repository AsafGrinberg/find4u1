"use strict";

/**
 * product-details.js
 * ---------------------------------------------------------------
 * שולף מאליאקספרס את התיאור הארוך והמפרט של המוצר, כדי שכותר התסריט
 * (Gemini) יעבוד עם המידע האמיתי ולא רק עם שם מקוצר בעברית.
 *
 * ה-API של השותפים (affiliate) לא מחזיר תיאור. התיאור נמצא ב-
 * aliexpress.ds.product.get, בפרמטרים ae_item_base_info_dto.detail
 * (HTML) ו-ae_item_properties (מפרט). לא לכל אפליקציה יש הרשאה לשם,
 * ולכן כל כישלון נרשם ומוחזר null — הריל פשוט ייכתב מהכותרת והקטגוריה.
 */

const crypto = require("crypto");

const API_URL = "https://api-sg.aliexpress.com/sync";
const APP_KEY = process.env.ALIEXPRESS_APP_KEY || "517648";
const APP_SECRET =
  process.env.ALIEXPRESS_APP_SECRET || "BaXt8XVfIl2kJhOU10vhgCfwkzYRIjp0";
const TRACKING_ID = process.env.ALIEXPRESS_TRACKING_ID || "find4u_2025";

const MAX_DESCRIPTION = 4000;

function signParams(params) {
  const concatenated = Object.keys(params)
    .sort()
    .map((key) => key + params[key])
    .join("");
  return crypto
    .createHash("md5")
    .update(APP_SECRET + concatenated + APP_SECRET)
    .digest("hex")
    .toUpperCase();
}

function htmlToText(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function specsOf(result) {
  const properties = [];
  const collect = (list) => {
    for (const item of Array.isArray(list) ? list : [list]) {
      if (!item) continue;
      const name = item.attr_name || item.property_name || item.name;
      const value = item.attr_value || item.property_value || item.value;
      if (!name || !value) continue;
      const line = `${String(name).trim()}: ${String(value).trim()}`;
      if (!properties.includes(line)) properties.push(line);
    }
  };

  const bag = result.ae_item_properties || {};
  collect(bag.ae_item_property);
  collect(result.ae_item_property);

  for (const sku of result.ae_item_sku_info_dtos?.ae_item_sku_info_d_t_o || []) {
    collect(sku.ae_sku_property_dtos?.ae_sku_property_d_t_o);
  }

  return properties.filter((line) => line.length < 160).slice(0, 30);
}

async function fetchProductDetails(productId) {
  const payload = {
    app_key: APP_KEY,
    method: "aliexpress.ds.product.get",
    sign_method: "md5",
    timestamp: String(Date.now()),
    format: "json",
    v: "2.0",
    product_id: String(productId),
    ship_to_country: "IL",
    target_currency: "ILS",
    target_language: "EN",
    tracking_id: TRACKING_ID,
  };
  payload.sign = signParams(payload);

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
    },
    body: new URLSearchParams(payload).toString(),
    signal: AbortSignal.timeout(30000),
  });
  const text = await response.text();

  let json;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new Error(`ds.product.get returned non-JSON: ${text.slice(0, 160)}`);
  }
  if (json.error_response) {
    const error = json.error_response;
    throw new Error(
      `ds.product.get ${error.code}: ${error.msg || error.sub_msg || "unknown"}`
    );
  }

  const body = json.aliexpress_ds_product_get_response;
  const result = body && body.result;
  if (!result) throw new Error("ds.product.get: no result");

  const base = result.ae_item_base_info_dto || {};
  const description = htmlToText(base.detail || base.mobile_detail || "").slice(
    0,
    MAX_DESCRIPTION
  );

  return {
    description,
    specs: specsOf(result),
    title: base.subject || base.product_title || null,
    brand: base.brand_name || null,
  };
}

/**
 * משלים למוצר תיאור ומפרט, ושומר אותם ב-Firestore כדי שריצה הבאה לא
 * תבזבז עליהם קריאה. לא זורק שגיאה בשום מקרה.
 */
async function enrichProduct(product, options = {}) {
  if (!product || !product.id) return product;
  if (product.sourceDescription && product.sourceDescription.length > 80) {
    return product;
  }
  if (options.skip) return product;

  const sourceId = String(product.id).replace(/^aliexpress_/, "");

  try {
    const details = await fetchProductDetails(sourceId);
    if (!details.description && details.specs.length === 0) {
      console.log(`[product] no description on AliExpress for ${product.id}`);
      return product;
    }

    product.sourceDescription = details.description || null;
    product.specs = details.specs;
    if (!product.brand && details.brand) product.brand = details.brand;

    console.log(
      `[product] description ${details.description.length} chars, ${details.specs.length} specs for ${product.id}`
    );

    if (product.ref) {
      await product.ref
        .set(
          {
            sourceDescription: product.sourceDescription,
            sourceSpecs: details.specs,
            detailsUpdatedAt: new Date().toISOString(),
          },
          {merge: true}
        )
        .catch(() => {});
    }
  } catch (error) {
    console.warn(`[product] description unavailable: ${error.message}`);
  }

  return product;
}

module.exports = {enrichProduct, fetchProductDetails, htmlToText, specsOf};
