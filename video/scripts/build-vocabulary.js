"use strict";

/**
 * build-vocabulary.js
 * ---------------------------------------------------------------
 * בונה מאגר מילים מהקטלוג של אליאקספרס — בלי לפרסם ובלי לשמור מוצרים.
 *
 * שולף עד 50 כותרות לכל שאילתה (כל הקטגוריות המרכזיות), מסווג כל כותרת
 * למשפחת מוצר לפי taxonomy.js, וכותב corpus/vocabulary.json:
 * כל מילה באנגלית שמופיעה בקטלוג, כמה פעמים, לאילו משפחות היא שייכת
 * ובאילו קטגוריות. הקובץ הזה לא נוגע ב-products ולא מפרסם כלום — הוא
 * משמש רק לזיהוי טוב יותר של מוצר ולמילים שכותב התסריט מקבל כהקשר.
 *
 * הרצה:  node scripts/build-vocabulary.js
 *        node scripts/build-vocabulary.js --pages 2 --queries "baby monitor,camera"
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const {FAMILIES} = require("./script");
const {CORPUS_FILE} = require("./vocabulary");

const API_URL = "https://api-sg.aliexpress.com/sync";
const APP_KEY = process.env.ALIEXPRESS_APP_KEY || "517648";
const APP_SECRET =
  process.env.ALIEXPRESS_APP_SECRET || "BaXt8XVfIl2kJhOU10vhgCfwkzYRIjp0";
const TRACKING_ID = process.env.ALIEXPRESS_TRACKING_ID || "find4u_2025";

// כל קטגוריה מרכזית של אליאקספרס, בשאילתה אחת או שתיים.
const QUERIES = [
  "baby monitor",
  "security camera",
  "webcam",
  "projector",
  "bluetooth speaker",
  "headphones",
  "power bank",
  "phone case",
  "screen protector",
  "usb c hub",
  "laptop stand",
  "mechanical keyboard",
  "gaming mouse",
  "led strip",
  "desk lamp",
  "night light",
  "air purifier",
  "humidifier",
  "fan",
  "space heater",
  "vacuum cleaner",
  "robot vacuum",
  "air fryer",
  "blender",
  "coffee maker",
  "electric kettle",
  "kitchen gadget",
  "storage box",
  "hanger",
  "curtain",
  "carpet",
  "bedding set",
  "pillow",
  "essential oil diffuser",
  "scented candle",
  "hair dryer",
  "hair straightener",
  "electric shaver",
  "toothbrush electric",
  "nail drill",
  "makeup brush",
  "face serum",
  "massage gun",
  "fitness resistance band",
  "yoga mat",
  "dumbbell",
  "smart watch",
  "sunglasses",
  "jewelry set",
  "backpack",
  "wallet",
  "sneakers",
  "women dress",
  "men t-shirt",
  "pet bed",
  "cat toy",
  "dog leash",
  "aquarium filter",
  "drill",
  "tool set",
  "car accessories",
  "car vacuum",
  "bike light",
  "camping lamp",
  "fishing reel",
  "garden tools",
  "plant pot",
  "mosquito killer",
  "toy building blocks",
  "rc car",
  "drone",
  "baby stroller",
  "office chair",
  "notebook pen set",
  "sewing machine",
  "grill",
  // ---- הרחבה: עוד קטגוריות ועוד ניסוחים, כדי שמילון המילים יכסה את
  // רוב מה שנמכר בפועל ולא רק את הקטגוריות הראשונות.
  "kitchen organizer",
  "spice rack",
  "sink caddy",
  "food container",
  "lunch box",
  "water bottle",
  "thermos",
  "cutting board",
  "knife sharpener",
  "peeler",
  "silicone mat",
  "drain strainer",
  "dish rack",
  "bathroom shelf",
  "shower head",
  "soap dispenser",
  "toilet brush",
  "towel hook",
  "laundry basket",
  "clothes drying rack",
  "lint remover",
  "shoe rack",
  "storage basket",
  "drawer divider",
  "vacuum bag",
  "garden hose",
  "planter",
  "soil meter",
  "watering can",
  "garden gloves",
  "bbq tools",
  "camping chair",
  "tent",
  "sleeping bag",
  "cooler bag",
  "hiking backpack",
  "headlamp",
  "pocket knife",
  "compass",
  "car phone holder",
  "dash cam",
  "tire inflator",
  "car cleaning brush",
  "microfiber towel",
  "seat cushion",
  "sunshade car",
  "car charger",
  "obd scanner",
  "motorcycle gloves",
  "bike helmet",
  "bike pump",
  "bike lock",
  "scooter accessories",
  "drone accessories",
  "action camera",
  "gimbal stabilizer",
  "ring light",
  "studio light",
  "green screen",
  "microphone",
  "sound card",
  "audio mixer",
  "hdmi cable",
  "ethernet cable",
  "wifi repeater",
  "router",
  "mouse pad",
  "laptop bag",
  "monitor stand",
  "cable organizer",
  "desk organizer",
  "drawer organizer",
  "label printer",
  "thermal printer",
  "scanner",
  "tablet stand",
  "phone gimbal",
  "selfie stick",
  "tripod",
  "magnet holder",
  "wall hook",
  "adhesive tape",
  "velcro strap",
  "tool box",
  "screwdriver set",
  "wrench set",
  "soldering iron",
  "multimeter",
  "laser level",
  "tape measure",
  "safety goggles",
  "work gloves",
  "headphones case",
  "earbuds",
  "earphone case",
  "speaker stand",
  "tv mount",
  "projector screen",
  "remote control",
  "smart plug",
  "smart bulb",
  "door sensor",
  "security alarm",
  "doorbell camera",
  "baby gate",
  "baby bottle",
  "pacifier",
  "diaper bag",
  "kids toy",
  "puzzle",
  "drawing tablet",
  "school bag",
  "pencil case",
  "stationery set",
  "whiteboard",
  "desk mat",
  "ergonomic mouse",
  "wrist rest",
  "foot rest",
  "back support",
  "posture corrector",
  "knee brace",
  "ankle support",
  "heating pad",
  "massager",
  "foam roller",
  "jump rope",
  "ab roller",
  "gym gloves",
  "water bag fitness",
  "protein shaker",
  "kitchen scale",
  "food thermometer",
  "air fryer liner",
  "silicone mold",
  "cake mold",
  "baking mat",
  "cookie cutter",
  "icing nozzle",
  "coffee grinder",
  "milk frother",
  "tea infuser",
  "cocktail shaker",
  "wine opener",
  "can opener",
  "garlic press",
  "vegetable chopper",
  "egg beater",
  "measuring cup",
  "kitchen towel",
  "apron",
  "oven glove",
  "trash can",
  "mop",
  "broom",
  "cleaning brush",
  "sponge",
  "window cleaner",
  "duster",
  "lint roller",
  "fabric shaver",
  "clothes steamer",
  "ironing board",
  "sewing kit",
  "buttons",
  "zipper",
  "thread set",
  "yarn",
  "crochet hook",
  "knitting needles",
  "craft glue",
  "hot glue gun",
  "beads",
  "resin mold",
  "paint brush",
  "acrylic paint",
  "canvas board",
  "photo frame",
  "wall sticker",
  "wall clock",
  "mirror",
  "vase",
  "artificial plant",
  "plant stand",
  "curtain rod",
  "curtain hooks",
  "rug",
  "doormat",
  "table runner",
  "placemat",
  "cushion cover",
  "blanket",
  "duvet cover",
  "mattress protector",
  "bed sheet",
  "sleep mask",
  "earplugs",
  "travel pillow",
  "luggage organizer",
  "packing cube",
  "passport holder",
  "travel adapter",
  "neck fan",
  "hand warmer",
  "umbrella",
  "raincoat",
  "sunglasses case",
  "watch band",
  "bracelet",
  "necklace",
  "earrings",
  "hair clip",
  "hair brush",
  "hair curler",
  "eyelash curler",
  "eyebrow razor",
  "makeup bag",
  "cosmetic organizer",
  "pimple patch",
  "face mask",
  "gua sha",
  "jade roller",
  "hair removal",
  "nail file",
  "nail lamp",
  "perfume bottle",
  "electric lighter",
  "candle mold",
  "incense holder",
  "cat scratcher",
  "cat litter mat",
  "dog bowl",
  "pet hair remover",
  "pet water fountain",
  "bird cage",
  "fish tank",
  "reptile heater",
  "garden fence",
  "bird feeder",
  "pest repellent",
  "fly trap",
  "mosquito net",
  "first aid kit",
  "pill organizer",
  "digital thermometer",
  "blood pressure monitor",
  "oximeter",
  "hearing aid",
  "book light",
  "reading stand",
  "desk calendar",
  "keyboard cover",
  "webcam cover",
  "usb flash drive",
  "memory card",
  "card reader",
  "power strip",
  "extension cord",
  "surge protector",
  "voltage converter",
];

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "free",
  "new",
  "hot",
  "sale",
  "pcs",
  "set",
  "piece",
  "pieces",
  "high",
  "quality",
  "best",
  "top",
  "good",
  "plus",
  "pro",
  "mini",
  "portable",
  "multifunction",
  "multifunctional",
  "adjustable",
  "foldable",
  "wireless",
  "usb",
  "led",
  "smart",
  "digital",
  "electric",
  "automatic",
  "stainless",
  "steel",
  "plastic",
  "abs",
  "color",
  "colors",
  "size",
  "inch",
  "inches",
  "cm",
  "mm",
  "ml",
  "kg",
  "watt",
  "mah",
  "volt",
  "type",
  "style",
  "mode",
  "home",
  "use",
  "used",
  "kit",
  "tool",
  "accessories",
  "accessory",
  "device",
  "product",
  "products",
  "items",
  "item",
  "shipping",
  "dropshipping",
  "wholesale",
  "2025",
  "2026",
]);

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

async function aliexpressCall(method, params) {
  const payload = Object.assign(
    {
      app_key: APP_KEY,
      method,
      sign_method: "md5",
      timestamp: String(Date.now()),
      format: "json",
      v: "2.0",
    },
    params
  );
  payload.sign = signParams(payload);

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
    },
    body: new URLSearchParams(payload).toString(),
    signal: AbortSignal.timeout(30000),
  });
  const json = await response.json().catch(() => ({}));
  if (json.error_response) {
    const error = json.error_response;
    throw new Error(
      `${method} ${error.code}: ${error.msg || error.sub_msg || "unknown"}`
    );
  }
  return json;
}

async function searchTitles(query, pageNo) {
  const json = await aliexpressCall("aliexpress.affiliate.product.query", {
    keywords: query,
    page_no: String(pageNo),
    page_size: "50",
    sort: "LAST_VOLUME_DESC",
    target_currency: "ILS",
    target_language: "EN",
    ship_to_country: "IL",
    tracking_id: TRACKING_ID,
  });

  const result =
    json.aliexpress_affiliate_product_query_response &&
    json.aliexpress_affiliate_product_query_response.resp_result;
  const products = result && result.result && result.result.products;
  const list = products && products.product;
  return Array.isArray(list) ? list : list ? [list] : [];
}

// אותה לוגיקה של בחירת משפחה, על הכותרת באנגלית בלבד.
function familyOfTitle(title) {
  const text = String(title || "");
  const family = FAMILIES.find((item) => item.core && item.core.test(text));
  return family ? family.id : null;
}

function wordsOf(title) {
  return [
    ...new Set(
      String(title || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .split(" ")
        .filter(
          (word) =>
            word.length >= 3 &&
            word.length <= 22 &&
            !STOP_WORDS.has(word) &&
            !/^\d+$/.test(word)
        )
    ),
  ];
}

function parseArgs(argv) {
  const args = {pages: 1, queries: null};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--pages") args.pages = Math.max(1, Number(argv[i + 1]) || 1);
    if (argv[i] === "--queries") {
      args.queries = String(argv[i + 1] || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    }
  }
  return args;
}

async function main() {
  const {pages, queries} = parseArgs(process.argv.slice(2));
  const list = queries && queries.length ? queries : QUERIES;

  const words = new Map();
  let titles = 0;
  const seen = new Set();

  for (const query of list) {
    for (let page = 1; page <= pages; page += 1) {
      let products = [];
      try {
        products = await searchTitles(query, page);
      } catch (error) {
        console.error(`[vocab] "${query}" p${page}: ${error.message}`);
        continue;
      }

      for (const product of products) {
        const title = String(product.product_title || "").trim();
        if (!title || seen.has(title)) continue;
        seen.add(title);
        titles += 1;

        const family = familyOfTitle(title);
        const category =
          product.second_level_category_name ||
          product.first_level_category_name ||
          null;

        for (const word of wordsOf(title)) {
          const entry = words.get(word) || {
            w: word,
            n: 0,
            families: [],
            categories: [],
          };
          entry.n += 1;
          if (family && !entry.families.includes(family)) {
            entry.families.push(family);
          }
          if (category && entry.categories.length < 3 && !entry.categories.includes(category)) {
            entry.categories.push(category);
          }
          words.set(word, entry);
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    console.log(`[vocab] ${query}: ${titles} titles so far`);
  }

  const rows = [...words.values()]
    .filter((entry) => entry.n >= 2)
    .sort((a, b) => b.n - a.n)
    .slice(0, 6000);

  const byFamily = {};
  for (const entry of rows) {
    for (const family of entry.families) {
      byFamily[family] = (byFamily[family] || 0) + 1;
    }
  }

  fs.mkdirSync(path.dirname(CORPUS_FILE), {recursive: true});
  fs.writeFileSync(
    CORPUS_FILE,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        queries: list.length,
        pages,
        titles,
        families: byFamily,
        words: rows,
      },
      null,
      0
    )
  );

  console.log(
    `[vocab] wrote ${rows.length} words from ${titles} AliExpress titles → ${CORPUS_FILE}`
  );
}

main().catch((error) => {
  console.error("[vocab] failed:", error.message);
  process.exit(1);
});
