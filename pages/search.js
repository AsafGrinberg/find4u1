import { ALL_PRODUCTS, categorySlug } from '../lib/urls';

// עמוד החיפוש הישן היה כפילות: הוא טען את כל המוצרים בדפדפן בעיצוב אחר.
// עכשיו הוא מפנה לחיפוש שבתוך דף "כל המוצרים", עם אותו עיצוב ואותם סינונים.
export async function getServerSideProps({ query }) {
  const q = typeof query.q === 'string' ? query.q.trim() : '';
  // הנתיב בעברית חייב קידוד, אחרת כותרת ה-Location נדחית על ידי Node.
  const base = `/category/${encodeURIComponent(categorySlug(ALL_PRODUCTS))}`;
  const destination = q ? `${base}?q=${encodeURIComponent(q)}` : base;

  return { redirect: { destination, permanent: false } };
}

export default function SearchRedirect() {
  return null;
}
