import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { onAuthStateChanged, signInWithPopup } from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';

import { auth, db, provider } from '../../firebase/firebase-config';
import { fetchProducts } from '../../lib/products';
import { findProductByParam, formatPrice, discountOf } from '../../lib/urls';
import { readGuestLikes, toggleGuestLike } from '../../lib/likes';
import styles from '../../styles/product.module.css';

function categoriesOf(product) {
  const value = product.category;
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

export default function ProductPage() {
  const router = useRouter();
  const param = router.query.id;

  const [product, setProduct] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [user, setUser] = useState(null);
  const [reviewText, setReviewText] = useState('');
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [loadingProduct, setLoadingProduct] = useState(true);
  const [loadingReviews, setLoadingReviews] = useState(true);
  const [error, setError] = useState(null);
  const [liked, setLiked] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [expandedReviews, setExpandedReviews] = useState({});

  const productId = product ? product.id : null;

  useEffect(() => {
    if (!productId || user) return;
    setLiked(readGuestLikes().has(productId));
  }, [productId, user]);

  useEffect(() => {
    if (!param) return;
    let cancelled = false;

    setLoadingProduct(true);
    fetchProducts()
      .then((all) => {
        if (cancelled) return;
        const found = findProductByParam(all, param);
        if (found) {
          setProduct(found);
          setError(null);
        } else {
          setError('המוצר לא נמצא');
        }
      })
      .catch(() => {
        if (!cancelled) setError('שגיאה בטעינת המוצר');
      })
      .finally(() => {
        if (!cancelled) setLoadingProduct(false);
      });

    return () => {
      cancelled = true;
    };
  }, [param]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setLiked(false);
        return;
      }
      if (!param) return;
      getDoc(doc(db, 'users', currentUser.uid, 'likedProducts', String(param)))
        .then((snapshot) => setLiked(snapshot.exists()))
        .catch(() => setLiked(false));
    });
    return () => unsubscribe();
  }, [param]);

  useEffect(() => {
    if (!productId) return;
    let cancelled = false;

    async function loadReviews() {
      setLoadingReviews(true);
      try {
        const snapshot = await getDocs(
          collection(db, 'products', productId, 'reviews')
        );
        if (cancelled) return;
        setReviews(
          snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
        );
      } catch {
        if (!cancelled) setError('שגיאה בטעינת הביקורות');
      } finally {
        if (!cancelled) setLoadingReviews(false);
      }
    }

    loadReviews();

    return () => {
      cancelled = true;
    };
  }, [productId]);

  async function reloadReviews() {
    if (!productId) return;
    const snapshot = await getDocs(
      collection(db, 'products', productId, 'reviews')
    );
    setReviews(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
  }

  async function toggleLike() {
    if (!productId) return;

    if (!user) {
      const next = toggleGuestLike(productId);
      setLiked(next.has(productId));
      return;
    }

    const likeRef = doc(db, 'users', user.uid, 'likedProducts', productId);
    const productRef = doc(db, 'products', productId);
    const nextLiked = !liked;
    setLiked(nextLiked);

    try {
      if (nextLiked) {
        await setDoc(likeRef, {
          productId,
          timestamp: new Date().toISOString(),
        });
        await updateDoc(productRef, { likesCount: increment(1) });
      } else {
        await deleteDoc(likeRef);
        await updateDoc(productRef, { likesCount: increment(-1) });
      }
    } catch (err) {
      setLiked(!nextLiked);
      alert('שגיאה בעדכון השמירה: ' + err.message);
    }
  }

  async function handleReviewSubmit(event) {
    event.preventDefault();
    if (!user) {
      alert('אנא התחבר כדי לכתוב ביקורת');
      return;
    }
    if (!reviewText.trim() || !productId) return;

    try {
      await addDoc(collection(db, 'products', productId, 'reviews'), {
        rating,
        text: reviewText.trim(),
        userId: user.uid,
        userName: user.displayName || user.email || 'משתמש',
        createdAt: Timestamp.now(),
      });
      setReviewText('');
      setRating(5);
      await reloadReviews();
    } catch (err) {
      alert('שגיאה בשליחת הביקורת: ' + err.message);
    }
  }

  async function deleteReview(reviewId) {
    if (!confirm('למחוק את הביקורת?')) return;
    if (!productId) return;
    try {
      await deleteDoc(doc(db, 'products', productId, 'reviews', reviewId));
      await reloadReviews();
    } catch (err) {
      alert('שגיאה במחיקת הביקורת: ' + err.message);
    }
  }

  if (loadingProduct) {
    return <p className={styles.loading}>טוען מוצר...</p>;
  }

  if (error || !product) {
    return (
      <main dir="rtl">
        <div className="page-shell">
          <div className="empty-state" style={{ marginTop: 60 }}>
            <strong>{error || 'המוצר לא נמצא'}</strong>
            <Link href="/" style={{ color: 'var(--accent)', fontWeight: 600 }}>
              חזרה לכל המוצרים
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const images = [product.image, ...(product.gallery || [])].filter(Boolean);
  const uniqueImages = [...new Set(images)];
  const price = formatPrice(product.price);
  const original = formatPrice(product.originalPrice);
  const discount = discountOf(product);
  const productCategories = categoriesOf(product);
  const averageRating = reviews.length
    ? (
        reviews.reduce((sum, item) => sum + (Number(item.rating) || 0), 0) /
        reviews.length
      ).toFixed(1)
    : null;

  return (
    <>
      <Head>
        <title>{`${product.name} — Find4U`}</title>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta
          name="description"
          content={(product.description || product.name || '').slice(0, 155)}
        />
        <meta property="og:title" content={product.name} />
        <meta
          property="og:description"
          content={(product.description || '').slice(0, 155)}
        />
        {product.image ? <meta property="og:image" content={product.image} /> : null}
        <meta property="og:type" content="product" />
      </Head>

      <main dir="rtl">
        <div className={styles.page}>
          <nav className={styles.breadcrumb} aria-label="ניווט">
            <Link href="/">בית</Link>
            <span>/</span>
            {productCategories[0] ? (
              <>
                <Link href={`/category?cat=${encodeURIComponent(productCategories[0])}`}>
                  {productCategories[0]}
                </Link>
                <span>/</span>
              </>
            ) : null}
            <span>{product.name}</span>
          </nav>

          <div className={styles.layout}>
            <section className={styles.galleryCol} aria-label="תמונות המוצר">
              <div
                className={styles.mainImageWrap}
                onClick={() => setLightboxIndex(0)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') setLightboxIndex(0);
                }}
              >
                {uniqueImages.length > 0 ? (
                  <img
                    src={uniqueImages[0]}
                    alt={product.name}
                    className={styles.mainImage}
                  />
                ) : null}
                {discount ? (
                  <span className={styles.offBadge}>{discount}%−</span>
                ) : null}
              </div>

              {uniqueImages.length > 1 ? (
                <div className={styles.thumbs}>
                  {uniqueImages.map((src, index) => (
                    <img
                      key={src}
                      src={src}
                      alt={`תמונה ${index + 1}`}
                      className={`${styles.thumb} ${
                        (lightboxIndex ?? 0) === index ? styles.thumbActive : ''
                      }`}
                      onClick={() => setLightboxIndex(index)}
                    />
                  ))}
                </div>
              ) : null}
            </section>

            <section className={styles.infoCol}>
              <h1 className={styles.title}>{product.name}</h1>

              <div className={styles.metaRow}>
                {productCategories.map((name) => (
                  <span key={name} className={styles.chip}>
                    {name}
                  </span>
                ))}
                {Number(product.rating) ? (
                  <span className={`${styles.chip} ${styles.chipStar}`}>
                    ★ {Number(product.rating).toFixed(1)}
                  </span>
                ) : null}
                {averageRating ? (
                  <span className={`${styles.chip} ${styles.chipStar}`}>
                    {averageRating} מדירוגי הגולשים
                  </span>
                ) : null}
              </div>

              {product.description ? (
                <p style={{ margin: 0, color: 'var(--text-soft)', lineHeight: 1.75 }}>
                  {product.description}
                </p>
              ) : null}

              <div className={styles.priceCard}>
                <div className={styles.priceRow}>
                  <span className={styles.price}>
                    {price ? `${price} ₪` : 'לפרטים'}
                  </span>
                  {original && Number(product.originalPrice) > Number(product.price) ? (
                    <>
                      <span className={styles.original}>{original} ₪</span>
                      {discount ? (
                        <span className={styles.saveNote}>
                          חוסכים {discount}%
                        </span>
                      ) : null}
                    </>
                  ) : null}
                </div>

                <a
                  href={product.link}
                  target="_blank"
                  rel="noopener noreferrer sponsored"
                  className={styles.buyBtn}
                >
                  לרכישה מאליאקספרס
                  <span aria-hidden="true">←</span>
                </a>

                <div className={styles.secondaryRow}>
                  <button
                    type="button"
                    className={`${styles.ghostBtn} ${
                      liked ? styles.ghostBtnActive : ''
                    }`}
                    onClick={toggleLike}
                    aria-pressed={liked ? 'true' : 'false'}
                  >
                    {liked ? '♥ שמור אצלי' : '♡ שמור למועדפים'}
                  </button>
                </div>
              </div>

              <ul className={styles.perks}>
                <li className={styles.perk}>
                  <span className={styles.perkIcon}>🚚</span>
                  משלוח לישראל
                </li>
                {product.sales ? (
                  <li className={styles.perk}>
                    <span className={styles.perkIcon}>🔥</span>
                    {Number(product.sales).toLocaleString('he-IL')} מכירות
                  </li>
                ) : null}
                <li className={styles.perk}>
                  <span className={styles.perkIcon}>🔒</span>
                  רכישה מאובטחת דרך AliExpress
                </li>
              </ul>
            </section>
          </div>

          {product.videos && product.videos.length > 0 ? (
            <section className={styles.section} aria-label="סרטונים">
              <h2 className={styles.sectionTitle}>סרטונים</h2>
              <div className={styles.videoGrid}>
                {product.videos.map((videoUrl) => (
                  <iframe
                    key={videoUrl}
                    src={videoUrl}
                    title="סרטון המוצר"
                    scrolling="no"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className={styles.videoFrame}
                  />
                ))}
              </div>
            </section>
          ) : null}

          <section className={styles.section} aria-label="ביקורות">
            <div className="section-head">
              <h2 className={styles.sectionTitle}>ביקורות</h2>
              <span className="section-count">
                {averageRating
                  ? `דירוג ממוצע ${averageRating} ★`
                  : 'אין דירוגים עדיין'}
              </span>
            </div>

            {loadingReviews ? (
              <p style={{ color: 'var(--muted)' }}>טוען ביקורות...</p>
            ) : reviews.length === 0 ? (
              <div className={styles.loginHint}>היו הראשונים לכתוב ביקורת</div>
            ) : (
              <div className={styles.reviewList}>
                {reviews.map((review) => (
                  <article key={review.id} className={styles.reviewCard}>
                    <div className={styles.reviewHead}>
                      <span className={styles.reviewer}>
                        {review.userName || 'משתמש'}
                      </span>
                      <span className={styles.stars}>
                        {'★'.repeat(review.rating || 0)}
                        {'☆'.repeat(5 - (review.rating || 0))}
                      </span>
                    </div>

                    <p
                      className={styles.reviewText}
                      onClick={() => {
                        if ((review.text || '').length > 200) {
                          setExpandedReviews((prev) => ({
                            ...prev,
                            [review.id]: !prev[review.id],
                          }));
                        }
                      }}
                      style={{
                        cursor:
                          (review.text || '').length > 200
                            ? 'pointer'
                            : 'default',
                      }}
                    >
                      {expandedReviews[review.id] ||
                      (review.text || '').length <= 200
                        ? review.text
                        : `${(review.text || '').slice(0, 200)}...`}
                    </p>

                    <small className={styles.reviewDate}>
                      {review.createdAt?.seconds
                        ? new Date(
                            review.createdAt.seconds * 1000
                          ).toLocaleDateString('he-IL')
                        : ''}
                    </small>

                    {user && user.uid === review.userId ? (
                      <button
                        type="button"
                        className={styles.deleteBtn}
                        onClick={() => deleteReview(review.id)}
                        aria-label="מחק ביקורת"
                      >
                        ✕
                      </button>
                    ) : null}
                  </article>
                ))}
              </div>
            )}

            {user ? (
              <form className={styles.form} onSubmit={handleReviewSubmit}>
                <div className={styles.ratingPicker}>
                  דירוג:
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      className={`${styles.star} ${
                        (hoverRating || rating) >= star ? styles.starActive : ''
                      }`}
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(0)}
                      onClick={() => setRating(star)}
                      aria-label={`${star} כוכבים`}
                    >
                      ★
                    </button>
                  ))}
                </div>

                <textarea
                  className={styles.textarea}
                  value={reviewText}
                  onChange={(event) => setReviewText(event.target.value)}
                  placeholder="ספרו לנו מה דעתכם על המוצר..."
                  rows={4}
                  required
                />

                <button type="submit" className={styles.submitBtn}>
                  פרסם ביקורת
                </button>
              </form>
            ) : (
              <div className={styles.loginHint}>
                <span>רוצים לכתוב ביקורת?</span>
                <button
                  type="button"
                  className={styles.loginBtn}
                  onClick={() => signInWithPopup(auth, provider).catch(() => {})}
                >
                  <img src="/assets/images/google-Logo.png" alt="" />
                  התחברות עם גוגל
                </button>
              </div>
            )}
          </section>
        </div>

        {lightboxIndex !== null && uniqueImages[lightboxIndex] ? (
          <div className={styles.lightbox} onClick={() => setLightboxIndex(null)}>
            <img
              src={uniqueImages[lightboxIndex]}
              alt={product.name}
              className={styles.lightboxImage}
              onClick={(event) => event.stopPropagation()}
            />
            {uniqueImages.length > 1 ? (
              <>
                <button
                  type="button"
                  className={styles.lightboxPrev}
                  aria-label="הקודם"
                  onClick={(event) => {
                    event.stopPropagation();
                    setLightboxIndex(
                      (lightboxIndex - 1 + uniqueImages.length) %
                        uniqueImages.length
                    );
                  }}
                >
                  ‹
                </button>
                <button
                  type="button"
                  className={styles.lightboxNext}
                  aria-label="הבא"
                  onClick={(event) => {
                    event.stopPropagation();
                    setLightboxIndex((lightboxIndex + 1) % uniqueImages.length);
                  }}
                >
                  ›
                </button>
              </>
            ) : null}
          </div>
        ) : null}
      </main>
    </>
  );
}
