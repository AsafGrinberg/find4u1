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
  >
    קנה עכשיו
  </a> {/* <-- חשוב לסגור את תג ה-a */}

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