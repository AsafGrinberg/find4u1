import { auth, db } from '../firebase/firebase-config'; // נתאם לנתיב שלך
import { onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc, deleteDoc, getDocs, collection, updateDoc, increment } from 'firebase/firestore';
import Head from 'next/head';
import { useEffect, useState, useRef } from 'react';
import Fuse from 'fuse.js';
import { fetchProducts } from '../lib/products.module';
import Header from '../components/Header';
import Link from 'next/link';

export default function Home() {
  const [products, setProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredProducts, setFilteredProducts] = useState([]);
  const autocompleteRef = useRef(null);
  const [user, setUser] = useState(null);
const [likedProducts, setLikedProducts] = useState(new Set());
const [hoveredProductId, setHoveredProductId] = useState(null);
const [showAutocomplete, setShowAutocomplete] = useState(false);
const [lastVisible, setLastVisible] = useState(null);
const [loadingMore, setLoadingMore] = useState(false);
const [hasMore, setHasMore]       = useState(true);
const observerRef = useRef(null);

async function loadUserLikes(userId) {
  const snapshot = await getDocs(collection(db, 'users', userId, 'likedProducts'));
  const likedSet = new Set();
  snapshot.forEach(doc => likedSet.add(doc.id));
  setLikedProducts(likedSet);
}


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
  } else {
    await setDoc(userLikeRef, {
      productId,
      timestamp: new Date().toISOString(),
    });
    await updateDoc(productRef, { likesCount: increment(1) });
    setLikedProducts(prev => new Set(prev).add(productId));
  }
}
async function loadMoreProducts() {
  if (loadingMore || !hasMore) return;
  setLoadingMore(true);

  const { products: newBatch, lastVisible: newLast } = await fetchProducts({
    limitCount: 20,
    lastDoc: lastVisible,
  });

setProducts(prev => {
  const existingIds = new Set(prev.map(p => p.id));
  const unique = newBatch.filter(p => !existingIds.has(p.id));
  return [...prev, ...unique];
});
setFilteredProducts(prev => {
  const existingIds = new Set(prev.map(p => p.id));
  const unique = newBatch.filter(p => !existingIds.has(p.id));
  return [...prev, ...unique];
});

  setLastVisible(newLast);
  setHasMore(!!newLast);
  setLoadingMore(false);
}

useEffect(() => {
  const loadInitial = async () => {
    const { products: firstBatch, lastVisible } = await fetchProducts({ limitCount: 20 });
    console.log('Products loaded from fetchProducts:', firstBatch);  // <--- הדפסת התוצאות
    setProducts(firstBatch);
    setFilteredProducts(firstBatch);
    setLastVisible(lastVisible);
    setHasMore(!!lastVisible);
  };
  loadInitial();
}, []);

useEffect(() => {
  if (!observerRef.current || !hasMore) return;

  const observer = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) {
      loadMoreProducts();
    }
  });

  observer.observe(observerRef.current);

  return () => {
    if (observerRef.current) observer.unobserve(observerRef.current);
  };
}, [lastVisible, hasMore, loadingMore]);

useEffect(() => {
  const unsubscribe = onAuthStateChanged(auth, (u) => {
    setUser(u);
    if (u) loadUserLikes(u.uid);
    else setLikedProducts(new Set());
  });
  return () => unsubscribe();
}, []);
useEffect(() => {
  window.onLogoClick = () => {
    setSearchTerm('');
    setFilteredProducts(products);
    setShowAutocomplete(false);
  };

  return () => {
    window.onLogoClick = null;
  };
}, [products]);
  useEffect(() => {
    if (products.length === 0) return;

const fuse = new Fuse(products, {
  keys: ['name', 'description'],

      threshold: 0.4,
    });

    if (searchTerm.trim() === '') {
      setFilteredProducts(products);
    } else {
      const results = fuse.search(searchTerm);
      setFilteredProducts(results.map(r => r.item));
    }
  }, [searchTerm, products]);

  return (
    <>
      <Head>
        <title>Find4U</title>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <main className="mainHome" dir="rtl">
        <Header /> {/* כאן אנחנו מציגים את ההדר האמיתי */}

        <p className="welcome-text">🎉 ברוכים הבאים ל-Find4U 🎉</p>
        <p className="subtitle">
          אנחנו מוצאים עבורכם את המוצרים השווים ביותר אחרי שבדקנו אותם
        </p>

        <div className="social-links"></div>

        <p className="subtitle search-text">חפש מוצר:</p>
        <div className="search-container">
  <input
    id="searchInput"
    type="text"
    placeholder="חפש מוצר..."
    dir="rtl"
    autoComplete="off"
    value={searchTerm}
    onChange={e => {
  setSearchTerm(e.target.value);
  setShowAutocomplete(true);
}}
  />
  {searchTerm.trim() !== '' && showAutocomplete && (
  <ul id="autocomplete-list" className="autocomplete-list" ref={autocompleteRef}>
    {filteredProducts.slice(0, 5).map(product => (
      <li
        key={product.id}
        onClick={() => {
          setSearchTerm(product.name);
          setFilteredProducts(products);
          setShowAutocomplete(false); // 👈 זה מה שסוגר את הרשימה!
        }}
        style={{ cursor: 'pointer' }}
      >
        {product.name}
      </li>
    ))}
  </ul>
)}

</div>

<div id="productsGrid" className="grid-container">
  {filteredProducts.map(product => (
  <div key={product.id} className="product-wrapper" style={{ position: 'relative' }}>
    <button
      onClick={(e) => {
        e.preventDefault();
        toggleLike(product.id);
      }}
      aria-label={likedProducts.has(product.id) ? 'הסר מהמועדפים' : 'הוסף למועדפים'}
      onMouseEnter={() => setHoveredProductId(product.id)}
      onMouseLeave={() => setHoveredProductId(null)}
      className="like-button"
      style={{
        position: 'absolute',
        top: 10,
        left: 10,
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        fontSize: '24px',
        padding: 0,
        lineHeight: 1,
        userSelect: 'none',
        zIndex: 10,
        color: hoveredProductId === product.id ? '#ff69b4' : likedProducts.has(product.id) ? 'red' : 'black',
        transition: 'transform 0.2s ease',
        transform: hoveredProductId === product.id ? 'scale(1.2)' : 'scale(1)',
      }}
    >
      {hoveredProductId === product.id ? '💗' : likedProducts.has(product.id) ? '❤️' : '🤍'}
    </button>

<Link href={`/product/${product.id}`} className="grid-item">
  <img src={product.image} alt={product.name} />
  <p className="product-name">{product.name}</p>
  {product.price > 0 && (
    <p className="product-price">{product.price.toFixed(2)} ₪</p>
  )}
</Link>

  </div>
  
))}

</div>

{loadingMore && <p style={{ textAlign: 'center' }}>טוען עוד...</p>}
<div ref={observerRef}></div>


      </main>
    </>
  );
}
