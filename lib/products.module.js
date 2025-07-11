// products.module.js
// ייבוא DB מ-firebase-config.js
import { db } from '../firebase/firebase-config.js';

import { collection, getDocs } from 'firebase/firestore';

let products = []; 

export async function fetchProducts() {
    try {
        // אין צורך ב-getFirestore() שוב כאן, db כבר יובא
        const productsCol = collection(db, "products");
        const productSnapshot = await getDocs(productsCol);

        products = productSnapshot.docs.map(doc => ({
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