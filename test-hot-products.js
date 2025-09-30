// test-hot-products.js
import fetch from 'node-fetch';

async function testHotProductsAPI() {
  try {
    console.log('🧪 Testing Hot Products API...');
    
    // Test the hot products API
    const response = await fetch('http://localhost:3000/api/hot-products?limit=3');
    
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }
    
    const products = await response.json();
    
    console.log(`✅ Successfully fetched ${products.length} hot products`);
    
    products.forEach((product, index) => {
      console.log(`\n📦 Product ${index + 1}:`);
      console.log(`   ID: ${product.id}`);
      console.log(`   Title: ${product.title}`);
      console.log(`   Price: ${product.price}`);
      console.log(`   Sales: ${product.sales} units`);
      console.log(`   Shop: ${product.shopName}`);
      console.log(`   Rating: ${product.evaluateRate}`);
      console.log(`   Gallery images: ${product.gallery?.length || 0}`);
      console.log(`   Description length: ${product.description?.length || 0} characters`);
    });
    
    return products;
    
  } catch (error) {
    console.error('❌ Error testing hot products API:', error.message);
    return null;
  }
}

// Run the test
testHotProductsAPI();
