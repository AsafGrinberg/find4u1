// products.module.js
// ייבוא DB מ-firebase-config.js
import { db } from '../firebase/firebase-config.js';

import {
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  startAfter
} from 'firebase/firestore';

let products = []; 
// lib/products.module.js

export async function fetchProducts({ limitCount = 20, lastDoc = null } = {}) {
  try {
    const productsCol = collection(db, 'products');

    let q;

    if (lastDoc) {
      // אין מיון לפי טיימסטמפ - בדיקה פשוטה
      q = query(productsCol, startAfter(lastDoc), limit(limitCount));
    } else {
      q = query(productsCol, limit(limitCount));
    }

    const snap = await getDocs(q);
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    return {
      products: data,
      lastVisible: snap.docs[snap.docs.length - 1] || null,
    };
  } catch (err) {
    console.error('Error fetching products:', err);
    return { products: [], lastVisible: null };
  }
}
