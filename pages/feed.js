import Head from 'next/head';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { fetchProductsServer } from '../lib/firestore-server';
import { readGuestLikes, toggleGuestLike } from '../lib/likes';
import {
  categoriesOf,
  categoryLabel,
  dedupeProducts,
  discountOf,
  formatPrice,
  goHref,
  productHref,
  productUrl,
  sortProducts,
  SITE_URL,
} from '../lib/urls';
import ShareButton from '../components/ShareButton';
import styles from '../styles/feed.module.css';

// הפיד מציג את המוצרים המובילים. טעינת כל הקטלוג לעמוד אחד הייתה מכבידה
// על המובייל, וזה גם מה שרואים בפועל בגלילה הראשונה.
const FEED_LIMIT = 120;

export async function getStaticProps() {
  const products = await fetchProductsServer();

  return {
    props: { initialProducts: products },
    revalidate: 300,
  };
}

export default function FeedPage({ initialProducts = [] }) {
  const [user, setUser] = useState(null);
  const [likedProducts, setLikedProducts] = useState(new Set());
  const [activeIndex, setActiveIndex] = useState(0);
  const feedRef = useRef(null);

  const items = useMemo(() => {
    const withImage = dedupeProducts(initialProducts).filter(
      (product) => product.image
    );
    return sortProducts(withImage, 'bestsellers').slice(0, FEED_LIMIT);
  }, [initialProducts]);

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

  // הגלילה עצמה קובעת איזה מוצר פעיל, כדי שהמונה למעלה יהיה מדויק.
  useEffect(() => {
    const container = feedRef.current;
    if (!container) return undefined;

    const handleScroll = () => {
      const height = container.clientHeight || 1;
      const next = Math.round(container.scrollTop / height);
      setActiveIndex(Math.max(0, Math.min(items.length - 1, next)));
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [items.length]);

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
        <title>פיד מוצרים — Find4U</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta
          name="description"
          content="גללו בין המוצרים הנמכרים ביותר של Find4U, עם המחירים וההנחות, והוסיפו ללב מה שאהבתם."
        />
        <link rel="canonical" href={`${SITE_URL}/feed`} />
      </Head>

      <main dir="rtl" className={styles.page}>
        <div className={styles.stage}>
          {items.length === 0 ? (
            <div className={styles.empty}>
              <strong>הפיד בהכנה</strong>
              <span>ברגע שיהיו מוצרים עם תמונה הם יופיעו כאן.</span>
            </div>
          ) : (
            <>
              <div className={styles.counter}>
                {activeIndex + 1} / {items.length}
              </div>

              <div className={styles.feed} ref={feedRef}>
                {items.map((product, index) => {
                  const price = formatPrice(product.price);
                  const original = formatPrice(product.originalPrice);
                  const hasDiscount =
                    original && Number(product.originalPrice) > Number(product.price);
                  const discount = discountOf(product);
                  const rating = Number(product.rating);
                  const categories = categoriesOf(product);
                  const liked = likedProducts.has(product.id);
                  // תמונה נטענת רק בסמוך לשקופית הנוכחית, כדי שהפיד לא יוריד
                  // 120 תמונות בבת אחת.
                  const near = Math.abs(index - activeIndex) <= 2;

                  return (
                    <section
                      key={product.id}
                      className={styles.slide}
                      aria-label={product.name || 'מוצר'}
                    >
                      <Link
                        href={productHref(product)}
                        className={styles.mediaLink}
                        tabIndex={-1}
                        aria-hidden="true"
                      >
                        <div className={styles.media}>
                          {near ? (
                            <Image
                              src={product.image}
                              alt={product.name || 'מוצר'}
                              fill
                              sizes="(max-width: 768px) 100vw, 520px"
                              style={{ objectFit: 'cover' }}
                            />
                          ) : null}
                          <span className={styles.shade} />
                        </div>
                      </Link>

                      <div className={styles.topRow}>
                        <div className={styles.topActions}>
                          <button
                            type="button"
                            className={`${styles.like}${liked ? ` ${styles.liked}` : ''}`}
                            aria-label={liked ? 'הסר מהמועדפים' : 'הוסף למועדפים'}
                            aria-pressed={liked ? 'true' : 'false'}
                            onClick={() => toggleLike(product.id)}
                          >
                            {liked ? '♥' : '♡'}
                          </button>

                          <ShareButton
                            title={product.name}
                            url={productUrl(product)}
                            label=""
                            className={styles.share}
                          />
                        </div>

                        {discount ? (
                          <span className={styles.badge}>{discount}%−</span>
                        ) : null}
                      </div>

                      <div className={styles.info}>
                        {categories.length > 0 ? (
                          <span className={styles.category}>
                            {categoryLabel(categories[0])}
                          </span>
                        ) : null}

                        <h2 className={styles.title}>
                          <Link href={productHref(product)}>{product.name}</Link>
                        </h2>

                        {Number.isFinite(rating) || product.sales ? (
                          <div className={styles.meta}>
                            {Number.isFinite(rating) ? (
                              <span>★ {rating.toFixed(1)}</span>
                            ) : null}
                            {product.sales ? (
                              <span>
                                {Number(product.sales).toLocaleString('he-IL')}{' '}
                                נמכרו
                              </span>
                            ) : null}
                          </div>
                        ) : null}

                        <div className={styles.priceRow}>
                          <span className={styles.price}>
                            {price ? `${price} ₪` : 'לפרטים'}
                          </span>
                          {hasDiscount ? (
                            <s className={styles.original}>{original} ₪</s>
                          ) : null}
                        </div>

                        <div className={styles.actions}>
                          {product.link ? (
                            <a
                              href={goHref(product)}
                              target="_blank"
                              rel="noopener noreferrer sponsored"
                              className={styles.buy}
                            >
                              לרכישה מאליאקספרס
                              <span aria-hidden="true">←</span>
                            </a>
                          ) : (
                            <Link href={productHref(product)} className={styles.buy}>
                              לפרטי המוצר
                              <span aria-hidden="true">←</span>
                            </Link>
                          )}

                          <Link
                            href={productHref(product)}
                            className={styles.details}
                          >
                            פרטים
                          </Link>
                        </div>
                      </div>
                    </section>
                  );
                })}
              </div>

              <p className={styles.hint}>גללו למעלה ולמטה כדי לעבור בין מוצרים</p>
            </>
          )}
        </div>
      </main>
    </>
  );
}
