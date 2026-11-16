import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
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
import { readGuestLikes, toggleGuestLike } from '../lib/likes';
import { createdAtValue } from '../lib/urls';
import ProductCard from '../components/ProductCard';

function categoriesOf(product) {
  const value = product.category;
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

export default function CategoryPage() {
  const router = useRouter();
  const cat = router.query.cat;

  const [allProducts, setAllProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [likedProducts, setLikedProducts] = useState(new Set());

  useEffect(() => {
    let cancelled = false;

    fetchProducts().then((data) => {
      if (cancelled) return;
      setAllProducts(data);
      setLoading(false);
    });

    getDocs(collection(db, 'categories'))
      .then((snapshot) => {
        if (cancelled) return;
        setCategories(
          snapshot.docs.map((item) => item.data().name).filter(Boolean)
        );
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

  const products = useMemo(() => {
    const list = [...allProducts].sort(
      (a, b) => createdAtValue(b) - createdAtValue(a)
    );
    if (!cat || cat === 'כל המוצרים') return list;
    return list.filter((product) => categoriesOf(product).includes(cat));
  }, [allProducts, cat]);

  const filteredProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return products;
    return products.filter((product) =>
      [product.name, product.description, ...categoriesOf(product)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term)
    );
  }, [products, searchTerm]);

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

  const title = cat && cat !== 'כל המוצרים' ? cat : 'כל המוצרים';

  return (
    <>
      <Head>
        <title>{`${title} — Find4U`}</title>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta
          name="description"
          content={`מוצרים נבחרים בקטגוריית ${title} עם מחירים בשקלים ומשלוח לישראל.`}
        />
        <meta property="og:title" content={`${title} — Find4U`} />
        <meta property="og:type" content="website" />
      </Head>

      <main dir="rtl">
        <div className="page-shell">
          <section className="hero">
            <p className="hero-eyebrow">קטגוריה</p>
            <h1 className="hero-title">{title}</h1>
            <p className="hero-sub">
              {products.length} מוצרים נבחרים, מסודרים לפי החדשים ביותר.
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
            <Link href="/" className="chip">
              חזרה לכל המוצרים
            </Link>
            {categories
              .filter((name) => name !== cat)
              .map((name) => (
                <Link
                  key={name}
                  href={`/category?cat=${encodeURIComponent(name)}`}
                  className="chip"
                >
                  {name}
                </Link>
              ))}
          </nav>

          <section className="section">
            {loading ? (
              <div className="empty-state">טוען מוצרים...</div>
            ) : filteredProducts.length === 0 ? (
              <div className="empty-state">
                <strong>אין מוצרים בקטגוריה הזאת עדיין</strong>
                נסו קטגוריה אחרת, או חזרו לכל המוצרים.
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
