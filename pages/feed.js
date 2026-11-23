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
  withoutUnavailable,
  SITE_URL,
} from '../lib/urls';
import ShareButton from '../components/ShareButton';
import styles from '../styles/feed.module.css';

// הפיד מציג את המוצרים המובילים. טעינת כל הקטלוג לעמוד אחד הייתה מכבידה
// על המובייל, וזה גם מה שרואים בפועל בגלילה הראשונה.
const FEED_LIMIT = 120;

// מה שנצפה לאחרונה נשמר בדפדפן, כדי שכל כניסה תתחיל ממוצרים חדשים.
const SEEN_KEY = 'find4u_feed_seen';
const SEEN_LIMIT = 800;

export async function getStaticProps() {
  const products = await fetchProductsServer();

  return {
    props: { initialProducts: products },
    revalidate: 300,
  };
}

function readSeen() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeSeen(ids) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      SEEN_KEY,
      JSON.stringify(ids.slice(-SEEN_LIMIT))
    );
  } catch {
    // אחסון חסום — ממשיכים בלי מעקב.
  }
}

function shuffled(list) {
  const next = [...list];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function tokensOf(product) {
  return new Set(
    String(product.name || '')
      .toLowerCase()
      .split(/[^0-9a-z\u0590-\u05FF]+/)
      .filter((word) => word.length > 2)
  );
}

/**
 * סדר הפיד: קודם מוצרים שמזכירים את מה שאהבת, אחר כך תגליות חדשות,
 * והישנים שכבר נראו נדחקים לסוף. תמיד נשארים מוצרים שלא קשורים
 * לתחומים שאהבת, כדי שהפיד לא יהפוך למעגל סגור.
 */
function buildOrder(products, likedIds) {
  const pool = withoutUnavailable(dedupeProducts(products)).filter(
    (product) => product.image
  );
  if (pool.length === 0) return [];

  const seen = new Set(readSeen());
  const liked = pool.filter((product) => likedIds.has(product.id));

  const likedCategories = new Set();
  const likedTokens = new Set();
  liked.forEach((product) => {
    categoriesOf(product).forEach((name) => likedCategories.add(name));
    tokensOf(product).forEach((token) => likedTokens.add(token));
  });

  const scoreOf = (product) => {
    let score = 0;
    categoriesOf(product).forEach((name) => {
      if (likedCategories.has(name)) score += 3;
    });
    tokensOf(product).forEach((token) => {
      if (likedTokens.has(token)) score += 1;
    });
    return score;
  };

  const unseen = pool.filter((product) => !seen.has(product.id));
  const alreadySeen = pool.filter((product) => seen.has(product.id));

  const personal = shuffled(
    unseen.filter((product) => scoreOf(product) > 0)
  ).sort((a, b) => scoreOf(b) - scoreOf(a));
  const discovery = shuffled(
    unseen.filter((product) => scoreOf(product) === 0)
  );
  const older = shuffled(alreadySeen);

  // שתי המלצות על כל תגלית: אישי דומיננטי אבל לא בלעדי.
  const ordered = [];
  let p = 0;
  let d = 0;
  while (p < personal.length || d < discovery.length) {
    if (p < personal.length) ordered.push(personal[p]);
    p += 1;
    if (p < personal.length) ordered.push(personal[p]);
    p += 1;
    if (d < discovery.length) ordered.push(discovery[d]);
    d += 1;
  }

  return [...ordered, ...older].slice(0, FEED_LIMIT);
}

// כל מוצר בפיד מתחיל בסרטון שה-AI הכין לו (עם קריינות), אחר כך בסרטון של
// המוכר ואז בתמונות. הסרטון מוביל לדף המוצר ולרכישה, בדיוק כמו שאר הפריט.
// הבחירה נשמרת רק בזיכרון של השקופית — מי שיוצא מהפיד וחוזר מתחיל שוב
// מהסרטון, ולא נתקע על תמונה שראה קודם.
function aiReelUrl(product) {
  return (product.reel && product.reel.url) || null;
}

function mediaItemsOf(product) {
  const images = [product.image, ...(product.gallery || [])].filter(Boolean);
  const unique = [...new Set(images)];
  const items = unique.map((src) => ({ type: 'image', src }));
  const reel = aiReelUrl(product);
  if (product.videoUrl) items.unshift({ type: 'video', src: product.videoUrl });
  if (reel) items.unshift({ type: 'video', src: reel, reel: true });
  return items;
}

function FeedMedia({ product, href, near, autoplay, muted }) {
  const items = useMemo(() => mediaItemsOf(product), [product]);
  const [active, setActive] = useState(0);
  const videoRef = useRef(null);
  const current = items[Math.min(active, items.length - 1)];
  const isVideo = current && current.type === 'video';

  // סרטון מתנגן רק כשהשקופית באמת במרכז, ולא ברקע של השקופיות הסמוכות.
  // הרמקול בפיד מתחיל מושתק (כמו באינסטגרם) — כל דפדפן חוסם וידאו
  // אוטומטי עם קול, ולכן הקול נדלק רק בלחיצה של המשתמש.
  useEffect(() => {
    const node = videoRef.current;
    if (!node) return;
    node.muted = muted;
    if (autoplay) {
      const started = node.play();
      if (started && typeof started.catch === 'function') started.catch(() => {});
    } else {
      node.pause();
    }
  }, [autoplay, active, muted]);

  return (
    <>
      <Link
        href={href}
        className={styles.mediaLink}
        tabIndex={-1}
        aria-hidden="true"
      >
        <div className={styles.media}>
          {near && isVideo ? (
            <video
              key={current.src}
              ref={videoRef}
              className={styles.video}
              src={current.src}
              poster={product.image || undefined}
              muted={muted}
              loop
              playsInline
              preload="metadata"
            />
          ) : near && current ? (
            <Image
              src={current.src}
              alt={product.name || 'מוצר'}
              fill
              sizes="(max-width: 768px) 100vw, 520px"
              style={{ objectFit: 'cover' }}
            />
          ) : null}
          <span className={styles.shade} />
        </div>
      </Link>

      {near && items.length > 1 ? (
        <div className={styles.thumbs} role="group" aria-label="מדיה של המוצר">
          {items.map((item, position) => (
            <button
              key={`${item.type}-${item.src}`}
              type="button"
              className={`${styles.thumb}${position === active ? ` ${styles.thumbActive}` : ''}`}
              aria-label={
                item.type === 'video'
                  ? item.reel
                    ? 'סרטון AI של המוצר'
                    : 'סרטון המוצר'
                  : 'תמונת מוצר'
              }
              aria-pressed={position === active ? 'true' : 'false'}
              onClick={() => setActive(position)}
            >
              <img
                className={styles.thumbImage}
                src={item.type === 'video' ? product.image : item.src}
                alt=""
                loading="lazy"
              />
              {item.type === 'video' ? (
                <span className={styles.thumbPlay} aria-hidden="true">
                  ▶
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}

export default function FeedPage({ initialProducts = [] }) {
  const [user, setUser] = useState(null);
  const [likedProducts, setLikedProducts] = useState(new Set());
  const [items, setItems] = useState(() =>
    sortProducts(
      withoutUnavailable(dedupeProducts(initialProducts)).filter(
        (product) => product.image
      ),
      'bestsellers'
    ).slice(0, FEED_LIMIT)
  );
  const [likesReady, setLikesReady] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  // מתג הרמקול של הפיד. ברירת המחדל מושתקת, בדיוק כמו באינסטגרם:
  // הסרטון מתנגן לבד בלי קול, ולחיצה אחת מדליקה את הקריינות.
  const [soundOn, setSoundOn] = useState(false);
  const feedRef = useRef(null);
  const orderedOnce = useRef(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);

      if (!currentUser) {
        setLikedProducts(readGuestLikes());
        setLikesReady(true);
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
      setLikesReady(true);
    });
    return () => unsubscribe();
  }, []);

  // הסדר נקבע פעם אחת בכל טעינה, לפי הלייקים, וכך כל כניסה נראית אחרת.
  useEffect(() => {
    if (!likesReady || orderedOnce.current) return;
    orderedOnce.current = true;
    setItems(buildOrder(initialProducts, likedProducts));
    setActiveIndex(0);
  }, [likesReady, likedProducts, initialProducts]);

  // אחרי שהמוצרים הוצגו — מסמנים אותם כנצפו, לטובת הכניסה הבאה.
  useEffect(() => {
    if (!likesReady || items.length === 0) return;
    writeSeen([...readSeen(), ...items.map((item) => item.id)]);
  }, [likesReady, items]);

  // הגלילה עצמה קובעת איזה מוצר פעיל, כדי לטעון רק את התמונות סביבו.
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
                  const hasVideo = Boolean(aiReelUrl(product) || product.videoUrl);

                  return (
                    <section
                      key={product.id}
                      className={styles.slide}
                      aria-label={product.name || 'מוצר'}
                    >
                      <FeedMedia
                        product={product}
                        href={productHref(product)}
                        near={near}
                        autoplay={index === activeIndex}
                        muted={!soundOn}
                      />

                      <div className={styles.topRow}>
                        <div className={styles.topActions}>
                          {hasVideo ? (
                            <button
                              type="button"
                              className={`${styles.sound}${soundOn ? ` ${styles.soundOn}` : ''}`}
                              aria-label={soundOn ? 'השתק את הסרטון' : 'הפעל קול'}
                              aria-pressed={soundOn ? 'true' : 'false'}
                              onClick={() => setSoundOn((current) => !current)}
                            >
                              {soundOn ? '🔊' : '🔇'}
                            </button>
                          ) : null}

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
