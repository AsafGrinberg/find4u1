import { fetchProductsServer } from '../../lib/firestore-server';
import {
  categoriesOf,
  findProductByParam,
  productSlug,
  SITE_URL,
} from '../../lib/urls';

// דף מעבר לקישור האפיליאטיבי. הוא מאפשר לספור הקלקות בלי לגעת בקישור עצמו,
// ועובד גם בלחיצה ימנית או בפתיחה בכרטיסייה חדשה.
const PROJECT_ID = 'find4u-il-aefd0';
const API_KEY =
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
  'AIzaSyCwpXCeGMYK10KvU8JJ5uES5DJSG0Sq6jU';

function toFirestoreFields(values) {
  const fields = {};
  Object.entries(values).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (typeof value === 'number' && Number.isFinite(value)) {
      fields[key] = { doubleValue: value };
    } else {
      fields[key] = { stringValue: String(value) };
    }
  });
  return fields;
}

// רישום הקלקה הוא "עדיף שיהיה": אם כללי האבטחה חוסמים או שרת איטי,
// הגולש עדיין ממשיך לאליאקספרס מיד.
async function logClick(product, req) {
  const body = JSON.stringify({
    fields: toFirestoreFields({
      productId: product.productId || product.id,
      slug: productSlug(product),
      name: product.name,
      category: categoriesOf(product)[0],
      price: Number(product.price) || undefined,
      referer: req.headers.referer || '',
      createdAt: new Date().toISOString(),
    }),
  });

  try {
    await Promise.race([
      fetch(
        `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}` +
          `/databases/(default)/documents/clicks?key=${API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        }
      ),
      new Promise((resolve) => setTimeout(resolve, 400)),
    ]);
  } catch {
    // לא מפריעים למעבר עצמו.
  }
}

export async function getServerSideProps({ params, req }) {
  const products = await fetchProductsServer();
  const product = findProductByParam(products, params.id);

  if (!product) {
    return { notFound: true };
  }

  // מוצר שנמחק מהחנות: לא שולחים את הגולש ללינק מת, אלא למוצר החלופי.
  if (product.unavailable) {
    const fallback =
      product.replacementLink ||
      (product.replacementSlug
        ? `${SITE_URL}/product/${encodeURIComponent(product.replacementSlug)}`
        : `${SITE_URL}/product/${encodeURIComponent(productSlug(product))}`);

    return {
      redirect: {
        destination: fallback,
        permanent: false,
      },
    };
  }

  if (!product.link) {
    return { notFound: true };
  }

  await logClick(product, req);

  return {
    redirect: {
      destination: product.link,
      permanent: false,
    },
  };
}

export default function GoToProduct() {
  return null;
}
