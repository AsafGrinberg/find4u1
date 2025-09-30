// pages/api/ali-images-by-link.js
import { fetchAliExpressProductById } from '../../lib/aliexpress-api';

export async function extractProductIdFromUrl(url) {
  console.log('[extractProductIdFromUrl] input url:', url);
  try {
    let candidate = url;
    if (url.includes('s.click.aliexpress.com')) {
      // נסה לבצע רידיירקט ולחלץ מזהה מה-Location
      try {
        const resp = await fetch(url, { method: 'HEAD', redirect: 'manual' });
        const location = resp.headers.get('location');
        if (location) {
          candidate = location;
        } else {
          // אם אין Location, נבצע GET מלא ונחפש מזהה מתוך ה-HTML
          const htmlResp = await fetch(url);
          const html = await htmlResp.text();
          const match = html.match(/item\/(\d{6,})\.html/);
          if (match) {
            candidate = `https://www.aliexpress.com/item/${match[1]}.html`;
          }
        }
      } catch (err) {
        // fallback: נסה לחלץ מזהה מהפרמטרים
        const u = new URL(url);
        const searchText = u.searchParams.get('SearchText') || u.searchParams.get('searchText');
        if (searchText) candidate = searchText;
      }
    }
    // Look for AliExpress item pattern
    const match = candidate.match(/item\/(\d{6,})\.html/) || candidate.match(/(\d{6,})/);
    return match ? match[1] : null;
  } catch {
    const match = (url || '').match(/(\d{6,})/);
    return match ? match[1] : null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { affiliateUrl } = req.body || {};
  if (!affiliateUrl) {
    return res.status(400).json({ error: 'affiliateUrl is required' });
  }

  try {
      const productId = await extractProductIdFromUrl(affiliateUrl);
    console.log('[ali-images-by-link] affiliateUrl:', affiliateUrl);
      console.log('[ali-images-by-link] extracted productId (resolved):', productId);
    if (!productId) {
      return res.status(400).json({ error: 'Could not extract productId from URL' });
    }

    // שימוש בפונקציה החדשה לקבלת מוצר מלא
    const aliProduct = await (await import('../../lib/aliexpress-api')).fetchAliExpressFullProduct(productId);
    console.log('[ali-images-by-link] aliProduct:', aliProduct);
    if (!aliProduct) {
      return res.status(404).json({ error: 'Product not found on AliExpress' });
    }

    let mainImage = aliProduct.main_image || null;
    let gallery = Array.isArray(aliProduct.images) ? aliProduct.images : [];

    // אם לא התקבלו תמונות מה-API, ננסה לגרד מהדף עצמו
    if ((!mainImage || mainImage.includes('placeholder')) && affiliateUrl) {
      try {
        const scraperResp = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/extract-aliexpress-images`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ affiliateUrl })
        });
        if (scraperResp.ok) {
          const scraperData = await scraperResp.json();
          if (Array.isArray(scraperData.images) && scraperData.images.length > 0) {
            mainImage = scraperData.images[0];
            gallery = scraperData.images.slice(1);
          }
        }
      } catch (err) {
        console.warn('Fallback scraper failed:', err);
      }
    }

    return res.status(200).json({ productId, mainImage, gallery });
  } catch (error) {
    console.error('ali-images-by-link error:', error);
    return res.status(500).json({ error: 'Failed to fetch images', details: error.message });
  }
}


