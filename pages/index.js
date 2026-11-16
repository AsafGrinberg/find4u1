import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import Fuse from 'fuse.js';
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

import { auth, db } from '../firebase/firebase-config';
import { fetchProducts } from '../lib/products.module';
import { fetchProductsServer, fetchCategoriesServer } from '../lib/firestore-server';
import { readGuestLikes, toggleGuestLike } from '../lib/likes';
import { createdAtValue, dedupeProducts, SITE_URL } from '../lib/urls';
import ProductCard from '../components/ProductCard';

export async function getStaticProps() {
  const [products, categories] = await Promise.all([
    fetchProductsServer(),
    fetchCategoriesServer(),
  ]);

  return {
    props: {
      initialProducts: products,
      initialCategories: categories
        .map((category) => category.name)
        .filter(Boolean),
    },
    revalidate: 300,
  };
}

export default function Home({ initialProducts = [], initialCategories = [] }) {
  const [products, setProducts] = useState(initialProducts);
  const [categories, setCategories] = useState(initialCategories);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(initialProducts.length === 0);
  const [user, setUser] = useState(null);
  const [likedProducts, setLikedProducts] = useState(new Set());

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const data = await fetchProducts();
      if (cancelled) return;
      setProducts((previous) => (data.length ? data : previous));
      setLoading(false);
    }

    load();

    if (initialCategories.length > 0) {
      setLoading(initialProducts.length === 0);
      return () => {
        cancelled = true;
      };
    }

    getDocs(collection(db, 'categories'))
      .then((snapshot) => {
        if (cancelled) return;
        const names = snapshot.docs
          .map((item) => item.data().name)
          .filter(Boolean);
        setCategories(names);
      })
      .catch(() => {});

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

  const sorted = useMemo(
    () =>
      dedupeProducts(products).sort(
        (a, b) => createdAtValue(b) - createdAtValue(a)
      ),
    [products]
  );

  const filteredProducts = useMemo(() => {
    const term = searchTerm.trim();
    if (!term) return sorted;
    return new Fuse(sorted, {
      keys: ['name', 'description', 'category'],
      threshold: 0.4,
    })
      .search(term)
      .map((result) => result.item);
  }, [sorted, searchTerm]);

  const suggestions = useMemo(
    () => (searchTerm.trim() ? filteredProducts.slice(0, 5) : []),
    [filteredProducts, searchTerm]
  );

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

  return (
    <>
      <Head>
        <title>Find4U — כל מה שחיפשתם במקום אחד</title>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta
          name="description"
          content="Find4U מרכז מוצרים נבחרים מאליאקספרס במקום אחד, מסודרים לפי קטגוריות, עם מחירים בשקלים וביקורות אמיתיות."
        />
        <meta property="og:title" content="Find4U — כל מה שחיפשתם במקום אחד" />
        <meta
          property="og:description"
          content="מוצרים נבחרים עם דירוג גבוה ומכירות אמיתיות, במקום אחד."
        />
        <meta property="og:type" content="website" />
        <meta property="og:locale" content="he_IL" />
        <meta property="og:site_name" content="Find4U" />
        <link rel="canonical" href={SITE_URL} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              name: 'Find4U',
              alternateName: 'Find4U — כל מה שחיפשתם במקום אחד',
              url: SITE_URL,
              inLanguage: 'he-IL',
              description:
                'מוצרים נבחרים מאליאקספרס במקום אחד, מסודרים לפי קטגוריות, במחירים בשקלים ומשלוח לישראל.',
            }),
          }}
        />
      </Head>

      <main dir="rtl">
        <div className="page-shell">
          <section className="hero">
            <h1 className="hero-title">
              כל מה שחיפשתם,
              <br />
              <span>במקום אחד</span>
            </h1>
            <p className="hero-sub">
              מוצרים נבחרים מאליאקספרס עם דירוג גבוה ומכירות אמיתיות, מסודרים
              לפי קטגוריות, במחירים בשקלים ומשלוח לישראל.
            </p>

            <div className="search-wrap">
              <div className="search-field">
                <span className="search-icon" aria-hidden="true">
                  ⌕
                </span>
                <input
                  id="searchInput"
                  className="search-input"
                  type="search"
                  placeholder="חפשו מוצר, קטגוריה או מותג..."
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

              {suggestions.length > 0 ? (
                <ul className="autocomplete-list">
                  {suggestions.map((product) => (
                    <li key={product.id}>
                      <Link href={`/product/${encodeURIComponent(product.slug || product.id)}`}>
                        {product.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <div className="hero-stats">
              <span className="hero-stat">
                <b>{products.length}</b> מוצרים נבחרים
              </span>
              <span className="hero-stat">
                <b>{categories.length}</b> קטגוריות
              </span>
              <span className="hero-stat">מחירים בשקלים</span>
            </div>
          </section>

          <section className="section">
            <div className="section-head">
              <h2 className="section-title">
                {searchTerm.trim() ? 'תוצאות חיפוש' : 'המוצרים שלנו'}
              </h2>
              <span className="section-count">
                {filteredProducts.length} מוצרים
              </span>
            </div>

            {loading ? (
              <div className="empty-state">טוען מוצרים...</div>
            ) : filteredProducts.length === 0 ? (
              <div className="empty-state">
                <strong>לא נמצאו מוצרים</strong>
                נסו מילה אחרת, או עברו לקטגוריה מהתפריט למעלה.
              </div>
            ) : (
              <div className="grid-container">
                {filteredProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    liked={likedProducts.has(product.id)}
                    onLike={toggleLike}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
