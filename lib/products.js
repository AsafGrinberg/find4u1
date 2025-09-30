//lib/products.js
import { db } from '../firebase/firebase-config.js';
import { 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  query, 
  orderBy, 
  limit, 
  startAfter,
  increment,
  updateDoc,
  deleteDoc,
  getDoc
} from 'firebase/firestore';
import { Timestamp } from 'firebase/firestore';

// פונקציות עזר
function getCategory(title) {
  if (!title) return "אחר";
  const lower = title.toLowerCase();
  if (lower.includes("watch")) return "שעונים";
  if (lower.includes("earbuds") || lower.includes("headphone")) return "אוזניות";
  if (lower.includes("lamp")) return "תאורה";
  return "אחר";
}

// שמירת מוצר מאלי אקספרס עם source
export async function saveAliExpressProduct(product) {
  const id = product.item_id || product.product_id;
  if (!id) return false;

  try {
    const productRef = doc(db, 'products', id.toString());
    await setDoc(productRef, {
      title: product.title,
      image: product.image_url || product.product_main_image_url,
      price: product.price || 0,
      category: getCategory(product.title),
      link: product.detail_url || `https://www.aliexpress.com/item/${id}.html`,
      addedAt: Timestamp.fromDate(new Date()),
      source: 'aliexpress',
      likesCount: 0
    });
    console.log(`✅ מוצר נשמר: ${product.title}`);
    return true;
  } catch (error) {
    console.error('שגיאה בשמירת מוצר:', error);
    return false;
  }
}


// משיכת מוצרים עם מיון ידני ראשונה לפי source ו־addedAt
export async function fetchProducts({ limitCount = 20, lastDoc = null } = {}) {
  try {
    const productsCol = collection(db, 'products');
    let q = query(productsCol, orderBy('addedAt', 'desc'), limit(limitCount));

    if (lastDoc) {
      q = query(q, startAfter(lastDoc));
    }

    const snapshot = await getDocs(q);
    const products = snapshot.docs.map(doc => {
      const data = doc.data();
      // איחוד שדות שם מוצר: אם יש name ואין title, נשתמש ב-name כ-title
      const title = data.title || data.name || '';
      return {
        id: doc.id,
        title,
        name: data.name || title,
        image: data.image || '',
        price: data.price || 0,
        source: data.source || 'manual',  // ברירת מחדל למוצר ידני
        addedAt: data.addedAt?.toDate ? data.addedAt.toDate() : new Date(),
        category: data.category || 'אחר',
        showOnHome: data.showOnHome ?? true, // ברירת מחדל true
        link: data.link || '',
        likesCount: data.likesCount || 0
      };
    });

    // מיון לפי source (manual לפני ali)
    products.sort((a, b) => {
      if (a.source === 'manual' && b.source !== 'manual') return -1;
      if (a.source !== 'manual' && b.source === 'manual') return 1;
      return b.addedAt.getTime() - a.addedAt.getTime(); // ✅ חדש → ישן
    });

    return {
      products,
      lastVisible: snapshot.docs[snapshot.docs.length - 1] || null
    };
  } catch (error) {
    console.error("שגיאה בטעינת מוצרים:", error);
    return { products: [], lastVisible: null };
  }
}


// ניהול לייקים
export async function toggleLike(productId, userId) {
  if (!productId || !userId) return false;

  const userLikeRef = doc(db, 'users', userId, 'likedProducts', productId);
  const productRef = doc(db, 'products', productId);

  try {
    const liked = await getDoc(userLikeRef);
    
    if (liked.exists()) {
      await deleteDoc(userLikeRef);
      await updateDoc(productRef, { likesCount: increment(-1) });
      return false; // ביטול לייק
    } else {
      await setDoc(userLikeRef, { timestamp: new Date() });
      await updateDoc(productRef, { likesCount: increment(1) });
      return true; // הוספת לייק
    }
  } catch (error) {
    console.error("שגיאה בניהול לייק:", error);
    return false;
  }
}
