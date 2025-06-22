// --- הגדר קטגוריה פעילה והחיפוש
let activeCategory = 'all';
let fuse;

// --- Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, deleteDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyD6o0oDX5ahIw-7E0tUy76ImJDCFWbv4x8",
  authDomain: "find4u-il.firebaseapp.com",
  projectId: "find4u-il",
  storageBucket: "find4u-il.appspot.com",
  messagingSenderId: "1063243167726",
  appId: "1:1063243167726:web:16a8bbaf73ed8181e680ff",
  measurementId: "G-SYR49CZGZZ"
};

window.app = initializeApp(firebaseConfig);
window.auth = getAuth(window.app);
window.provider = new GoogleAuthProvider();
window.db = getFirestore(window.app);

// --- טעינת header והפעלת האירועים
window.onload = () => {
  const params = new URLSearchParams(window.location.search);
  activeCategory = params.get("category") || "all";

  fetch('header.html')
    .then(response => response.text())
    .then(data => {
      document.getElementById('header-placeholder').innerHTML = data;
      initHeaderEvents();
      if (document.getElementById('productsGrid')) {
        filterProducts();
      }
      if (document.getElementById('productLikeBtn')) {
        setupLikeButton(window.currentProduct, document.getElementById('productLikeBtn'));
      }
    });
};

function initHeaderEvents() {
  const menuToggle = document.querySelector('.menu-toggle');
  const navCategories = document.getElementById('categoryButtons');

  if (menuToggle && navCategories) {
    menuToggle.addEventListener('click', () => {
      navCategories.classList.toggle('show');
    });
  }

  const googleLoginBtn = document.getElementById("googleLoginBtn");
  const profileMenu = document.getElementById("profileMenu");
  const profileAvatar = document.getElementById("profileAvatar");
  const profileDropdown = document.getElementById("profileDropdown");
  const logoutBtn = document.getElementById("logoutBtn");

  googleLoginBtn?.addEventListener("click", () => {
    signInWithPopup(window.auth, window.provider)
      .then(async (result) => {
        console.log("משתמש התחבר:", result.user);
        filterProducts();
if (window.pendingLikeProduct && window.pendingLikeButton) {
  await setupLikeButton(window.pendingLikeProduct, window.pendingLikeButton);

  const user = window.auth.currentUser;
  const docRef = doc(window.db, `likes_${user.uid}`, `${window.pendingLikeProduct.id}`);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    // אם אין לייק עדיין - צור אחד חדש
    await setDoc(docRef, {
      id: window.pendingLikeProduct.id,
      title: window.pendingLikeProduct.text,
      image: window.pendingLikeProduct.image
    });
    window.pendingLikeButton.innerHTML = '❤️'; // עדכן אייקון
  }

  window.pendingLikeProduct = null;
  window.pendingLikeButton = null;
}

      })
      .catch((error) => {
        console.error(error);
        alert("שגיאה: " + error.message);
      });
  });

  logoutBtn?.addEventListener("click", () => {
    signOut(window.auth).then(() => {
      console.log("התנתקת");
      filterProducts();
    }).catch(console.error);
  });

  onAuthStateChanged(window.auth, (user) => {
    if (user) {
      googleLoginBtn.style.display = "none";
      profileMenu.style.display = "inline-block";
      const displayName = user.displayName || "U";
      profileAvatar.textContent = displayName.charAt(0).toUpperCase();
    } else {
      googleLoginBtn.style.display = "flex";
      profileMenu.style.display = "none";
      profileDropdown.style.display = "none";
    }
  });

  profileAvatar?.addEventListener("click", () => {
    profileDropdown.style.display =
      profileDropdown.style.display === "block" ? "none" : "block";
  });

  window.addEventListener("click", (e) => {
    if (profileMenu && !profileMenu.contains(e.target) && e.target.id !== "googleLoginBtn") {
      profileDropdown.style.display = "none";
    }
  });

  activateCategoryButton();
}

// --- קטגוריות וחיפוש
function activateCategoryButton() {
  const buttons = document.querySelectorAll('#categoryButtons button');
  buttons.forEach(btn => {
    btn.classList.remove('active');
    const btnCategory = btn.getAttribute('onclick').match(/'([^']+)'/)[1];
    if (btnCategory === activeCategory) {
      btn.classList.add('active');
    }
  });
}

function showCategory(category) {
  const isGuidesPage = window.location.pathname.includes('guides.html');
  const isProductPage = window.location.pathname.includes('product.html');
  const isIndexPage = window.location.pathname.includes('index.html') || window.location.pathname.endsWith('/');

  if (category === 'guides') {
    if (!isGuidesPage) {
      window.location.href = 'guides.html?category=guides';
    }
    return;
  }

  if (isGuidesPage || isProductPage) {
    window.location.href = `index.html?category=${category}`;
    return;
  }

  if (isIndexPage) {
    const newUrl = new URL(window.location);
    newUrl.searchParams.set('category', category);
    window.history.pushState({}, '', newUrl);
  }

  activeCategory = category;
  activateCategoryButton();
  document.getElementById('categoryButtons').classList.remove('show');
  filterProducts();
}

window.showCategory = showCategory;

function filterProducts() {
  const input = document.getElementById('searchInput')?.value.trim() || '';

  let filtered = products;

  if (activeCategory !== 'all') {
    filtered = filtered.filter(p => p.category.includes(activeCategory));
  }

  if (input.length > 0) {
    if (!fuse) {
      fuse = new Fuse(filtered, {
        keys: ['text'],
        threshold: 0.4,
        ignoreLocation: true,
        isCaseSensitive: false,
      });
    } else {
      fuse.setCollection(filtered);
    }

    const result = fuse.search(input);
    filtered = result.map(r => r.item);
  }

  displayProducts(filtered);
  showSuggestions(input, filtered);
}

// ✅ פונקציה אוניברסלית ללייק — מתוקנת
export async function setupLikeButton(product, likeBtn) {
  const auth = window.auth;
  const db = window.db;

  const updateIcon = (liked) => {
    likeBtn.innerHTML = liked ? '❤️' : '🤍';
  };

  const refreshLikeStatus = async () => {
    const user = auth.currentUser;
    if (user) {
      const docRef = doc(db, `likes_${user.uid}`, `${product.id}`);
      const docSnap = await getDoc(docRef);
      updateIcon(docSnap.exists());
    } else {
      updateIcon(false);
    }
  };

  onAuthStateChanged(auth, () => {
    refreshLikeStatus();
  });

  likeBtn.onclick = async (e) => {
    e.preventDefault();
    const user = auth.currentUser;
   if (!user) {
  window.pendingLikeProduct = product;
  window.pendingLikeButton = likeBtn;
  const loginBtn = document.getElementById("googleLoginBtn");
  if (loginBtn) {
    loginBtn.click();
  } else {
    alert("אנא התחבר דרך התפריט למעלה :)");
  }
  return;
}


    const docRef = doc(db, `likes_${user.uid}`, `${product.id}`);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      await deleteDoc(docRef);
      updateIcon(false);
    } else {
      await setDoc(docRef, {
        id: product.id,
        title: product.text,
        image: product.image
      });
      updateIcon(true);
    }
  };

  await refreshLikeStatus();
}

async function displayProducts(items) {
  const container = document.getElementById('productsGrid');
  if (!container) return;

  container.classList.add('fade-out');

  setTimeout(async () => {
    container.innerHTML = '';

    if (items.length === 0) {
      container.innerHTML = '<p class="no-results">לא נמצאו מוצרים</p>';
    } else {
      for (const product of items) {
        const a = document.createElement('a');
        a.href = `product.html?id=${product.id}`;
        a.className = 'grid-item';
        a.dataset.category = product.category.join(',');

        const img = document.createElement('img');
        img.src = product.image;
        img.alt = product.alt;

        const p = document.createElement('p');
        p.textContent = product.text;

        const likeBtn = document.createElement('button');
        likeBtn.className = 'like-btn';

        await setupLikeButton(product, likeBtn);

        a.appendChild(img);
        a.appendChild(p);
        a.appendChild(likeBtn);

        container.appendChild(a);
      }
    }

    container.classList.remove('fade-out');
    container.classList.add('fade-in');

    setTimeout(() => {
      container.classList.remove('fade-in');
    }, 400);
  }, 400);
}

function showSuggestions(input, items) {
  const container = document.querySelector('.search-container');
  if (!container) return; // ✅ אין חיפוש? צא מייד

  let list = document.querySelector('.autocomplete-list');
  if (!list) {
    list = document.createElement('ul');
    list.className = 'autocomplete-list';
    container.appendChild(list);
  }
  list.innerHTML = '';

  if (input.length === 0) return;

  const suggestions = items.slice(0, 5);
  suggestions.forEach(item => {
    const li = document.createElement('li');
    li.textContent = item.text;
    li.onclick = () => {
      document.getElementById('searchInput').value = item.text;
      filterProducts();
      list.innerHTML = '';
    };
    list.appendChild(li);
  });
}


document.addEventListener('input', function (event) {
  if (event.target.id === 'searchInput') {
    filterProducts();
  }
});

document.addEventListener('keydown', function (event) {
  if (event.target.id === 'searchInput' && event.key === 'Enter') {
    event.preventDefault();
    filterProducts();
    const list = document.querySelector('.autocomplete-list');
    if (list) list.innerHTML = '';
  }
});
