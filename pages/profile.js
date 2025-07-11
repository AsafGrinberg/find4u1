// pages/profile.js
import { useState, useEffect } from 'react';
import { auth, db } from '../firebase/firebase-config';
import { onAuthStateChanged } from 'firebase/auth';
import { signOut } from 'firebase/auth';
import { doc, getDoc, collection, getDocs, deleteDoc, setDoc } from 'firebase/firestore';
import { useRouter } from 'next/router';
import { updateDoc, increment } from 'firebase/firestore';
import Tabs from '../components/ProfileCards';

export default function Profile() {
  const router = useRouter();

  // States
  const [likedProductsArray, setLikedProductsArray] = useState([]);
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
const [likedProducts, setLikedProducts] = useState(new Set());
  const [userReviews, setUserReviews] = useState([]);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingLikes, setLoadingLikes] = useState(true);
  const [loadingReviews, setLoadingReviews] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
const [hoveredProductId, setHoveredProductId] = useState(null);

async function toggleLike(productId) {
  if (!user) {
    alert('אנא התחבר כדי לעשות לייק למוצר');
    return;
  }

  const userLikeRef = doc(db, 'users', user.uid, 'likedProducts', productId);
  const productRef = doc(db, 'products', productId);

  if (likedProducts.has(productId)) {
    await deleteDoc(userLikeRef);
    await updateDoc(productRef, { likesCount: increment(-1) });
    setLikedProducts(prev => {
      const newSet = new Set(prev);
      newSet.delete(productId);
      return newSet;
    });
    setLikedProductsArray(prev => prev.filter(p => p.id !== productId));
  } else {
    await setDoc(userLikeRef, {
      productId,
      timestamp: new Date().toISOString(),
    });
    await updateDoc(productRef, { likesCount: increment(1) });
    setLikedProducts(prev => new Set(prev).add(productId));
    // לא צריך להוסיף למערך כי זה פרופיל, מוצרים מגיעים מ־loadLikedProducts
  }
}


  // Helper to load user profile data
  async function loadUserProfileData(user) {
    const userDocRef = doc(db, "users", user.uid);
    const userDocSnap = await getDoc(userDocRef);
    if (userDocSnap.exists()) {
      const data = userDocSnap.data();
      setUserData(data);
      setIsAdmin(data.isAdmin === true);
    } else {
      // Create user doc if missing
      await setDoc(userDocRef, {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || user.email,
        createdAt: new Date().toISOString(),
        isAdmin: false,
      });
      setUserData({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || user.email,
        isAdmin: false,
      });
      setIsAdmin(false);
    }
  }

  // Load liked products
async function loadLikedProducts(uid) {
  const likedSnapshot = await getDocs(collection(db, 'users', uid, 'likedProducts'));
  const likedSet = new Set();
  const productsArray = [];

  for (const docSnap of likedSnapshot.docs) {
    const productId = docSnap.id;
    likedSet.add(productId);
    const productDoc = await getDoc(doc(db, 'products', productId));
    if (productDoc.exists()) {
      productsArray.push({ id: productDoc.id, ...productDoc.data() });
    }
  }

  setLikedProducts(likedSet);
  setLikedProductsArray(productsArray); // ניצור state חדש למוצרים עצמם
}




  // Load user reviews
  async function loadUserReviews(uid) {
    const reviews = [];
    const productsSnapshot = await getDocs(collection(db, 'products'));
    for (const productDoc of productsSnapshot.docs) {
      const reviewsRef = collection(db, 'products', productDoc.id, 'reviews');
      const reviewsSnap = await getDocs(reviewsRef);
      reviewsSnap.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.userId === uid) {
          reviews.push({
            id: docSnap.id,
            productId: productDoc.id,
            productTitle: productDoc.data().name,
            ...data,
          });
        }
      });
    }
    setUserReviews(reviews);
  }
function removeReviewById(id) {
  setUserReviews(prev => prev.filter(review => review.id !== id));
}

  // Sign out handler
  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push('/');
    } catch (err) {
      alert("שגיאה בהתנתקות: " + err.message);
    }
  };

  // On mount: listen to auth changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push('/');
        return;
      }
      setUser(user);
      await loadUserProfileData(user);
      setLoadingProfile(false);

      await loadLikedProducts(user.uid);
      setLoadingLikes(false);

      await loadUserReviews(user.uid);
      setLoadingReviews(false);
    });
    return () => unsubscribe();
  }, [router]);

  return (
<main style={{ paddingTop: '160px', maxWidth: 800, margin: 'auto', textAlign: 'center' }}>
  {loadingProfile ? (
    <p>טוען פרופיל...</p>
  ) : (
    <>
      {isAdmin && (
        <button
          style={{
            backgroundColor: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: 5,
            cursor: 'pointer',
            marginBottom: 10,
            padding: '10px 20px',
          }}
          onClick={() => router.push('/admin')}
        >
          לוח בקרה לאדמין
        </button>
      )}

      <h1>הפרופיל שלי</h1>

      {/* טאבים */}
      <Tabs
        userData={userData}
        likedProductsArray={likedProductsArray}
        likedProducts={likedProducts}
        toggleLike={toggleLike}
        hoveredProductId={hoveredProductId}
        setHoveredProductId={setHoveredProductId}
        userReviews={userReviews}
        loadingLikes={loadingLikes}
        loadingReviews={loadingReviews}
        handleLogout={handleLogout}
          removeReviewById={removeReviewById}   // הוסף פה
      />
    </>
  )}
</main>
  );
}
