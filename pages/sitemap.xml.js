// pages/sitemap.xml.js
// מייצר sitemap דינמי מפיירבייס: עמודי הבית והאמון + כל הקטגוריות + כל המוצרים.
// כתובת: https://find4u.vercel.app/sitemap.xml
import {
  ALL_PRODUCTS,
  categoryHref,
  categoriesOf,
  collectCategoryNames,
  dedupeProducts,
  productSlug,
  SITE_URL,
} from '../lib/urls';
import { fetchProductsServer, fetchCategoriesServer } from '../lib/firestore-server';

const BASE_URL = SITE_URL;

const STATIC_PAGES = [
  { loc: '/', priority: '1.0' },
  { loc: '/alerts', priority: '0.6' },
  { loc: '/how-it-works', priority: '0.5' },
  { loc: '/about', priority: '0.5' },
  { loc: '/shipping-returns', priority: '0.5' },
  { loc: '/affiliate-disclosure', priority: '0.5' },
];

function escapeXml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export default function Sitemap() {
  return null;
}

export async function getServerSideProps({ res }) {
  const urls = STATIC_PAGES.map((page) => ({
    loc: `${BASE_URL}${page.loc}`,
    priority: page.priority,
  }));

  try {
    const [products, categories] = await Promise.all([
      fetchProductsServer(),
      fetchCategoriesServer(),
    ]);

    const list = dedupeProducts(products);

    collectCategoryNames(categories, list)
      .filter((name) => name !== ALL_PRODUCTS)
      .forEach((name) => {
        urls.push({
          loc: `${BASE_URL}${categoryHref(name)}`,
          priority: '0.8',
        });
      });

    list.forEach((product) => {
      const categoriesForProduct = categoriesOf(product);
      if (categoriesForProduct.length === 0) return;
      urls.push({
        loc: `${BASE_URL}/product/${encodeURIComponent(productSlug(product))}`,
        priority: '0.7',
        lastmod: product.updatedAt || product.createdAt,
      });
    });
  } catch (error) {
    // אם פיירבייס לא זמין — לפחות מחזירים את העמודים הקבועים
    console.error('sitemap: failed to load data', error);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map((entry) => {
    const lastmod = entry.lastmod ? new Date(entry.lastmod) : null;
    return `  <url><loc>${escapeXml(entry.loc)}</loc>${
      lastmod && !Number.isNaN(lastmod.getTime())
        ? `<lastmod>${lastmod.toISOString()}</lastmod>`
        : ''
    }<priority>${entry.priority}</priority></url>`;
  })
  .join('\n')}
</urlset>`;

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
  res.write(xml);
  res.end();

  return { props: {} };
}
