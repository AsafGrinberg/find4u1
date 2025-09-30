// lib/aliexpress.js
export async function fetchAliExpressProducts(keyword = "shoes", limit = 5) {
  try {
    const res = await fetch(`http://localhost:3000/api/aliexpress?keyword=${encodeURIComponent(keyword)}&limit=${limit}`);
    const data = await res.json();
    console.log("AliExpress API data:", data); // הדפסה של כל הנתונים

    return (Array.isArray(data) ? data : []).map(p => ({
      item_id: p.id,                       // כדי ש-sync יזהה
      title: p.title || '',
      image: p.image || '',
      gallery: Array.isArray(p.gallery) ? p.gallery : [],
      price: parseFloat(p.price?.replace(' ₪', '')) || 0,
      detail_url: p.affiliateUrl || '',    // שימוש בשם הנכון ל-sync
      description: p.description || '',
      brand: p.brand || '',
      stock: p.stock || 1,
      sales: p.sales || 0,
      shopName: p.shopName || '',
      evaluateRate: p.evaluateRate || '0%'
    }));

  } catch (err) {
    console.error("Failed to fetch products:", err);
    return [];
  }
}
