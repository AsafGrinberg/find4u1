import { auth, db } from '../firebase/firebase-config';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc, deleteDoc, getDocs, collection, updateDoc, increment } from 'firebase/firestore';
import Head from 'next/head';
import { useEffect, useState, useRef } from 'react';
import Fuse from 'fuse.js';
import { fetchProducts } from '../lib/products.module';
import Header from '../components/Header';
import Link from 'next/link';
import { fetchAliExpressProducts } from '../lib/aliexpress';

export default function Home() {
  // מצבים (states)
  const [localProducts, setLocalProducts] = useState([]);
  const [aliexpressProducts, setAliExpressProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [user, setUser] = useState(null);
  const [likedProducts, setLikedProducts] = useState(new Set());
  const [hoveredProductId, setHoveredProductId] = useState(null);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [lastVisible, setLastVisible] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const autocompleteRef = useRef(null);
  const observerRef = useRef(null);

  // טעינת מוצרים מ-AliExpress
useEffect(() => {
  console.log("[A] Starting useEffect for AliExpress products");
  console.log("[B] API Key check:", !!process.env.NEXT_PUBLIC_RAPIDAPI_KEY);

  async function loadAliExpressProducts() {
    try {
      console.log("[C] Calling fetchAliExpressProducts...");
      const items = await fetchAliExpressProducts("electronics", 12);
      console.log("[D] Received items:", items);
      
      setAliExpressProducts(items);
      console.log("[E] State updated with AliExpress products");
    } catch (error) {
      console.error("[F] Error in loadAliExpressProducts:", error);
    } finally {
      setLoading(false);
      console.log("[G] Loading state set to false");
    }
  }
  
  if (process.env.NEXT_PUBLIC_RAPIDAPI_KEY) {
    console.log("[H] API Key exists, loading products...");
    loadAliExpressProducts();
  } else {
    console.error("[I] Missing API Key!");
    setLoading(false);
  }
}, []);

  // טעינת מוצרים מהמאגר המקומי
  useEffect(() => {
    const loadInitial = async () => {
      try {
        const { products: firstBatch, lastVisible } = await fetchProducts({ limitCount: 20 });
        setLocalProducts(firstBatch);
        setFilteredProducts(firstBatch);
        setLastVisible(lastVisible);
        setHasMore(!!lastVisible);
      } catch (error) {
        console.error("Failed to load local products:", error);
      }
    };
    loadInitial();
  }, []);

  // טעינת מוצרים אהובים
  async function loadUserLikes(userId) {
    const snapshot = await getDocs(collection(db, 'users', userId, 'likedProducts'));
    const likedSet = new Set();
    snapshot.forEach(doc => likedSet.add(doc.id));
    setLikedProducts(likedSet);
  }

  // ניהול לייקים
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
      setLikedProducts(prev => {
        const newSet = new Set(prev);
        newSet.add(productId);
        return newSet;
      });
    }
  }

  // טעינת מוצרים נוספים
  async function loadMoreProducts() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);

    try {
      const { products: newBatch, lastVisible: newLast } = await fetchProducts({
        limitCount: 20,
        lastDoc: lastVisible,
      });

      setLocalProducts(prev => {
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
    } catch (error) {
      console.error("Failed to load more products:", error);
    } finally {
      setLoadingMore(false);
    }
  }

  // אינטגרציה עם IntersectionObserver לגלילה אינסופית
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

  // מעקב אחר שינוי מצב משתמש
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) loadUserLikes(u.uid);
      else setLikedProducts(new Set());
    });
    return () => unsubscribe();
  }, []);

  // איפוס חיפוש בלחיצה על הלוגו
  useEffect(() => {
    window.onLogoClick = () => {
      setSearchTerm('');
      setFilteredProducts(localProducts);
      setShowAutocomplete(false);
    };

    return () => {
      window.onLogoClick = null;
    };
  }, [localProducts]);

  // חיפוש מוצרים
  useEffect(() => {
    if (localProducts.length === 0 && aliexpressProducts.length === 0) return;

    const allProducts = [...localProducts, ...aliexpressProducts];
    const fuse = new Fuse(allProducts, {
      keys: ['name', 'title', 'description'],
      threshold: 0.4,
    });

    if (searchTerm.trim() === '') {
      setFilteredProducts(allProducts);
    } else {
      const results = fuse.search(searchTerm);
      setFilteredProducts(results.map(r => r.item));
    }
  }, [searchTerm, localProducts, aliexpressProducts]);

  // הצגת טעינה
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <p>טוען מוצרים...</p>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Find4U</title>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <main className="mainHome" dir="rtl">
        <Header />

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
                  key={product.id || product.itemId}
                  onClick={() => {
                    setSearchTerm(product.name || product.title);
                    setShowAutocomplete(false);
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  {product.name || product.title}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div id="productsGrid" className="grid-container">
          {filteredProducts.map(product => (
            <div key={product.id || product.itemId} className="product-wrapper" style={{ position: 'relative' }}>
              {/* כפתור לייק למוצרים מקומיים */}
              {product.id && (
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
              )}

              {product.id ? (
                // מוצר מקומי
                <Link href={`/product/${product.id}`}>
                  <a className="grid-item">
                    <img src={product.image} alt={product.name} />
                    <p className="product-name">{product.name}</p>
                    {product.price > 0 && <p className="product-price">{product.price.toFixed(2)} ₪</p>}
                  </a>
                </Link>
              ) : (
                // מוצר מ-AliExpress
                <div className="grid-item">
                  <img src={product.image} alt={product.title} />
                  <p className="product-name">{product.title}</p>
                  <p className="product-price">${product.price}</p>
                  <a 
                    href={`https://aliexpress.com/item/${product.itemId}.html`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="aliexpress-link"
                  >
                    צפה במוצר ב-AliExpress
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>

        {loadingMore && <p style={{ textAlign: 'center' }}>טוען עוד מוצרים...</p>}
        <div ref={observerRef}></div>
      </main>
    </>
  );
}