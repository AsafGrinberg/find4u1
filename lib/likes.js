// lib/likes.js
// שמירת מוצרים לאורחים בלי התחברות. משתמש מחובר ממשיך לעבוד מול Firestore.

const KEY = 'find4u_liked_products';

function canUseStorage() {
  return typeof window !== 'undefined' && !!window.localStorage;
}

export function readGuestLikes() {
  if (!canUseStorage()) return new Set();
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function writeGuestLikes(set) {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify([...set]));
    window.dispatchEvent(new Event('find4u-likes-changed'));
  } catch {
    // אחסון חסום (מצב פרטי) - פשוט לא נשמור
  }
}

export function toggleGuestLike(productId) {
  const set = readGuestLikes();
  if (set.has(productId)) {
    set.delete(productId);
  } else {
    set.add(productId);
  }
  writeGuestLikes(set);
  return set;
}

export function clearGuestLikes() {
  writeGuestLikes(new Set());
}
