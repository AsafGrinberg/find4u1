import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, collection, getDocs, doc, deleteDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// 🫶 יבוא של setupLikeButton מהסקריפט הראשי שלך
import { setupLikeButton } from "./script.js";

// 🔑 קונפיג שלך
const firebaseConfig = {
  apiKey: "AIzaSyD6o0oDX5ahIw-7E0tUy76ImJDCFWbv4x8",
  authDomain: "find4u-il.firebaseapp.com",
  projectId: "find4u-il",
  storageBucket: "find4u-il.appspot.com",
  messagingSenderId: "1063243167726",
  appId: "1:1063243167726:web:16a8bbaf73ed8181e680ff",
  measurementId: "G-SYR49CZGZZ"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const likedContainer = document.getElementById('likedProductsContainer');

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    // אם אין משתמש מחובר – הפנה לדף הבית
    window.location.href = "index.html";
    return;
  }

  const likesRef = collection(db, `likes_${user.uid}`);
  const snapshot = await getDocs(likesRef);

  if (snapshot.empty) {
    likedContainer.innerHTML = "<p>עדיין לא אהבת מוצרים ❤️</p>";
    return;
  }

  likedContainer.innerHTML = ""; // ריקון התיבה לפני טעינה מחדש

  snapshot.forEach(async (docSnap) => {
    const productData = docSnap.data();   // הנתונים של המוצר
    const docId = docSnap.id;              // מזהה המסמך ב-Firestore
    const productId = productData.id;      // מזהה המוצר מתוך הנתונים

    // צור כרטיס מוצר כמו בעמוד הראשי
// ✅ 1) צור אלמנט עוטף
const gridItem = document.createElement('div');
gridItem.className = 'grid-item';

// ✅ 2) צור קישור פנימי בלבד
const a = document.createElement('a');
a.href = `product.html?id=${productId}`;

const img = document.createElement('img');
img.src = productData.image;
img.alt = productData.title;

const p = document.createElement('p');
p.textContent = productData.title;

a.appendChild(img);
a.appendChild(p);

// ✅ 3) צור כפתור לייק מחוץ ל-a
const likeBtn = document.createElement('button');
likeBtn.className = 'like-btn';

await setupLikeButton(productData, likeBtn);

likeBtn.onclick = async (e) => {
  e.preventDefault();
  const userNow = auth.currentUser;
  if (!userNow) return;

  const docRef = doc(db, `likes_${userNow.uid}`, docId);
  await deleteDoc(docRef);

  // הסרת הכרטיס כולו
  gridItem.remove();

  // בדיקה אם נשארו מוצרים
  if (likedContainer.children.length === 0) {
    likedContainer.innerHTML = "<p>עדיין לא אהבת מוצרים ❤️</p>";
  }
};

// ✅ 4) בנה את הכרטיס נכון
gridItem.appendChild(a);
gridItem.appendChild(likeBtn);

likedContainer.appendChild(gridItem);

  });
});