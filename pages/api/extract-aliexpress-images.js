// pages/api/extract-aliexpress-images.js
import { extractAliExpressProductData } from '../../lib/aliexpress-scraper';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { affiliateUrl } = req.body || {};
  if (!affiliateUrl) {
    return res.status(400).json({ error: 'affiliateUrl is required' });
  }

  try {
    const productData = await extractAliExpressProductData(affiliateUrl);
    if (!productData || !Array.isArray(productData.images) || productData.images.length === 0) {
      return res.status(404).json({ error: 'No images found for product' });
    }
    return res.status(200).json({ images: productData.images, title: productData.title, price: productData.price });
  } catch (error) {
    console.error('extract-aliexpress-images error:', error);
    return res.status(500).json({ error: 'Failed to extract images', details: error.message });
  }
}
