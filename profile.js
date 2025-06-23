import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, collection, getDocs, doc, deleteDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { setupLikeButton } from "./script.js";
import { products } from './products.module.js';

// 🔑 הקונפיג שלך
const firebaseConfig = {
  apiKey: "AIzaSyCwpXCeGMYK10KvU8JJ5uES5DJSG0Sq6jU",
  authDomain: "find4u-il-aefd0.firebaseapp.com",
  projectId: "find4u-il-aefd0",
  storageBucket: "find4u-il-aefd0.firebasestorage.app",
  messagingSenderId: "387851265240",
  appId: "1:387851265240:web:ff3692945470dcab31a3ad"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const likedContainer = document.getElementById('likesGrid');

// 🆕 אלמנטים חדשים לפרופיל
const userNameEl = document.getElementById('userName');
const userPhotoEl = document.getElementById('userPhoto');
const logoutInsideBtn = document.getElementById('logoutInsideBtn');

// ✅ מאזין למצב התחברות
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }
// ✅ אחרי שטענת את הלייקים
loadMyReviews(user);

  // 🆕 מראה שם ותמונה
  if (userNameEl) userNameEl.textContent = user.displayName || "משתמש";
  if (userPhotoEl) userPhotoEl.src = user.photoURL || "https://via.placeholder.com/120";

  // ✅ ממשיך בדיוק כמו בקוד שלך
  const likesRef = collection(db, `likes_${user.uid}`);
  const snapshot = await getDocs(likesRef);

  if (snapshot.empty) {
    likedContainer.innerHTML = "<p>עדיין לא אהבת מוצרים ❤️</p>";
    return;
  }

  likedContainer.innerHTML = "";

  snapshot.forEach(async (docSnap) => {
    const productData = docSnap.data();
    const docId = docSnap.id;
    const productId = productData.id;

    const gridItem = document.createElement('div');
    gridItem.className = 'grid-item';

    const a = document.createElement('a');
    a.href = `product.html?id=${productId}`;

    const img = document.createElement('img');
    img.src = productData.image;
    img.alt = productData.title;

    const p = document.createElement('p');
    p.textContent = productData.title;

    a.appendChild(img);
    a.appendChild(p);

    const likeBtn = document.createElement('button');
    likeBtn.className = 'like-btn';

    await setupLikeButton(productData, likeBtn);

    likeBtn.onclick = async (e) => {
      e.preventDefault();
      const userNow = auth.currentUser;
      if (!userNow) return;

      const docRef = doc(db, `likes_${userNow.uid}`, docId);
      await deleteDoc(docRef);

      gridItem.remove();

      if (likedContainer.children.length === 0) {
        likedContainer.innerHTML = "<p>עדיין לא אהבת מוצרים ❤️</p>";
      }
    };

    gridItem.appendChild(a);
    gridItem.appendChild(likeBtn);

    likedContainer.appendChild(gridItem);
  });
});

// ✅ כפתור התנתקות בתוך הפרופיל
if (logoutInsideBtn) {
  logoutInsideBtn.addEventListener('click', () => {
    signOut(auth).then(() => {
      window.location.href = "index.html";
    });
  });
}
// ✅ פונקציה חדשה - טוענת ביקורות שכתבת
async function loadMyReviews(user) {
  const reviewsContainer = document.getElementById('reviewsGrid');
  if (!reviewsContainer) return;

  reviewsContainer.innerHTML = "<p>טוען ביקורות...</p>";

  const myReviews = [];

for (const product of window.products) {
  const reviewsRef = collection(db, `reviews_${product.id}`);
  const snapshot = await getDocs(reviewsRef);

  snapshot.forEach(docSnap => {
    const data = docSnap.data();
    if (data.userId === user.uid) {
      myReviews.push({
        ...data,
        productTitle: product.text
      });
    }
  });
}

  if (myReviews.length === 0) {
    reviewsContainer.innerHTML = "<p>לא כתבת ביקורות עדיין.</p>";
    return;
  }

  reviewsContainer.innerHTML = "";

  myReviews.forEach(r => {
    const div = document.createElement('div');
    div.className = "review-card";
    const stars = "⭐".repeat(r.rating);

    div.innerHTML = `
      <div class="review-header">${stars} - ${r.productTitle}</div>
      <div class="review-text">${r.text}</div>
    `;

    reviewsContainer.appendChild(div);
  });
}
