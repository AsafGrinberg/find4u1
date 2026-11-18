// pages/category.js
// הכתובות הישנות (/category?cat=...) מפנות לנתיב הקבוע של הקטגוריה,
// כדי שקישורים שפורסמו בעבר ימשיכו לעבוד וגוגל יראה נתיב אחד בלבד.
import { ALL_PRODUCTS, categoryHref } from '../lib/urls';

export default function LegacyCategoryPage() {
  return null;
}

export async function getServerSideProps({ query }) {
  const name = Array.isArray(query.cat) ? query.cat[0] : query.cat;

  if (!name || name === ALL_PRODUCTS) {
    return { redirect: { destination: '/', permanent: true } };
  }

  return { redirect: { destination: categoryHref(name), permanent: true } };
}
