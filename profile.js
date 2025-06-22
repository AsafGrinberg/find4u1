import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

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

  snapshot.forEach(async (docSnap) => {
    const product = docSnap.data();

    // צור כרטיס מוצר כמו בעמוד הראשי
    const a = document.createElement('a');
    a.href = `product.html?id=${product.id}`;
    a.className = 'grid-item';

    const img = document.createElement('img');
    img.src = product.image;
    img.alt = product.title;

    const p = document.createElement('p');
    p.textContent = product.title;

    const likeBtn = document.createElement('button');
    likeBtn.className = 'like-btn';

    // 🫶 להשתמש ב-setupLikeButton הקיים שלך
    await setupLikeButton(product, likeBtn);

    // כשהמשתמש עושה unlike — הסר גם מהפרופיל
    likeBtn.onclick = async (e) => {
      e.preventDefault();
      const userNow = auth.currentUser;
      if (userNow) {
        const wasLiked = likeBtn.innerHTML === '❤️';
        likeBtn.disabled = true; // מניעת לחיצות כפולות
        await setupLikeButton(product, likeBtn); // יוודא סטטוס מעודכן
        if (wasLiked) {
          // אם היה לייק לפני — כלומר עכשיו זה unlike — הסר את המוצר מהתצוגה
          a.remove();
          if (likedContainer.children.length === 0) {
            likedContainer.innerHTML = "<p>עדיין לא אהבת מוצרים ❤️</p>";
          }
        }
      } else {
        alert("יש להתחבר כדי להסיר לייקים");
      }
      likeBtn.disabled = false;
    };

    // הוספת התוכן
    a.appendChild(img);
    a.appendChild(p);
    a.appendChild(likeBtn);

    likedContainer.appendChild(a);
  });
});
