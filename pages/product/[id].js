import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Head from 'next/head';
import { fetchProducts } from '../../lib/products';
import { auth, db } from '../../firebase/firebase-config';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  Timestamp,
  query,
  where,
  increment
} from 'firebase/firestore';
import styles from '../../styles/product.module.css';
import { useDarkMode } from '../../context/DarkModeContext';
// אייקון וקטורי של ווצאפ
const WhatsappIcon = ({ size = 28, color = '#25D366' }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={color}
  >
    <path d="M20.52 3.48A11.94 11.94 0 0012 0C5.37 0 0 5.37 0 12a11.91 11.91 0 001.8 6.27L0 24l5.91-1.54A11.92 11.92 0 0012 24c6.63 0 12-5.37 12-12a11.94 11.94 0 00-3.48-8.52zm-8.57 17.38a8.52 8.52 0 01-4.44-1.28l-.32-.19-3.13.82.83-3.04-.21-.31a8.5 8.5 0 1111.66 3.01 8.34 8.34 0 01-4.59 1.99zm4.02-5.54c-.22-.11-1.3-.64-1.5-.71-.2-.07-.34.11-.49.11s-.56.71-.68.86-.25.14-.46.05a4.1 4.1 0 01-1.2-.7 4.72 4.72 0 01-1.39-1.71c-.15-.26 0-.4.11-.53.11-.11.25-.29.37-.44a.85.85 0 00.12-.21.35.35 0 00-.02-.41c-.07-.12-.48-1.14-.66-1.57s-.35-.36-.49-.36h-.42a1.17 1.17 0 00-.86.41 3.57 3.57 0 00-1.1 2.62 6.7 6.7 0 001.38 3.17 7.15 7.15 0 004.06 3.06 4.11 4.11 0 002.72.05 3.77 3.77 0 001.15-.74 4.62 4.62 0 001.09-1.36c.1-.18.07-.34 0-.47s-.49-.18-1.02-.32z" />
  </svg>
);

export default function ProductPage() {
  const router = useRouter();
  const { id: productId } = router.query;
  const { isDarkMode } = useDarkMode();

  const [product, setProduct] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [user, setUser] = useState(null);
  const [reviewText, setReviewText] = useState('');
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [avgRating, setAvgRating] = useState(null);
const [hovered, setHovered] = useState(false);

  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const [loadingProduct, setLoadingProduct] = useState(true);
  const [loadingReviews, setLoadingReviews] = useState(true);
  const [loadingLike, setLoadingLike] = useState(false);
  const [error, setError] = useState(null);

  // לייק
  const [liked, setLiked] = useState(false);
const [expandedReviews, setExpandedReviews] = useState({});
const [hoveredShare, setHoveredShare] = useState(false);
  function toggleReviewExpand(id) {
    setExpandedReviews(prev => ({
      ...prev,
      [id]: !prev[id],
    }));
  }
  const images = product ? [product.image, ...(product.gallery || [])] : [];
useEffect(() => {
    if (isDarkMode) {
      document.body.classList.add('dark');
    } else {
      document.body.classList.remove('dark');
    }
  }, [isDarkMode]);
  // טעינת מוצר
  useEffect(() => {
    if (!productId) return;
    setLoadingProduct(true);
    fetchProducts()
      .then(all => {
        const p = all.find(item => item.id === productId);
        if (p) {
          setProduct(p);
          setError(null);
        } else {
          setError('המוצר לא נמצא');
        }
      })
      .catch(() => setError('שגיאה בטעינת המוצר'))
      .finally(() => setLoadingProduct(false));
  }, [productId]);
useEffect(() => {
  document.body.classList.add('product-page');

  return () => {
    document.body.classList.remove('product-page');
  };
}, []);

  // אימות משתמש
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, currentUser => {
      setUser(currentUser);
      if (currentUser) checkIfLiked(currentUser.uid);
      else setLiked(false);
    });
    return () => unsubscribe();
  }, [productId]);

  // בדיקה אם המשתמש כבר לחץ לייק למוצר
async function checkIfLiked(userId) {
  if (!productId) return;
  try {
    const likeDocRef = doc(db, 'users', userId, 'likedProducts', productId);
    const likeDocSnap = await getDoc(likeDocRef);
    setLiked(likeDocSnap.exists());
  } catch {
    // שגיאה בבדיקת לייק - לא עושים כלום כרגע
  }
}


  // טעינת ביקורות
  useEffect(() => {
    if (!productId) return;
    setLoadingReviews(true);
    const loadReviews = async () => {
      try {
        const reviewsRef = collection(db, 'products', productId, 'reviews');
        const querySnapshot = await getDocs(reviewsRef);
        let sum = 0;
        const data = [];
        querySnapshot.forEach(docSnap => {
          const d = docSnap.data();
          sum += d.rating;
          data.push({ ...d, id: docSnap.id });
        });
        setReviews(data);
        setAvgRating(data.length ? (sum / data.length).toFixed(1) : null);
      } catch {
        setError('שגיאה בטעינת הביקורות');
      } finally {
        setLoadingReviews(false);
      }
    };
    loadReviews();
  }, [productId]);

  // טיפול בלייק
async function toggleLike() {
  if (!user) {
    alert('אנא התחבר כדי לבצע לייק');
    return;
  }
  if (!productId) return;

  setLoadingLike(true);

  try {
    const userLikeRef = doc(db, 'users', user.uid, 'likedProducts', productId);
    const productRef = doc(db, 'products', productId);

    if (liked) {
      // הסרת לייק - עדכן מיד את הסטייט ל־false לפני הקריאות האסינכרוניות
      setLiked(false);
      await deleteDoc(userLikeRef);
      await updateDoc(productRef, { likesCount: increment(-1) });
    } else {
      // הוספת לייק - עדכן מיד את הסטייט ל־true
      setLiked(true);
      await setDoc(userLikeRef, { productId, timestamp: new Date().toISOString() });
      await updateDoc(productRef, { likesCount: increment(1) });
    }
  } catch (err) {
    alert('שגיאה בעדכון הלייק: ' + err.message);
    // אם קרתה שגיאה אפשר לשקם את הסטייט ל־מצב קודם
    setLiked(!liked);
  } finally {
    setLoadingLike(false);
  }
}



  // שליחת ביקורת
  const handleReviewSubmit = async (e) => {
    e.preventDefault();
    if (!user) {
      alert('אנא התחבר כדי לכתוב ביקורת');
      return;
    }
    if (!reviewText.trim()) {
      alert('אנא כתוב טקסט לביקורת');
      return;
    }
    if (!productId) return;

    try {
      await addDoc(collection(db, 'products', productId, 'reviews'), {
        rating,
        text: reviewText.trim(),
        userId: user.uid,
        userName: user.displayName || user.email || 'משתמש',
        createdAt: Timestamp.now()
      });
      setReviewText('');
      setRating(5);
      // טען מחדש ביקורות
      const reviewsRef = collection(db, 'products', productId, 'reviews');
      const querySnapshot = await getDocs(reviewsRef);
      let sum = 0;
      const data = [];
      querySnapshot.forEach(docSnap => {
        const d = docSnap.data();
        sum += d.rating;
        data.push({ ...d, id: docSnap.id });
      });
      setReviews(data);
      setAvgRating(data.length ? (sum / data.length).toFixed(1) : null);
    } catch (err) {
      alert('שגיאה בשליחת הביקורת: ' + err.message);
    }
  };

  // מחיקת ביקורת
  async function deleteReview(reviewId) {
    if (!confirm('האם אתה בטוח שברצונך למחוק את הביקורת?')) return;
    if (!productId) return;
    try {
      await deleteDoc(doc(db, 'products', productId, 'reviews', reviewId));
      // טען מחדש ביקורות
      const reviewsRef = collection(db, 'products', productId, 'reviews');
      const querySnapshot = await getDocs(reviewsRef);
      let sum = 0;
      const data = [];
      querySnapshot.forEach(docSnap => {
        const d = docSnap.data();
        sum += d.rating;
        data.push({ ...d, id: docSnap.id });
      });
      setReviews(data);
      setAvgRating(data.length ? (sum / data.length).toFixed(1) : null);
    } catch (err) {
      alert('שגיאה במחיקת הביקורת: ' + err.message);
    }
  }

  if (loadingProduct) return <p className="text-center mt-20">טוען מוצר...</p>;
  if (error) return <p className="text-center mt-20 text-red-600">{error}</p>;
  if (!product) return <p className="text-center mt-20">המוצר לא נמצא.</p>;

  return (
  <>
    <Head>
      <title>{product.name} - Find4U</title>
    </Head>

<main className={`${styles.mainContainer} ${isDarkMode ? styles.dark : ''}`} dir="rtl">

  {/* הצגת שם המוצר */}
  <h1 className={styles.productTitle}>{product.name}</h1>

  {/* הצגת תיאור המוצר */}
  {product.description && (
    <p className={styles.productDescription}>{product.description}</p>
  )}
{product.price && product.price > 0 && (
  <p className={styles.productPrice}>
    מחיר: {product.price.toFixed(2)} ₪
  </p>
)}

<div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
  <button
    onClick={toggleLike}
    aria-label={liked ? 'ביטול לייק' : 'לייק'}
    onMouseEnter={() => setHovered(true)}
    onMouseLeave={() => setHovered(false)}
    style={{
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      fontSize: '24px',
      padding: 0,
      lineHeight: 1,
      userSelect: 'none',
      color: hovered ? '#ff69b4' : liked ? 'red' : 'black',
      transition: 'transform 0.2s ease, color 0.3s ease',
      transform: hovered ? 'scale(1.2)' : 'scale(1)'
    }}
  >
    {hovered ? '💗' : liked ? '❤️' : '🤍'}
  </button>

  <button
    onClick={() => {
      const productUrl = `${window.location.origin}/product/${productId}`;
      const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(productUrl)}`;
      window.open(whatsappUrl, '_blank');
    }}
    aria-label="שתף את המוצר בווצאפ"
    onMouseEnter={() => setHoveredShare(true)}
    onMouseLeave={() => setHoveredShare(false)}
    style={{
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      padding: 0,
      lineHeight: 1,
      userSelect: 'none',
      color: hoveredShare ? '#25D366' : 'black',
      transition: 'transform 0.2s ease, color 0.3s ease',
      transform: hoveredShare ? 'scale(1.2)' : 'scale(1)'
    }}
  >
    <WhatsappIcon size={28} color={hoveredShare ? '#25D366' : 'black'} />
  </button>
</div>





  <div className={styles.galleryWrapper}>
  <div className={styles.mainImageContainer}>
    <img
      src={images[lightboxIndex]}
      alt={`${product.name} - תצוגה`}
      onClick={() => setLightboxOpen(true)}
      className={styles.mainImage}
    />
  </div>
  <div className={styles.thumbnailContainer}>
    {images.map((imgSrc, i) => (
      <img
        key={i}
        src={imgSrc}
        alt={`תמונה ${i + 1}`}
        className={`${styles.thumbnail} ${lightboxIndex === i ? styles.active : ''}`}
        onClick={() => setLightboxIndex(i)}
      />
    ))}
  </div>
</div>
{product.videos && product.videos.length > 0 && (
  <section className={styles.videoSection} aria-label="סרטוני וידאו">
  <h2>סרטוני וידאו</h2>
  <div className={styles.videoContainer}>
    {product.videos.map((videoUrl, index) => {
      const isTikTok = videoUrl.includes('tiktok.com');
      return (
        <iframe
          key={index}
          src={videoUrl}
          scrolling="no"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className={isTikTok ? styles.videoIframeTikTok : styles.videoIframeYouTube}
        />
      );
    })}
  </div>
</section>

)}

<a
  href={product.link}
  target="_blank"
  rel="noopener noreferrer"
  className={styles.buyNowButton}
  onClick={async () => {
    try {
      await updateDoc(doc(db, 'products', productId), {
        clicksCount: increment(1),
      });
    } catch (e) {
      console.error('שגיאה בעדכון clicksCount:', e);
    }
  }}
>
  קנה עכשיו
</a>


        {/* לייטבוקס */}
        {lightboxOpen && (
  <div
    onClick={() => setLightboxOpen(false)}
    className={styles.lightboxBackdrop}
  >
    <img
      src={images[lightboxIndex]}
      alt="תמונה מוגדלת"
      className={styles.lightboxImage}
      onClick={e => e.stopPropagation()}
    />
    {images.length > 1 && (
      <>
        <button
          className={styles.lightboxNavLeft}
          onClick={e => {
            e.stopPropagation();
            setLightboxIndex((lightboxIndex - 1 + images.length) % images.length);
          }}
        >
          ‹
        </button>
        <button
          className={styles.lightboxNavRight}
          onClick={e => {
            e.stopPropagation();
            setLightboxIndex((lightboxIndex + 1) % images.length);
          }}
        >
          ›
        </button>
      </>
    )}
  </div>
)}


        {/* ביקורות */}
        <section className="mt-10 w-full text-right" aria-label="ביקורות">
          <h2 className="text-2xl font-semibold mb-4 text-center">ביקורות</h2>

          {loadingReviews ? (
            <p className="text-center">טוען ביקורות...</p>
          ) : (
            <>
              {avgRating ? (
                <p className="mb-4 text-center">דירוג ממוצע: {avgRating} ⭐</p>
              ) : (
                <p className="mb-4 text-center">עדיין אין דירוגים</p>
              )}

              <div className={`${styles.spaceY4} w-full`}>
                {reviews.map(r => (
                  <div
  key={r.id}
  className={`${styles.reviewCard} reviewCard text-right`}
>
  <div className="font-bold">{r.userName}</div>
<div style={{ color: '#ffc107', fontSize: '18px' }}>
  {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}
</div>
<p
  onClick={() => {
    if (r.text.length > 200) toggleReviewExpand(r.id);
  }}
  style={{
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    cursor: r.text.length > 200 ? 'pointer' : 'default',
    userSelect: 'text',
  }}
  aria-expanded={expandedReviews[r.id] ? 'true' : 'false'}
  aria-label={expandedReviews[r.id] ? 'הצג פחות' : 'קרא עוד'}
>
  {expandedReviews[r.id] || r.text.length <= 200
    ? r.text
    : r.text.slice(0, 200) + '...'}
</p>
<small className="text-gray-600">
  {new Date(r.createdAt?.seconds * 1000).toLocaleString('he-IL')}
</small>


                    {user && user.uid === r.userId && (
                      <button
                        onClick={() => deleteReview(r.id)}
                        aria-label="מחק ביקורת"
                        title="מחק ביקורת"
                        className={styles.reviewDeleteBtn}
                      >
                        ✖
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {user ? (
                <form
                  onSubmit={handleReviewSubmit}
                  className="mt-6 text-right w-full"
                  aria-label="טופס הוספת ביקורת"
                >
                  <div className={styles.starRating}>
  דירוג:
  {[1, 2, 3, 4, 5].map(star => (
    <span
      key={star}
      onClick={() => setRating(star)}
      onMouseEnter={() => setHoverRating(star)}
      onMouseLeave={() => setHoverRating(0)}
      style={{
        cursor: 'pointer',
        fontSize: '24px',
        color: (hoverRating || rating) >= star ? '#ffc107' : '#ccc',
        transition: 'color 0.2s ease'
      }}
      aria-label={`${star} כוכבים`}
    >
      ★
    </span>
  ))}
</div>


                  <textarea
                    value={reviewText}
                    onChange={e => setReviewText(e.target.value)}
                    placeholder="כתוב ביקורת..."
                    className={styles.reviewTextarea}
                    rows={4}
                    required
                    aria-required="true"
                  />

                  <button type="submit" className={styles.submitReviewBtn}>
                    שלח
                  </button>
                </form>
              ) : (
                <p className="text-red-600 mt-4 text-center">
                  יש להתחבר כדי לכתוב ביקורת
                </p>
              )}
            </>
          )}
        </section>
    </main>
  </>
);
}