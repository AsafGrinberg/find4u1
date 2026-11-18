// lib/urls.js
// כל מוצר מקבל כתובת קריאה בעברית. מוצרים ותיקים בלי slug מקבלים כתובת
// שנגזרת מהשם שלהם, כך שאף קישור לא נשבר.

export const SITE_URL = 'https://find4u.vercel.app';

export const ALL_PRODUCTS = 'כל המוצרים';

const ID_TAIL_LENGTH = 6;

export function slugify(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[‎‏]/g, '')
    .replace(/[^0-9a-z\u0590-\u05FF\u05BE\u05C0\u05C3]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function idTail(product) {
  const raw = String(product.productId || product.id || '');
  const digits = raw.replace(/\D/g, '');
  const source = digits.length >= ID_TAIL_LENGTH ? digits : raw;
  return slugify(source).replace(/-/g, '').slice(-ID_TAIL_LENGTH);
}

export function productSlug(product) {
  if (!product) return '';
  if (product.slug) return product.slug;

  const name = slugify(product.name).slice(0, 64).replace(/-+$/g, '');
  const tail = idTail(product);

  if (!name) return tail || String(product.id || '');
  return tail ? `${name}-${tail}` : name;
}

export function productHref(product) {
  if (!product) return '/';
  const key = productSlug(product);
  return `/product/${encodeURIComponent(key)}`;
}

export function productUrl(product) {
  return `${SITE_URL}${productHref(product)}`;
}

// קטגוריה מקבלת נתיב אמיתי משלה, כדי שלכל קטגוריה יהיה דף לאינדוקס.
export function categorySlug(name) {
  return slugify(name) || 'category';
}

export function categoryHref(name) {
  if (!name || name === ALL_PRODUCTS) return '/';
  return `/category/${encodeURIComponent(categorySlug(name))}`;
}

// חלק מהקטגוריות נשאבו מאליאקספרס באנגלית. מתרגמים אותן לתצוגה בעברית
// בלי לשנות את הנתיב, כדי לא לשבור קישורים קיימים.
const CATEGORY_HEBREW = {
  'smart electronics': 'אלקטרוניקה חכמה',
  'fashion jewelry': 'תכשיטי אופנה',
  'consumer electronics': 'אלקטרוניקה',
  'computer & office': 'מחשבים ומשרד',
  'phones & telecommunications': 'סלולר ותקשורת',
  'home & garden': 'בית וגינה',
  'home improvement': 'שיפוץ הבית',
  'home appliances': 'מכשירי חשמל לבית',
  'mother & kids': 'אמא וילדים',
  'sports & entertainment': 'ספורט ופנאי',
  'automobiles & motorcycles': 'רכב ואופנועים',
  'beauty & health': 'יופי ובריאות',
  'weddings & events': 'חתונות ואירועים',
  'jewelry & accessories': 'תכשיטים ואביזרים',
  'apparel accessories': 'אביזרי אופנה',
  "women's clothing": 'בגדי נשים',
  "men's clothing": 'בגדי גברים',
  'bags & shoes': 'תיקים ונעליים',
  'shoes': 'נעליים',
  'bags': 'תיקים',
  'watches': 'שעונים',
  'lights & lighting': 'תאורה',
  'furniture': 'רהיטים',
  'kitchen, dining & bar': 'מטבח ופינת אוכל',
  'tools': 'כלים',
  'makeup': 'איפור',
  'skin care': 'טיפוח העור',
  'hair care': 'טיפוח השיער',
  'oral hygiene': 'היגיינת הפה',
  'pet products': 'מוצרים לחיות מחמד',
  'toys & hobbies': 'צעצועים ותחביבים',
  'toys': 'צעצועים',
  'baby': 'תינוקות',
  'office & school supplies': 'ציוד משרדי',
  'security & protection': 'אבטחה ומיגון',
  'garden supplies': 'ציוד גינון',
  'fishing': 'דיג',
  'motorcycle accessories': 'אביזרים לאופנוע',
  'car repair & maintenance': 'תחזוקת רכב',
  'sports shoes': 'נעלי ספורט',
  'home decor': 'עיצוב הבית',
};

export function categoryLabel(name) {
  if (!name) return '';
  const key = String(name).trim().toLowerCase();
  return CATEGORY_HEBREW[key] || String(name).trim();
}

export function categoryNameFromSlug(slug, names) {
  if (!slug) return null;
  const key = decodeURIComponent(String(slug));
  return (
    (names || []).find((name) => categorySlug(name) === key) || null
  );
}

export function categoriesOf(product) {
  if (!product) return [];
  const value = product.categories ?? product.category;
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

// כל שמות הקטגוריות: אלה שנשמרו ב-Firestore יחד עם אלה שמופיעות על מוצרים.
export function collectCategoryNames(categories = [], products = []) {
  const names = [];
  (categories || []).forEach((item) => {
    const name = typeof item === 'string' ? item : item && item.name;
    if (name && !names.includes(name)) names.push(name);
  });
  (products || []).forEach((product) => {
    categoriesOf(product).forEach((name) => {
      if (name && !names.includes(name)) names.push(name);
    });
  });
  return names;
}

export function findProductByParam(products, param) {
  if (!param) return null;
  const key = decodeURIComponent(String(param));
  return (
    (products || []).find((item) => item.slug === key) ||
    (products || []).find((item) => item.id === key) ||
    (products || []).find((item) => productSlug(item) === key) ||
    null
  );
}

// מסנן אותו דגם שהופיע מכמה מוכרים שונים.
export function dedupeProducts(products) {
  const seen = new Set();
  const result = [];

  (products || []).forEach((product) => {
    const key = slugify(`${product.name || ''}`).slice(0, 42);
    if (!key) {
      result.push(product);
      return;
    }
    if (seen.has(key)) return;
    seen.add(key);
    result.push(product);
  });

  return result;
}

export function formatPrice(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return number.toLocaleString('he-IL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function discountOf(product) {
  if (!product) return null;
  const price = Number(product.price);
  const original = Number(product.originalPrice);
  if (Number.isFinite(product.discountPercent) && product.discountPercent > 0) {
    return Math.round(product.discountPercent);
  }
  if (Number.isFinite(price) && Number.isFinite(original) && original > price) {
    return Math.round(((original - price) / original) * 100);
  }
  return null;
}

export function createdAtValue(product) {
  const value = product.createdAt || product.updatedAt;
  if (!value) return 0;
  if (typeof value === 'string') return new Date(value).getTime() || 0;
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return 0;
}

// המחיר ירד מאז שהמוצר נשמר אצל הבוט.
export function priceDropped(product) {
  const price = Number(product && product.price);
  const previous = Number(product && product.previousPrice);
  return Number.isFinite(price) && Number.isFinite(previous) && previous > price;
}

// ---- מיון וסינון -------------------------------------------------------

export const SORT_OPTIONS = [
  { value: 'newest', label: 'החדשים ביותר' },
  { value: 'price-asc', label: 'מחיר: מהזול ליקר' },
  { value: 'price-desc', label: 'מחיר: מהיקר לזול' },
  { value: 'discount', label: 'אחוז ההנחה הגבוה' },
  { value: 'rating', label: 'הדירוג הגבוה' },
  { value: 'bestsellers', label: 'הנמכרים ביותר' },
];

export const FILTER_OPTIONS = [
  { value: 'all', label: 'הכל' },
  { value: 'deal', label: 'במבצע בלבד' },
  { value: 'under50', label: 'עד 50 ₪' },
  { value: 'under100', label: 'עד 100 ₪' },
  { value: 'rating45', label: 'דירוג 4.5+' },
];

function priceValue(product) {
  const value = Number(product && product.price);
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

export function sortProducts(products, sortKey) {
  const list = [...(products || [])];

  switch (sortKey) {
    case 'price-asc':
      return list.sort((a, b) => priceValue(a) - priceValue(b));
    case 'price-desc':
      return list.sort((a, b) => priceValue(b) - priceValue(a));
    case 'discount':
      return list.sort(
        (a, b) => (discountOf(b) || 0) - (discountOf(a) || 0)
      );
    case 'rating':
      return list.sort(
        (a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0)
      );
    case 'bestsellers':
      return list.sort(
        (a, b) => (Number(b.sales) || 0) - (Number(a.sales) || 0)
      );
    case 'newest':
    default:
      return list.sort((a, b) => createdAtValue(b) - createdAtValue(a));
  }
}

export function filterProducts(products, filterKey) {
  const list = products || [];
  switch (filterKey) {
    case 'deal':
      return list.filter((product) => (discountOf(product) || 0) > 0);
    case 'under50':
      return list.filter((product) => Number(product.price) > 0 && Number(product.price) <= 50);
    case 'under100':
      return list.filter((product) => Number(product.price) > 0 && Number(product.price) <= 100);
    case 'rating45':
      return list.filter((product) => Number(product.rating) >= 4.5);
    case 'all':
    default:
      return list;
  }
}
