import { fetchAliExpressProducts } from '../lib/aliexpress.js';
import { saveAliExpressProduct } from '../lib/products.js';

const categories = ['electronics', 'watches', 'earbuds', 'lamp'];

async function run() {
  for (const cat of categories) {
    console.log(`🔹 Fetching category: ${cat}`);
    const items = await fetchAliExpressProducts(cat, 2);

    if (!items || items.length === 0) {
      console.log(`⚠️ לא נמצאו מוצרים עבור קטגוריה: ${cat}`);
      continue;
    }

    console.log(`נמצאו ${items.length} מוצרים בקטגוריה: ${cat}`);
    for (const item of items) {
      console.log("DEBUG item:", item);  // 👈 הדפס את כל האובייקט
      await saveAliExpressProduct(item);
    }
  }
  console.log("✅ העלאת מוצרים מאלי אקספרס הסתיימה");
}

run();
