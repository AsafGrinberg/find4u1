// lib/urls.js
// כל מוצר מקבל כתובת קריאה בעברית. מוצרים ותיקים בלי slug מקבלים כתובת
// שנגזרת מהשם שלהם, כך שאף קישור לא נשבר.

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

export function categoryHref(name) {
  return `/category?cat=${encodeURIComponent(name)}`;
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
