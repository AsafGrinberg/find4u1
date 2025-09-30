// lib/hot-products.js
import { db, collection, query, where, orderBy, limit, getDocs } from '../firebase/firebase-config.js';

// Returns the latest hot products from Firestore
export async function getHotProducts(max = 10) {
  try {
    const productsRef = collection(db, 'products');
    const q = query(
      productsRef,
      where('showOnHome', '==', true),
      orderBy('addedAt', 'desc'),
      limit(max)
    );

    const snapshot = await getDocs(q);
    const products = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        title: data.title || data.name || '',
        image: data.image || '',
        price: data.price || 0,
        sales: data.sales || null,
        link: data.link || '',
        addedAt: data.addedAt?.toDate ? data.addedAt.toDate() : new Date(),
      };
    });

    return products;
  } catch (error) {
    console.error('Error fetching hot products:', error);
    return [];
  }
}


