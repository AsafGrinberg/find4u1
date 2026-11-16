// lib/urls.js
// מוצר מקבל כתובת קריאה כשיש לו slug, ואחרת נשאר עם מזהה המסמך.

export function productHref(product) {
  if (!product) return '/';
  const key = product.slug || product.id;
  return `/product/${encodeURIComponent(key)}`;
}

export function categoryHref(name) {
  return `/category?cat=${encodeURIComponent(name)}`;
}

export function findProductByParam(products, param) {
  if (!param) return null;
  const key = decodeURIComponent(String(param));
  return (
    products.find((item) => item.slug === key) ||
    products.find((item) => item.id === key) ||
    null
  );
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
