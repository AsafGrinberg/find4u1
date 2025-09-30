import 'dotenv/config';

const PRODUCT_ID = "1005007870885952";

async function fetchAliProduct() {
  try {
    const res = await fetch(`http://localhost:3000/api/aliexpress?productId=${PRODUCT_ID}`);
    const data = await res.json();

    console.log("=== כל הנתונים מה-API ===");
    console.log(JSON.stringify(data, null, 2));

    console.log("Main image:", data.product_main_image_url);
    console.log("Gallery images:", data.product_gallery_images);
  } catch (err) {
    console.error("Error fetching product:", err);
  }
}

fetchAliProduct();
