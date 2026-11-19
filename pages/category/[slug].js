import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  increment,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

import { auth, db } from '../../firebase/firebase-config';
import { fetchProducts } from '../../lib/products.module';
import { fetchProductsServer, fetchCategoriesServer } from '../../lib/firestore-server';
import { readGuestLikes, toggleGuestLike } from '../../lib/likes';
import {
  ALL_PRODUCTS,
  categoryHref,
  categoryLabel,
  categoryNameFromSlug,
  categorySlug,
  categoriesOf,
  collectCategoryNames,
  dedupeProducts,
  filterProducts,
  sortProducts,
  SITE_URL,
} from '../../lib/urls';
import ProductCard from '../../components/ProductCard';
import SortBar from '../../components/SortBar';

export async function getStaticPaths() {
  const [categories, products] = await Promise.all([
    fetchCategoriesServer(),
    fetchProductsServer(),
  ]);
  const names = collectCategoryNames(categories, products);

  const paths = names
    .filter((name) => name !== ALL_PRODUCTS)
    .map((name) => ({ params: { slug: categorySlug(name) } }));

  // דף אחד שמרכז את כל המוצרים, כדי שלניווט יהיה יעד אמיתי.
  paths.push({ params: { slug: categorySlug(ALL_PRODUCTS) } });

  return { paths, fallback: 'blocking' };
}

export async function getStaticProps({ params }) {
  const [products, categories] = await Promise.all([
    fetchProductsServer(),
    fetchCategoriesServer(),
  ]);

  const names = collectCategoryNames(categories, products);
  const name = categoryNameFromSlug(params.slug, names) || ALL_PRODUCTS;
  const isAll = name === ALL_PRODUCTS;

  const all = dedupeProducts(products);
  const items = isAll
    ? all
    : all.filter((product) => categoriesOf(product).includes(name));

  return {
    props: {
      categoryName: name,
      isAll,
      initialProducts: items,
      categoryNames: names,
    },
    revalidate: 300,
  };
}

export default function CategoryPage({
  categoryName = ALL_PRODUCTS,
  isAll = false,
  initialProducts = [],
  categoryNames = [],
}) {
  const [products, setProducts] = useState(initialProducts);
  const [sort, setSort] = useState('newest');
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(initialProducts.length === 0);
  const [user, setUser] = useState(null);
  const [likedProducts, setLikedProducts] = useState(new Set());
  const router = useRouter();

  // החיפוש של האתר כולו מופנה לכאן עם ?q=, כדי שיהיה מקום אחד לחפש בו.
  useEffect(() => {
    const q = router.query.q;
    if (typeof q === 'string' && q.trim()) setSearchTerm(q.trim());
  }, [router.query.q]);

  useEffect(() => {
    let cancelled = false;

    fetchProducts().then((data) => {
      if (cancelled) return;
      if (data.length) setProducts(data);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setLikedProducts(readGuestLikes());
        return;
      }
      try {
        const snapshot = await getDocs(
          collection(db, 'users', currentUser.uid, 'likedProducts')
        );
        setLikedProducts(new Set(snapshot.docs.map((item) => item.id)));
      } catch {
        setLikedProducts(new Set());
      }
    });
    return () => unsubscribe();
  }, []);

  const visible = useMemo(() => {
    const all = dedupeProducts(products);
    const inCategory = isAll
      ? all
      : all.filter((product) => categoriesOf(product).includes(categoryName));

    const term = searchTerm.trim().toLowerCase();
    const searched = term
      ? inCategory.filter((product) =>
          [product.name, product.description, ...categoriesOf(product)]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(term)
        )
      : inCategory;

    return sortProducts(filterProducts(searched, filter), sort);
  }, [products, isAll, categoryName, filter, sort, searchTerm]);

  async function toggleLike(productId) {
    if (!user) {
      setLikedProducts(toggleGuestLike(productId));
      return;
    }

    const likeRef = doc(db, 'users', user.uid, 'likedProducts', productId);
    const productRef = doc(db, 'products', productId);

    if (likedProducts.has(productId)) {
      setLikedProducts((prev) => {
        const next = new Set(prev);
        next.delete(productId);
        return next;
      });
      try {
        await deleteDoc(likeRef);
        await updateDoc(productRef, { likesCount: increment(-1) });
      } catch {
        setLikedProducts((prev) => new Set(prev).add(productId));
      }
      return;
    }

    setLikedProducts((prev) => new Set(prev).add(productId));
    try {
      await setDoc(likeRef, {
        productId,
        timestamp: new Date().toISOString(),
      });
      await updateDoc(productRef, { likesCount: increment(1) });
    } catch {
      setLikedProducts((prev) => {
        const next = new Set(prev);
        next.delete(productId);
        return next;
      });
    }
  }

  const title = isAll ? ALL_PRODUCTS : categoryLabel(categoryName);
  // דף "כל המוצרים" חוזר על דף הבית, ולכן הוא לא נכנס לאינדקס.
  const canonical = isAll
    ? `${SITE_URL}/category/${encodeURIComponent(categorySlug(ALL_PRODUCTS))}`
    : `${SITE_URL}${categoryHref(categoryName)}`;
  const description = isAll
    ? 'כל המוצרים הנבחרים של Find4U במקום אחד, עם מיון לפי מחיר, דירוג והנחה, ומשלוח לישראל.'
    : `מוצרי ${title} נבחרים מאליאקספרס עם דירוג גבוה ומכירות אמיתיות, מחירים בשקלים ומשלוח לישראל.`;

  return (
    <>
      <Head>
        <title>{`${title} — Find4U`}</title>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content={description} />
        <meta property="og:title" content={`${title} — Find4U`} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content="website" />
        <meta property="og:locale" content="he_IL" />
        <link rel="canonical" href={canonical} />
        {isAll ? <meta name="robots" content="noindex, follow" /> : null}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'BreadcrumbList',
              itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'בית', item: SITE_URL },
                ...(isAll
                  ? [{ '@type': 'ListItem', position: 2, name: ALL_PRODUCTS }]
                  : [
                      {
                        '@type': 'ListItem',
                        position: 2,
                        name: title,
                        item: canonical,
                      },
                    ]),
              ],
            }),
          }}
        />
      </Head>

      <main dir="rtl">
        <div className="page-shell">
          <nav className="breadcrumb-row" aria-label="ניווט">
            <Link href="/">בית</Link>
            <span aria-hidden="true">/</span>
            <span>{title}</span>
          </nav>

          <section className="hero">
            <p className="hero-eyebrow">📂 קטגוריה</p>
            <h1 className="hero-title">{title}</h1>
            <p className="hero-sub">
              {visible.length} מוצרים נבחרים, מסודרים לפי החדשים ביותר.
            </p>

            {!isAll ? (
              <p className="hero-sub">
                {`כל מוצרי ${title} בעמוד אחד: מוצרים שנבחרו לפי דירוג גבוה ומכירות אמיתיות באליאקספרס, עם המחיר בשקלים ומשלוח לישראל. אפשר לסנן לפי מבצעים, מחיר ודירוג ולמיין לפי החדשים, הזולים או הנמכרים ביותר.`}
              </p>
            ) : null}

            <div className="search-wrap">
              <div className="search-field">
                <span className="search-icon" aria-hidden="true">
                  ⌕
                </span>
                <input
                  id="searchInput"
                  className="search-input"
                  type="search"
                  placeholder="חפשו בתוך הקטגוריה..."
                  dir="rtl"
                  autoComplete="off"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
                {searchTerm ? (
                  <button
                    type="button"
                    className="search-clear"
                    aria-label="נקה חיפוש"
                    onClick={() => setSearchTerm('')}
                  >
                    ✕
                  </button>
                ) : null}
              </div>
            </div>
          </section>

          <nav className="chip-row" aria-label="קטגוריות">
            <Link
              href={`/category/${encodeURIComponent(categorySlug(ALL_PRODUCTS))}`}
              className={`chip${isAll ? ' chip-active' : ''}`}
            >
              {ALL_PRODUCTS}
            </Link>
            {categoryNames
              .filter((name) => name !== ALL_PRODUCTS && name !== categoryName)
              .map((name) => (
                <Link key={name} href={categoryHref(name)} className="chip">
                  {categoryLabel(name)}
                </Link>
              ))}
          </nav>

          <section className="section">
            {loading ? (
              <div className="empty-state">טוען מוצרים...</div>
            ) : (
              <>
                <SortBar
                  sort={sort}
                  filter={filter}
                  onSortChange={setSort}
                  onFilterChange={setFilter}
                  count={visible.length}
                />

                {visible.length === 0 ? (
                  <div className="empty-state">
                    <strong>אין מוצרים בקטגוריה הזאת עדיין</strong>
                    נסו קטגוריה אחרת, או חזרו לכל המוצרים.
                  </div>
                ) : (
                  <div className="grid-container">
                    {visible.map((product) => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        liked={likedProducts.has(product.id)}
                        onLike={toggleLike}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
