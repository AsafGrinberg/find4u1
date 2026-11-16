import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, deleteDoc, doc, getDocs, increment, updateDoc } from 'firebase/firestore';

import { auth, db } from '../firebase/firebase-config';
import { fetchProducts } from '../lib/products.module';
import { readGuestLikes, toggleGuestLike } from '../lib/likes';
import ProductCard from '../components/ProductCard';

export default function LikedPage() {
  const [products, setProducts] = useState([]);
  const [likedIds, setLikedIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    let cancelled = false;

    fetchProducts().then((data) => {
      if (cancelled) return;
      setProducts(data);
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
        setLikedIds(readGuestLikes());
        return;
      }

      try {
        const snapshot = await getDocs(
          collection(db, 'users', currentUser.uid, 'likedProducts')
        );
        setLikedIds(new Set(snapshot.docs.map((item) => item.id)));
      } catch {
        setLikedIds(new Set());
      }
    });
    return () => unsubscribe();
  }, []);

  async function toggleLike(productId) {
    if (!user) {
      setLikedIds(toggleGuestLike(productId));
      return;
    }

    const likeRef = doc(db, 'users', user.uid, 'likedProducts', productId);
    const productRef = doc(db, 'products', productId);

    if (likedIds.has(productId)) {
      setLikedIds((prev) => {
        const next = new Set(prev);
        next.delete(productId);
        return next;
      });
      try {
        await deleteDoc(likeRef);
        await updateDoc(productRef, { likesCount: increment(-1) });
      } catch {
        setLikedIds((prev) => new Set(prev).add(productId));
      }
      return;
    }

    setLikedIds((prev) => new Set(prev).add(productId));
    try {
      await updateDoc(productRef, { likesCount: increment(1) });
    } catch {
      // אין צורך לעצור על מונה לייקים
    }
  }

  const saved = products.filter((product) => likedIds.has(product.id));

  return (
    <>
      <Head>
        <title>מוצרים שמורים — Find4U</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <main dir="rtl">
        <div className="page-shell">
          <section className="hero">
            <p className="hero-eyebrow">♥ שמורים</p>
            <h1 className="hero-title">המוצרים ששמרת</h1>
            <p className="hero-sub">
              {user
                ? 'המוצרים ששמרת קשורים לחשבון שלך.'
                : 'המוצרים נשמרים בדפדפן הזה. התחברות תעביר אותם לחשבון שלך.'}
            </p>
          </section>

          <section className="section">
            {loading ? (
              <div className="empty-state">טוען...</div>
            ) : saved.length === 0 ? (
              <div className="empty-state">
                <strong>עוד לא שמרת מוצרים</strong>
                לחצו על הלב שעל כרטיס מוצר, והוא יופיע כאן.
                <div style={{ marginTop: 16 }}>
                  <Link href="/" style={{ color: 'var(--accent)', fontWeight: 700 }}>
                    חזרה לכל המוצרים
                  </Link>
                </div>
              </div>
            ) : (
              <div className="grid-container">
                {saved.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    liked
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
