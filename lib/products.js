// lib/products.js
import { db } from '../firebase/firebase-config';
import { collection, doc, setDoc, getDocs } from 'firebase/firestore';


function getCategory(title) {
  const lower = title.toLowerCase();
  if (lower.includes("watch")) return "שעונים";
  if (lower.includes("earbuds") || lower.includes("headphone")) return "אוזניות";
  if (lower.includes("lamp")) return "תאורה";
  return "אחר";
}

export async function saveAliExpressProduct(product) {
  if (!product || !product.item_id) return;

  const productRef = doc(collection(db, 'products'), product.item_id.toString());

  const dataToSave = {
    title: product.title,
    image: product.image_url,
    price: product.price?.current || '',
    category: getCategory(product.title),
    link: product.detail_url,
    addedAt: Date.now(),
  };

  try {
    await setDoc(productRef, dataToSave);
    console.log(`✅ מוצר נשמר ב-Firestore: ${product.title}`);
  } catch (error) {
    console.error('Error saving product:', error);
  }
}


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
