import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

import { auth, db } from '../firebase/firebase-config';
import { fetchProducts } from '../lib/products.module';
import ProfileCards from '../components/ProfileCards';

export default function Profile() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [likedProducts, setLikedProducts] = useState(new Set());
  const [likedProductsArray, setLikedProductsArray] = useState([]);
  const [userReviews, setUserReviews] = useState([]);
  const [loadingLikes, setLoadingLikes] = useState(true);
  const [loadingReviews, setLoadingReviews] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.push('/');
        return;
      }
      setUser(currentUser);

      try {
        const userRef = doc(db, 'users', currentUser.uid);
        const snapshot = await getDoc(userRef);

        if (snapshot.exists()) {
          setUserData(snapshot.data());
          setIsAdmin(snapshot.data().isAdmin === true);
        } else {
          const fresh = {
            uid: currentUser.uid,
            email: currentUser.email,
            displayName: currentUser.displayName || currentUser.email,
            createdAt: new Date().toISOString(),
            isAdmin: false,
          };
          await setDoc(userRef, fresh);
          setUserData(fresh);
        }
      } catch {
        setUserData({ displayName: currentUser.displayName, email: currentUser.email });
      }

      loadLikedProducts(currentUser.uid).finally(() => setLoadingLikes(false));
      loadUserReviews(currentUser.uid).finally(() => setLoadingReviews(false));
    });

    return () => unsubscribe();
  }, [router]);

  // שאיבת כל המוצרים פעם אחת במקום בקשה נפרדת לכל מוצר שאהבנו.
  async function loadLikedProducts(uid) {
    try {
      const [likedSnapshot, products] = await Promise.all([
        getDocs(collection(db, 'users', uid, 'likedProducts')),
        fetchProducts(),
      ]);
      const byId = new Map(products.map((product) => [product.id, product]));
      const ids = likedSnapshot.docs.map((item) => item.id);

      setLikedProducts(new Set(ids));
      setLikedProductsArray(
        ids.map((id) => byId.get(id)).filter(Boolean)
      );
    } catch {
      setLikedProducts(new Set());
      setLikedProductsArray([]);
    }
  }

  async function loadUserReviews(uid) {
    try {
      const products = await fetchProducts();
      const results = [];

      for (const product of products) {
        const snapshot = await getDocs(
          collection(db, 'products', product.id, 'reviews')
        );
        snapshot.forEach((item) => {
          const data = item.data();
          if (data.userId === uid) {
            results.push({
              id: item.id,
              productId: product.id,
              productTitle: product.name,
              ...data,
            });
          }
        });
      }

      setUserReviews(results);
    } catch {
      setUserReviews([]);
    }
  }

  async function toggleLike(productId) {
    if (!user) return;

    const likeRef = doc(db, 'users', user.uid, 'likedProducts', productId);
    const productRef = doc(db, 'products', productId);

    try {
      if (likedProducts.has(productId)) {
        await deleteDoc(likeRef);
        await updateDoc(productRef, { likesCount: increment(-1) });
        setLikedProducts((previous) => {
          const next = new Set(previous);
          next.delete(productId);
          return next;
        });
        setLikedProductsArray((previous) =>
          previous.filter((product) => product.id !== productId)
        );
      } else {
        await setDoc(likeRef, {
          productId,
          timestamp: new Date().toISOString(),
        });
        await updateDoc(productRef, { likesCount: increment(1) });
        setLikedProducts((previous) => new Set(previous).add(productId));
      }
    } catch {
      // לא חוסמים את המשתמש על מונה לייקים
    }
  }

  function removeReviewById(id) {
    setUserReviews((previous) => previous.filter((review) => review.id !== id));
  }

  async function handleLogout() {
    try {
      await signOut(auth);
      router.push('/');
    } catch {
      // התנתקות נכשלה - נשארים בדף
    }
  }

  return (
    <>
      <Head>
        <title>הפרופיל שלי — Find4U</title>
        <meta name="robots" content="noindex" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <main dir="rtl">
        <div className="page-shell profile-shell">
          <section className="hero profile-hero">
            <h1 className="hero-title">הפרופיל שלי</h1>
            <p className="hero-sub">
              {userData?.displayName
                ? `שלום ${userData.displayName}`
                : 'המוצרים ששמרת והביקורות שכתבת'}
            </p>

            {isAdmin ? (
              <button
                type="button"
                className="profile-admin-btn"
                onClick={() => router.push('/admin')}
              >
                לוח הבקרה לאדמין
              </button>
            ) : null}
          </section>

          <ProfileCards
            userData={userData}
            likedProductsArray={likedProductsArray}
            likedProducts={likedProducts}
            toggleLike={toggleLike}
            userReviews={userReviews}
            loadingLikes={loadingLikes}
            loadingReviews={loadingReviews}
            handleLogout={handleLogout}
            removeReviewById={removeReviewById}
          />
        </div>
      </main>
    </>
  );
}
