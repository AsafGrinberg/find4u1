// lib/products.js
import { db } from '../firebase/firebase-config'; // נתיב יחסית ל-lib/products.js
import { collection, getDocs } from 'firebase/firestore';

export async function fetchProducts() {
  try {
    const productsCol = collection(db, 'products');
    const productSnapshot = await getDocs(productsCol);

    const products = productSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    console.log("Products loaded from Firestore:", products.length, "products.");
    return products;
  } catch (error) {
    console.error("Error fetching products:", error);
    return [];
  }
}
