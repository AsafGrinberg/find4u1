import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

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
    // אם אין משתמש מחובר – מפנה חזרה לדף הבית
    window.location.href = "index.html";
    return;
  }
  if (user) {
    // 🔑 טוען את הלייקים מה-Collection
    const likesRef = collection(db, `likes_${user.uid}`);
    const snapshot = await getDocs(likesRef);

    if (snapshot.empty) {
      likedContainer.innerHTML = "<p>עדיין לא אהבת מוצרים ❤️</p>";
      return;
    }

    snapshot.forEach(doc => {
      const product = doc.data();
      const div = document.createElement('a');
      div.href = `product.html?id=${product.id}`;
      div.className = 'grid-item';
      div.innerHTML = `
        <img src="${product.image}" alt="${product.title}">
        <p>${product.title}</p>
      `;
      likedContainer.appendChild(div);
    });

  } else {
    likedContainer.innerHTML = "<p>עליך להתחבר כדי לראות את המוצרים שאהבת.</p>";
  }
});
