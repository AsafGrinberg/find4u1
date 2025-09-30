import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';

/**
 * מחלץ מידע על מוצר מקישור AliExpress Affiliate - גרסה מקצועית
 * @param {string} affiliateUrl - קישור האפיליאייט של AliExpress
 * @returns {Object} מידע על המוצר
 */
export async function extractAliExpressProductData(affiliateUrl) {
  try {
    console.log('🚀 מתחיל לחלץ מידע מקישור:', affiliateUrl);
    
    // ראשית, נקבל את הקישור האמיתי של המוצר
    const realProductUrl = await getRealProductUrl(affiliateUrl);
    console.log('✅ קישור המוצר האמיתי:', realProductUrl);
    
    // נקבל את דף המוצר עם headers מתקדמים
    const response = await axios.get(realProductUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,he;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Cache-Control': 'max-age=0'
      },
      timeout: 30000,
      maxRedirects: 5
    });

    console.log('📄 דף המוצר נטען בהצלחה');
    const $ = cheerio.load(response.data);
    
    // נחלץ את המידע הבסיסי
    const productData = {
      title: '',
      description: '',
      price: '',
      originalPrice: '',
      discount: '',
      images: [],
      affiliateUrl: affiliateUrl,
      source: 'aliexpress',
      showOnHome: true,
      category: 'electronics',
      smartCopy: ''
    };

    // חילוץ שם המוצר - ננסה מספר שיטות
    const titleSelectors = [
      'h1[data-pl="product-title"]',
      '.product-title-text',
      'h1.product-title',
      '.pdp-product-name',
      'h1[class*="title"]',
      '.product-title',
      'h1',
      '[data-pl="product-title"]'
    ];
    
    for (const selector of titleSelectors) {
      const titleElement = $(selector).first();
      if (titleElement.length) {
        const title = titleElement.text().trim();
        if (title && title.length > 0 && title.length < 200) {
          productData.title = title;
          console.log('✅ שם המוצר נמצא:', title);
          break;
        }
      }
    }

    // אם לא מצאנו שם, ננסה לחפש ב-JSON-LD
    if (!productData.title) {
      const jsonLdScripts = $('script[type="application/ld+json"]');
      jsonLdScripts.each((i, script) => {
        try {
          const jsonData = JSON.parse($(script).html());
          if (jsonData.name && !productData.title) {
            productData.title = jsonData.name;
            console.log('✅ שם המוצר נמצא ב-JSON-LD:', jsonData.name);
          }
        } catch (e) {
          // ignore
        }
      });
    }

    // חילוץ מחיר - ננסה מספר שיטות
    const priceSelectors = [
      '.notranslate[data-pl="product-price"]',
      '.product-price-value',
      '.price-current',
      '.price-now',
      '.price-current .notranslate',
      '.product-price .notranslate',
      '[data-pl="product-price"]',
      '.price-current',
      '.price-now',
      '.product-price-value'
    ];
    
    for (const selector of priceSelectors) {
      const priceElement = $(selector).first();
      if (priceElement.length) {
        const price = priceElement.text().trim();
        if (price && (price.includes('₪') || price.includes('$') || price.includes('€') || /\d/.test(price))) {
          productData.price = price;
          console.log('✅ מחיר נמצא:', price);
          break;
        }
      }
    }

    // חילוץ מחיר מקורי
    const originalPriceSelectors = [
      '.price-original',
      '.price-before',
      '.price-was',
      '.price-original .notranslate',
      '.price-before .notranslate',
      '.price-was .notranslate'
    ];
    
    for (const selector of originalPriceSelectors) {
      const originalPriceElement = $(selector).first();
      if (originalPriceElement.length) {
        const originalPrice = originalPriceElement.text().trim();
        if (originalPrice && (originalPrice.includes('₪') || originalPrice.includes('$') || originalPrice.includes('€'))) {
          productData.originalPrice = originalPrice;
          console.log('✅ מחיר מקורי נמצא:', originalPrice);
          break;
        }
      }
    }

    // חילוץ אחוז הנחה
    const discountSelectors = [
      '.discount-percentage',
      '.sale-percentage',
      '.off-percentage',
      '.discount-percent',
      '.sale-percent',
      '.off-percent'
    ];
    
    for (const selector of discountSelectors) {
      const discountElement = $(selector).first();
      if (discountElement.length) {
        const discount = discountElement.text().trim();
        if (discount && discount.includes('%')) {
          productData.discount = discount;
          console.log('✅ אחוז הנחה נמצא:', discount);
          break;
        }
      }
    }

    // חילוץ תמונות - ננסה מספר שיטות
    const imageSelectors = [
      '.images-view-item img',
      '.product-image img',
      '.gallery-image img',
      '.main-image img',
      '.images-view img',
      '.product-gallery img',
      '.gallery img',
      '.product-images img'
    ];
    
    for (const selector of imageSelectors) {
      $(selector).each((i, img) => {
        const src = $(img).attr('src') || $(img).attr('data-src') || $(img).attr('data-lazy');
        if (src && src.startsWith('http') && !src.includes('placeholder') && !src.includes('loading')) {
          // נוודא שהתמונה לא קיימת כבר ברשימה
          if (!productData.images.includes(src)) {
            productData.images.push(src);
          }
        }
      });
    }

    // אם לא מצאנו תמונות, ננסה לחפש ב-JSON-LD
    if (productData.images.length === 0) {
      const jsonLdScripts = $('script[type="application/ld+json"]');
      jsonLdScripts.each((i, script) => {
        try {
          const jsonData = JSON.parse($(script).html());
          if (jsonData.image && Array.isArray(jsonData.image)) {
            productData.images = jsonData.image.slice(0, 5);
            console.log('✅ תמונות נמצאו ב-JSON-LD:', productData.images.length);
          } else if (jsonData.image && typeof jsonData.image === 'string') {
            productData.images = [jsonData.image];
            console.log('✅ תמונה נמצאה ב-JSON-LD:', jsonData.image);
          }
        } catch (e) {
          // ignore
        }
      });
    }

    // חילוץ תיאור המוצר
    const descriptionSelectors = [
      '.product-description',
      '.detail-desc',
      '.product-detail-desc',
      '.description-content',
      '.product-description-content',
      '.detail-description'
    ];
    
    for (const selector of descriptionSelectors) {
      const descElement = $(selector).first();
      if (descElement.length) {
        const desc = descElement.text().trim();
        if (desc && desc.length > 50) {
          productData.description = desc.substring(0, 500) + '...';
          console.log('✅ תיאור נמצא:', desc.substring(0, 100) + '...');
          break;
        }
      }
    }

    // אם לא מצאנו תיאור, ניצור אחד בסיסי
    if (!productData.description) {
      productData.description = `מוצר איכותי מ-AliExpress: ${productData.title}`;
    }

    // ניצור Smart Short Copy
    productData.smartCopy = generateSmartShortCopy(productData);

    console.log('🎉 מידע על המוצר שחולץ:', {
      title: productData.title,
      price: productData.price,
      images: productData.images.length,
      description: productData.description.substring(0, 100) + '...'
    });

    return productData;

  } catch (error) {
    console.error('❌ שגיאה בחילוץ מידע על המוצר:', error);
    throw new Error(`לא ניתן לחלץ מידע מהקישור: ${error.message}`);
  }
}

/**
 * מקבל את הקישור האמיתי של המוצר מקישור האפיליאייט
 * @param {string} affiliateUrl - קישור האפיליאייט
 * @returns {string} קישור המוצר האמיתי
 */
async function getRealProductUrl(affiliateUrl) {
  try {
    const response = await axios.get(affiliateUrl, {
      maxRedirects: 0,
      validateStatus: function (status) {
        return status >= 200 && status < 400;
      },
      timeout: 10000
    });
    
    // אם יש redirect, נקבל את הקישור החדש
    if (response.headers.location) {
      return response.headers.location;
    }
    
    return affiliateUrl;
  } catch (error) {
    // אם יש שגיאה, נחזיר את הקישור המקורי
    console.log('⚠️ לא ניתן לקבל קישור אמיתי, משתמש בקישור המקורי');
    return affiliateUrl;
  }
}

/**
 * יוצר Smart Short Copy למוצר
 * @param {Object} productData - מידע על המוצר
 * @returns {string} Smart Short Copy
 */
export function generateSmartShortCopy(productData) {
  const features = [];
  
  // נוסיף תכונות בסיסיות לפי שם המוצר
  if (productData.title.toLowerCase().includes('robot') || productData.title.toLowerCase().includes('vacuum')) {
    features.push('🤖 ניקוי אוטומטי חכם');
    features.push('🔋 סוללה ארוכת טווח');
    features.push('🔇 פעולה שקטה');
    features.push('🏠 מתאים לכל סוגי הרצפות');
  } else if (productData.title.toLowerCase().includes('phone') || productData.title.toLowerCase().includes('mobile')) {
    features.push('📱 טכנולוגיה מתקדמת');
    features.push('🔋 סוללה חזקה');
    features.push('📸 מצלמה איכותית');
    features.push('💨 ביצועים מהירים');
  } else if (productData.title.toLowerCase().includes('watch') || productData.title.toLowerCase().includes('smart')) {
    features.push('⌚ עיצוב מודרני');
    features.push('🔋 סוללה ארוכת טווח');
    features.push('📊 מעקב בריאות');
    features.push('💧 עמיד למים');
  } else if (productData.title.toLowerCase().includes('headphone') || productData.title.toLowerCase().includes('earphone')) {
    features.push('🎵 איכות סאונד מעולה');
    features.push('🔋 סוללה ארוכת טווח');
    features.push('🔇 ביטול רעשים');
    features.push('💎 עיצוב נוח');
  } else if (productData.title.toLowerCase().includes('camera') || productData.title.toLowerCase().includes('lens')) {
    features.push('📸 איכות תמונה גבוהה');
    features.push('🔋 סוללה חזקה');
    features.push('📱 חיבור לסמארטפון');
    features.push('💎 עיצוב מקצועי');
  } else {
    features.push('✨ איכות גבוהה');
    features.push('🚀 ביצועים מעולים');
    features.push('💎 עיצוב מודרני');
    features.push('🎯 מתאים לכל הצרכים');
  }

  let smartCopy = `מוצר איכותי מ-AliExpress\n${productData.title}\n\n`;
  
  features.forEach(feature => {
    smartCopy += `${feature}\n`;
  });

  if (productData.price) {
    smartCopy += `\n💰 מחיר עכשיו: ${productData.price}`;
  }
  
  if (productData.originalPrice && productData.discount) {
    smartCopy += ` (במקור ${productData.originalPrice}, ${productData.discount} הנחה)`;
  }

  return smartCopy;
}

/**
 * מוריד תמונות ומעלה אותן לשרת
 * @param {Array} imageUrls - רשימת קישורי תמונות
 * @param {string} productId - מזהה המוצר
 * @returns {Array} רשימת נתיבי התמונות החדשות
 */
export async function downloadAndSaveImages(imageUrls, productId) {
  const savedImages = [];
  
  for (let i = 0; i < Math.min(imageUrls.length, 5); i++) {
    try {
      const imageUrl = imageUrls[i];
      console.log(`📥 מוריד תמונה ${i + 1}:`, imageUrl);
      
      const response = await axios.get(imageUrl, {
        responseType: 'stream',
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      
      const filename = `${productId}_${i + 1}.jpg`;
      const filepath = path.join(process.cwd(), 'public', 'assets', 'images', filename);
      
      // נוודא שהתיקייה קיימת
      const dir = path.dirname(filepath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      const writer = fs.createWriteStream(filepath);
      response.data.pipe(writer);
      
      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });
      
      savedImages.push(`/assets/images/${filename}`);
      console.log(`✅ תמונה נשמרה: ${filename}`);
      
    } catch (error) {
      console.error(`❌ שגיאה בהורדת תמונה ${i + 1}:`, error.message);
    }
  }
  
  return savedImages;
}