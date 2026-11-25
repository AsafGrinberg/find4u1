// lib/dedupe.mjs
// זיהוי ומיזוג עותקים של אותו מוצר.
//
// אותו דגם נמכר אצל כמה מוכרים באליאקספרס: לעיתים עם אותה תמונה בדיוק,
// ולעיתים עם תמונה אחרת וכותרת אחרת לאותו דגם ("VGR 353 מקצועית" /
// "מכונת גילוח חשמלית VGR 353 נטענת עם לה ביד יחיד"). לכן הזהוי עובד
// בשני שלבים:
//   1. תמונה זהה (imageKey) — הסימן המדויק ביותר.
//   2. מותג + מספר דגם מתוך השם (modelSignature) — למשל vgr + 353.
//      מיזוג לפי מספר בלבד לא נעשה, ולכן "שעון 353" לא יתמזג עם
//      "VGR 353"; נדרשת חפיפה של מותג ומספר דגם.
//
// מתוך כל עותק נבחר הזול ביותר (המחיר והקישור מגיעים יחד, כדי שהמחיר
// שמוצג יהיה המחיר בדף היעד), וכשהמחיר זהה — הדירוג והביקורות הטובים
// ביותר. שאר הנתונים הטובים נשמרים במיזוג: דירוג, כמות מכירות וגלריה.

const YEAR_TOKENS = new Set([
  '2019',
  '2020',
  '2021',
  '2022',
  '2023',
  '2024',
  '2025',
  '2026',
  '2027',
]);

// מילים לטיניות שמופיעות בכותרת ואינן המותג, כדי שמותג לא יזוהה בטעות.
const NOISE_TOKENS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'new',
  'hot',
  'sale',
  'free',
  'shipping',
  'original',
  'genuine',
  'official',
  'professional',
  'electric',
  'electrical',
  'wireless',
  'portable',
  'rechargeable',
  'cordless',
  'smart',
  'mini',
  'plus',
  'max',
  'ultra',
  'super',
  'multi',
  'set',
  'kit',
  'pack',
  'pcs',
  'pc',
  'piece',
  'pieces',
  'color',
  'black',
  'white',
  'green',
  'blue',
  'red',
  'pink',
  'gray',
  'grey',
  'large',
  'small',
  'home',
  'car',
  // דגמי טלפון ומותגי אביזרים: "iPhone 17" אינו דגם של המוצר עצמו.
  'iphone',
  'ipad',
  'android',
  'samsung',
  'pixel',
  'galaxy',
  'magsafe',
  // שמות כלליים של סוג מוצר או פיצ'ר — לא מותג.
  'pro',
  'foldable',
  'rotatable',
  'holder',
  'stand',
  'mount',
  'bracket',
  'clip',
  'keychain',
  'carabiner',
  'ring',
  'wallet',
  'cover',
  'case',
  'charger',
  'adapter',
  'cable',
  'brush',
  'blade',
  'filter',
  'lamp',
  'bulb',
  'light',
  'fan',
  'speaker',
  'camera',
  'phone',
  'tablet',
  'laptop',
  'monitor',
  'robot',
  'vacuum',
  'cleaner',
  'shaver',
  'trimmer',
  'blender',
  'massage',
  'gun',
  'oil',
  'tool',
  'tools',
  'battery',
  'magnet',
  'magnetic',
  'metal',
  'silicone',
  'plastic',
  'leather',
  'glass',
  'steel',
  'compatible',
  'universal',
  'genuine',
]);

// יחידות מידה בעברית. מתורגמות ליחידה לטינית, כדי ש"250 מ״ל" יזוהה כנפח
// ולא כמספר דגם.
const HEBREW_UNITS = [
  [/מ״ל|מ"ל|מ'ל/g, ' ml '],
  [/מ״ג|מ"ג/g, ' mg '],
  [/מ״מ|מ"מ/g, ' mm '],
  [/ס״מ|ס"מ/g, ' cm '],
  [/וואט/g, ' w '],
  [/אמפר/g, ' a '],
  [/אינץ'|אינץ/g, ' inch '],
  [/ליטר/g, ' l '],
];

// יחידות שמופיעות אחרי מספר. מספר שלפני יחידה הוא מפרט, לא דגם.
const UNIT_TOKENS = new Set([
  'ml',
  'l',
  'liter',
  'litre',
  'mg',
  'g',
  'kg',
  'mm',
  'cm',
  'm',
  'inch',
  'inches',
  'in',
  'ft',
  'w',
  'watt',
  'watts',
  'v',
  'volt',
  'volts',
  'a',
  'amp',
  'ah',
  'mah',
  'gb',
  'tb',
  'mb',
  'kb',
  'hz',
  'khz',
  'mhz',
  'ghz',
  'pcs',
  'pc',
  'pieces',
  'pack',
  'x',
  'k',
]);

// "אביזרים", "חלקי חילוף", "פילטרים": מוצר נלווה לאותו דגם, לא המוצר עצמו.
const ACCESSORY_PATTERN =
  /אביזר|חלקי|חילוף|חלפים|מסנן|פילטר|מטליות|סמרטוט|רפידות|תואם|מתאים ל|accessor|spare|replacement|filter|brush|pad/i;

// רק מהשם בעברית: שם המקור באנגלית מלא במילים כמו replacement/filter גם
// כשמדובר במכשיר עצמו.
function isAccessory(product) {
  return ACCESSORY_PATTERN.test(String((product && product.name) || ''));
}

function textOf(product) {
  let text = [product && product.name, product && product.sourceTitle, product && product.title]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  HEBREW_UNITS.forEach(([pattern, replacement]) => {
    text = text.replace(pattern, replacement);
  });

  return text;
}

function rawTokens(product) {
  return textOf(product).match(/[a-z]+|\d+/g) || [];
}

// מפתח התמונה של אליאקספרס: אותו מוצר שנשאב מכמה מוכרים מגיע עם אותה
// תמונה בדיוק, גם כששם המוצר שונה.
export function imageKey(product) {
  const url = String((product && product.image) || '');
  if (!url) return '';
  const base = url
    .split('/')
    .pop()
    .split('?')[0]
    .replace(/\.(jpe?g|png|webp|avif)$/i, '')
    .replace(/_\d+x\d+\.(jpe?g|png|webp|avif)$/i, '')
    .replace(/[-_]\d+x\d+$/i, '')
    .replace(/[-_](main|watermark|sale)$/i, '');
  return base.length > 12 ? base.toLowerCase() : '';
}

// המותג הצמוד למספר הדגם: \"VGR 353\", \"VGR V-353\", \"JONR P20 PRO\".
// מדלגים על אותיות בודדות (V, X, P) ועל מילים סתמיות, כדי שהמותג האמיתי
// יימצא. מחזיר '' כשאין מותג צמוד — ואז אין זיהוי לפי מספר בלבד.
const NEIGHBOR_STEPS = 2;

function neighborBrand(tokens, index, direction) {
  for (let step = 1; step <= NEIGHBOR_STEPS; step += 1) {
    const token = tokens[index + direction * step];
    if (!token) return '';
    if (/^\d+$/.test(token)) return '';
    if (!/^[a-z]+$/.test(token)) return '';
    // אות בודדת (V, X, P) שייכת למספר הדגם עצמו.
    if (token.length < 3) continue;
    return NOISE_TOKENS.has(token) ? '' : token;
  }
  return '';
}

// זוגות \"מותג:דגם\" מתוך השם: vgr:353, jonr:20. מוצר בלי זוג כזה לא
// מתמזג לפי מספר, ולכן \"20 יחידות\" לא מחבר מוצרים שונים.
export function modelKeys(product) {
  const tokens = rawTokens(product);
  const keys = new Set();

  tokens.forEach((token, index) => {
    if (!/^\d+$/.test(token)) return;
    if (token.length < 2 || token.length > 6) return;
    if (YEAR_TOKENS.has(token)) return;
    // "250 מ״ל" / "20W" — מפרט, לא דגם.
    if (UNIT_TOKENS.has(tokens[index + 1])) return;
    // 360° / 180° — זווית סיבוב, לא מספר דגם.
    if (token === '360' || token === '180') return;

    const before = neighborBrand(tokens, index, -1);
    const brand = before || neighborBrand(tokens, index, 1);
    if (brand) keys.add(`${brand}:${token}`);
  });

  return keys;
}

// ---------------------------------------------------------------------
// אותו מוצר אצל מוכרים שונים, עם כותרת כמעט זהה ותמונה אחרת.
// דוגמה אמיתית: "1/5M מארגן כבלים ניהול סרט לכריכת חוטים" מול
// "מארגן כבלים 1/3/5 מ' ניהול סרט לכריכת חוטים" — שני פרסומים של אותו
// גליל סקוטש, בשני מחירים. מיזוג כזה נעשה רק כשהחפיפה במילים גבוהה מאוד,
// כדי ששני מוצרים דומים-אבל-שונים בקטגוריה לא ייעלמו מהאתר.

// מילים שלא מלמדות על זהות המוצר: מידות, כמויות, צבעים ומילות שיווק.
const NAME_NOISE = new Set([
  'מ',
  'מטר',
  'מטרים',
  'סמ',
  'ממ',
  'אינץ',
  'מידות',
  'יחידות',
  'יחידה',
  'ערכת',
  'סט',
  'חדש',
  'חדשה',
  'מקורי',
  'מקורית',
  'איכותי',
  'איכותית',
  'מקצועי',
  'מקצועית',
  'פרימיום',
  'עם',
  'של',
  'ללא',
  'על',
  'אל',
  'את',
  'כדי',
  'יותר',
  'מאוד',
  'שחור',
  'שחורה',
  'לבן',
  'לבנה',
  'אפור',
  'אפורה',
  'כחול',
  'כחולה',
  'ירוק',
  'ירוקה',
  'אדום',
  'אדומה',
  'ורוד',
  'ורודה',
  'צהוב',
  'כתום',
  'סגול',
  'חום',
]);

/** מילות הזהות של השם בעברית (בלי מספרים, מידות וצבעים). */
function nameTokens(product) {
  // גם המילה הלטינית נשארת: היא כמעט תמיד המותג, והיא מה שמפריד בין
  // "בייבימוניטור Cdycam" ל"בייבימוניטור TakTark".
  const text = String((product && product.name) || '')
    .toLowerCase()
    .replace(/[^\u0590-\u05FFa-z0-9]+/g, ' ');

  const tokens = new Set();
  text.split(/\s+/).forEach((word) => {
    if (!word) return;
    // "x20" / "s10" / "vgr353": מספר דגם צמוד לאותיות הוא זהות, ולא מידה.
    if (/^[a-z]+\d+[a-z0-9]*$/.test(word) || /^\d+[a-z]+\d*$/.test(word)) {
      tokens.add(word);
      return;
    }
    if (/^[a-z]+$/.test(word)) {
      if (word.length >= 4 && !NAME_NOISE.has(word)) tokens.add(word);
      return;
    }
    if (/^\d+$/.test(word)) return;
    const clean = word.replace(/^(ו|ב|ל|מ|ה|ש|כ)/, '');
    if (clean.length < 3) return;
    if (NAME_NOISE.has(clean) || NAME_NOISE.has(word)) return;
    tokens.add(clean);
  });
  return tokens;
}

function overlapRatio(a, b) {
  if (a.size < 4 || b.size < 4) return 0;
  let shared = 0;
  a.forEach((token) => {
    if (b.has(token)) shared += 1;
  });
  return shared / (a.size + b.size - shared);
}

// סף גבוה: "מארגן כבלים" מול "מחזיק כבלים" לא מתמזגים, אבל כמעט אותה
// כותרת עם מידה אחרת — כן.
const SAME_NAME_RATIO = 0.72;

export function priceOf(product) {
  const value = Number(product && product.price);
  return Number.isFinite(value) && value > 0 ? value : Infinity;
}

export function ratingOf(product) {
  const value = Number(product && product.rating);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function reviewsOf(product) {
  if (!product) return 0;
  const value =
    product.reviews ?? product.reviewsCount ?? product.ratingsCount ?? product.ratingCount;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export function salesOf(product) {
  const value = Number(product && product.sales);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

// שלילי = a עדיף. הסדר: המחיר הזול ביותר, ואז הדירוג, ואז כמות הביקורות,
// ואז המכירות. עותק בלי מחיר (לפרטים) תמיד אחרון.
export function compareCopies(a, b) {
  const priceA = priceOf(a);
  const priceB = priceOf(b);
  if (priceA !== priceB) return priceA < priceB ? -1 : 1;

  const ratingA = ratingOf(a);
  const ratingB = ratingOf(b);
  if (ratingA !== ratingB) return ratingB - ratingA;

  const reviewsA = reviewsOf(a);
  const reviewsB = reviewsOf(b);
  if (reviewsA !== reviewsB) return reviewsB - reviewsA;

  return salesOf(b) - salesOf(a);
}

export function bestCopy(items) {
  return (items || []).slice().sort(compareCopies)[0] || null;
}

function idOf(product) {
  return String((product && (product.id || product.productId)) || '');
}

function uniqueUrls(list) {
  const seen = new Set();
  const urls = [];
  (list || []).forEach((url) => {
    const value = typeof url === 'string' ? url.trim() : '';
    if (!value || seen.has(value)) return;
    seen.add(value);
    urls.push(value);
  });
  return urls;
}

// מיזוג קבוצה: הזהות (id, slug, link, price) נשארת של העותק הזול ביותר,
// ושאר הנתונים הטובים ביותר נאספים מהקבוצה.
export function mergeCopies(items, maxGallery = 12) {
  if (!items || !items.length) return null;
  const winner = bestCopy(items);
  if (items.length === 1) return winner;

  const merged = { ...winner };

  merged.rating = Math.max(...items.map(ratingOf));
  merged.sales = Math.max(...items.map(salesOf));
  const reviews = Math.max(...items.map(reviewsOf));
  if (reviews > 0) merged.reviews = reviews;

  const gallery = uniqueUrls(
    items.flatMap((item) => [].concat(item.gallery || [], item.image || []))
  );
  merged.image = winner.image || gallery[0] || '';
  merged.gallery = gallery.filter((url) => url !== merged.image).slice(0, maxGallery);

  // מחיר מקורי גבוה יותר = אחוז הנחה גבוה יותר באותו מחיר מכירה.
  const originalPrices = items
    .map((item) => Number(item.originalPrice))
    .filter((value) => Number.isFinite(value) && value > Number(merged.price) && value > 0);
  if (originalPrices.length) merged.originalPrice = Math.max(...originalPrices);

  const video = items.find((item) => String(item.videoUrl || '').trim());
  if (!merged.videoUrl && video) merged.videoUrl = video.videoUrl;

  const mergedFrom = items.map(idOf).filter(Boolean);
  if (mergedFrom.length > 1) merged.mergedFrom = mergedFrom;
  merged.dedupeMergedAt = new Date().toISOString();

  return merged;
}

// קבוצות של אותו מוצר. כל קבוצה מחזיקה את מיקומי העותקים ברשימה המקורית,
// ואת העותק המוביל.
export function duplicateGroups(products) {
  const list = (products || []).filter(Boolean);
  const parent = list.map((_, index) => index);

  function find(index) {
    let current = index;
    while (parent[current] !== current) {
      parent[current] = parent[parent[current]];
      current = parent[current];
    }
    return current;
  }

  function union(a, b) {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootB] = rootA;
  }

  const byImage = new Map();
  const byModelKey = new Map();
  // אינדקס מילה → מוצרים, כדי להשוות רק למועמדים חולקים ולא לכל הרשימה.
  const byToken = new Map();

  list.forEach((product, index) => {
    const image = imageKey(product);
    if (image) {
      if (byImage.has(image)) union(index, byImage.get(image));
      else byImage.set(image, index);
    }

    // אותו זוג מותג:דגם (vgr:353) = אותו מוצר, גם בתמונה ובכותרת אחרות.
    // אביזר לא מתמזג עם המוצר עצמו ("חלקי חילוף ל-JONR P20" ≠ השואב).
    modelKeys(product).forEach((key) => {
      const other = byModelKey.get(key);
      if (other == null) {
        byModelKey.set(key, index);
        return;
      }
      if (isAccessory(product) !== isAccessory(list[other])) return;
      union(index, other);
    });

    // כותרת כמעט זהה = אותו מוצר, גם כשהתמונה שונה (מוכר אחר).
    const tokens = nameTokens(product);
    if (tokens.size < 4) return;

    const candidates = new Set();
    tokens.forEach((token) => {
      const bucket = byToken.get(token);
      if (bucket) bucket.slice(-60).forEach((other) => candidates.add(other));
    });

    candidates.forEach((other) => {
      if (other === index) return;
      if (isAccessory(product) !== isAccessory(list[other])) return;
      if (overlapRatio(tokens, nameTokens(list[other])) < SAME_NAME_RATIO) return;
      union(index, other);
    });

    tokens.forEach((token) => {
      if (!byToken.has(token)) byToken.set(token, []);
      byToken.get(token).push(index);
    });
  });

  const groups = new Map();
  list.forEach((product, index) => {
    const root = find(index);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(index);
  });

  return [...groups.values()]
    .map((indices) => {
      const items = indices.map((index) => list[index]);
      return {
        indices,
        items,
        winner: bestCopy(items),
        duplicate: indices.length > 1,
      };
    })
    .sort((a, b) => b.items.length - a.items.length || a.indices[0] - b.indices[0]);
}

// הרשימה שמוצגת באתר: עותק אחד לכל מוצר, כבר עם הנתונים הטובים של כולם.
export function dedupeProducts(products) {
  const list = (products || []).filter(Boolean);
  const merged = new Map();
  const drop = new Set();

  duplicateGroups(list).forEach((group) => {
    if (!group.duplicate) return;
    const [first, ...rest] = group.indices;
    merged.set(first, mergeCopies(group.items));
    rest.forEach((index) => drop.add(index));
  });

  const result = [];
  list.forEach((product, index) => {
    if (merged.has(index)) result.push(merged.get(index));
    else if (!drop.has(index)) result.push(product);
  });
  return result;
}
