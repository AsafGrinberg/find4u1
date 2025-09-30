import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebase/firebase-config';
import { doc, setDoc, deleteDoc, getDocs, collection, updateDoc, increment, getDoc } from 'firebase/firestore';
import Head from 'next/head';
import { useEffect, useState, useRef } from 'react';
import Fuse from 'fuse.js';
import { fetchProducts } from '../lib/products';
import Header from '../components/Header';
import Link from 'next/link';
import { fetchAliExpressProducts } from '../lib/aliexpress';
import HotProducts from '../components/HotProducts';
import RecommendedProducts from '../components/RecommendedProducts';

import { useMemo } from 'react';

export default function Home() {
  const [selectedProductId, setSelectedProductId] = useState(null);
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
  // סינון וסידור מתקדם
  const [sortType, setSortType] = useState('newest');
  const filteredAndSortedProducts = useMemo(() => {
    let arr = [...filteredProducts];
    switch (sortType) {
      case 'priceLow':
        arr.sort((a, b) => (a.price || 0) - (b.price || 0));
        break;
      case 'priceHigh':
        arr.sort((a, b) => (b.price || 0) - (a.price || 0));
        break;
      case 'clicks':
        arr.sort((a, b) => (b.clicksCount || 0) - (a.clicksCount || 0));
        break;
      case 'likes':
        arr.sort((a, b) => (b.likesCount || 0) - (a.likesCount || 0));
        break;
      case 'hot':
        arr = arr.filter(p => p.isHot);
        break;
      case 'newest':
      default:
        arr.sort((a, b) => {
          const aTime = a.addedAt?.getTime ? a.addedAt.getTime() : 0;
          const bTime = b.addedAt?.getTime ? b.addedAt.getTime() : 0;
          return bTime - aTime;
        });
        break;
    }
    return arr;
  }, [filteredProducts, sortType]);
  
  // מוצרים להצגה בדף הראשי - רק מוצרי AliExpress
  const homeProducts = [
    ...localProducts,
    ...aliexpressProducts
  ].sort((a, b) => {
    const aTime = a.addedAt?.getTime ? a.addedAt.getTime() : 0;
    const bTime = b.addedAt?.getTime ? b.addedAt.getTime() : 0;
    return bTime - aTime;
  });

  useEffect(() => {
    console.log("Home products to display:", homeProducts);
  }, [homeProducts]);

  // טעינת מוצרים מ-AliExpress
  useEffect(() => {
    async function loadAliExpressProducts() {
      try {
        const items = await fetchAliExpressProducts("electronics", 12);
        const aliWithSource = (Array.isArray(items) ? items : []).map(item => ({ 
          ...item, 
          source: 'aliexpress', 
          showOnHome: true,
          price: item.price ? parseFloat(item.price.replace(' ₪', '')) : 0
        }));
        console.log("AliExpress products loaded:", aliWithSource);
        setAliExpressProducts(aliWithSource);
      } catch (error) {
        console.error("Error loading AliExpress products:", error);
      } finally {
        setLoading(false);
      }
    }
    loadAliExpressProducts();
  }, []);

  // טעינת מוצרים מהמאגר המקומי
  useEffect(() => {
    const loadInitial = async () => {
      try {
        const { products: firstBatch, lastVisible } = await fetchProducts({ limitCount: 20 });
        console.log("Local products loaded:", firstBatch);
        const localWithSource = firstBatch.map(p => ({
          ...p,
          source: 'manual',
          showOnHome: p.showOnHome !== undefined ? p.showOnHome : true
        }));
        setLocalProducts(localWithSource);
        setLastVisible(lastVisible);
        setHasMore(!!lastVisible);
      } catch (error) {
        console.error("Failed to load local products:", error);
      } finally {
        setLoading(false);
      }
    };
    loadInitial();
  }, []);

  // טעינת לייקים של המשתמש
  async function loadUserLikes(userId) {
    const snapshot = await getDocs(collection(db, 'users', userId, 'likedProducts'));
    const likedSet = new Set();
    snapshot.forEach(doc => likedSet.add(doc.id));
    setLikedProducts(likedSet);
  }

  // ניהול לייקים
  async function toggleLike(productId) {
    // Support forceLike for post-login
    const isForceLike = arguments.length > 1 ? arguments[1] : false;
    if (!user && !isForceLike) {
      window.localStorage.setItem('pendingLikeProductId', productId);
      import('../firebase/firebase-config').then(({ auth, provider }) => {
        import('firebase/auth').then(({ signInWithPopup }) => {
          signInWithPopup(auth, provider).catch(console.error);
        });
      });
      return;
    }
    // If user is still null, abort (shouldn't happen, but for safety)
    if (!user) return;

    const userLikeRef = doc(db, 'users', user.uid, 'likedProducts', productId);
    const productRef = doc(db, 'products', productId);

    try {
      const liked = await getDoc(userLikeRef);
      if (liked.exists()) {
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
    } catch (error) {
      console.error("Error managing like:", error);
    }
  }

  // טעינת מוצרים נוספים
  async function loadMoreProducts() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);

    try {
      const { products: newBatch, lastVisible: newLast } = await fetchProducts({ limitCount: 20, lastDoc: lastVisible });
      const newBatchWithSource = newBatch.map(p => ({
        ...p,
        source: 'manual',
        showOnHome: p.showOnHome !== undefined ? p.showOnHome : true
      }));
      setLocalProducts(prev => [...prev, ...newBatchWithSource]);
      setLastVisible(newLast);
      setHasMore(!!newLast);
      console.log("Loaded more products:", newBatchWithSource);
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
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        await loadUserLikes(u.uid);
        // Check for pending like after login
        const pendingLike = window.localStorage.getItem('pendingLikeProductId');
        if (pendingLike) {
          await toggleLike(pendingLike, true); // forceLike=true
          window.localStorage.removeItem('pendingLikeProductId');
        }
      } else {
        setLikedProducts(new Set());
      }
    });
    return () => unsubscribe();
  }, []);

  // חיפוש מוצרים
  useEffect(() => {
    if (localProducts.length === 0 && aliexpressProducts.length === 0) return;

    const allProducts = [...localProducts, ...aliexpressProducts];
    const fuse = new Fuse(allProducts, {
      keys: ['title', 'description'],
      threshold: 0.4,
    });

    if (searchTerm.trim() === '') {
      setFilteredProducts(allProducts);
    } else {
      const results = fuse.search(searchTerm);
      setFilteredProducts(results.map(r => r.item));
    }
  }, [searchTerm, localProducts, aliexpressProducts]);

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
        <title>Find4U - מוצרים מומלצים וחמים</title>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content="Find4U - האתר המוביל למציאת מוצרים איכותיים במחירים הטובים ביותר. מוצרים מומלצים, חמים וחדשים מדי יום." />
        <meta name="keywords" content="מוצרים, קניות, מחירים, מומלצים, חמים, אלקטרוניקה, אופנה, בית, גינה, מטבח, ספורט, צעצועים, יופי, רכב, משרד" />
        <meta property="og:title" content="Find4U - מוצרים מומלצים וחמים" />
        <meta property="og:description" content="גלה את המוצרים הטובים ביותר במחירים הטובים ביותר" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://find4u.co.il" />
        <link rel="canonical" href="https://find4u.co.il" />
      </Head>

      <main className="mainHome" dir="rtl">
        <Header />

        <div className="hero-section">
          <h1 className="welcome-text">🎉 ברוכים הבאים ל-Find4U 🎉</h1>
          <p className="subtitle">
            אנחנו מוצאים עבורכם את המוצרים השווים ביותר אחרי שבדקנו אותם
          </p>
        </div>

        {/* מוצרים מומלצים בחלק העליון */}
        <RecommendedProducts />

        <div className="search-section" style={{textAlign: 'center'}}>
          <h2 className="search-title" style={{textAlign: 'center', fontWeight: 'bold', fontSize: '1.3rem'}}>🔍 חפש מוצר:</h2>

          {/* סינון מתקדם */}
          <div style={{display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 16, flexWrap: 'wrap'}}>
            <select onChange={e => setSortType(e.target.value)} defaultValue="newest" style={{padding: 8, borderRadius: 8}}>
              <option value="newest">החדשים ביותר</option>
              <option value="priceLow">מחיר: מהנמוך לגבוה</option>
              <option value="priceHigh">מחיר: מהגבוה לנמוך</option>
              <option value="clicks">הנמכרים ביותר (קליקים)</option>
              <option value="likes">הכי אהובים (לייקים)</option>
              <option value="hot">מוצרים חמים</option>
            </select>
          </div>

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
                setSelectedProductId(null);
                if (e.target.value.trim() === '') {
                  setFilteredProducts([...localProducts, ...aliexpressProducts]);
                }
              }}
            />
            {searchTerm.trim() !== '' && showAutocomplete && (
              <ul id="autocomplete-list" className="autocomplete-list" ref={autocompleteRef}>
                {[...localProducts, ...aliexpressProducts].filter(p => {
                  const name = p.title || p.name || '';
                  return name.includes(searchTerm);
                }).slice(0, 5).map(product => {
                  const name = product.title || product.name;
                  const productId = product.id;
                  return (
                    <li
                      key={productId}
                      onClick={() => {
                        setSearchTerm(name);
                        setShowAutocomplete(false);
                        setSelectedProductId(productId);
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      {name}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* מוצרי AliExpress */}
        {/* סידור וסינון מוצרים */}
        {filteredAndSortedProducts.length > 0 && (
          <div className="products-section">
            <h2 className="section-title" style={{textAlign: 'center', fontWeight: 'bold', fontSize: '1.3rem'}}>🛍️ מוצרים חדשים</h2>
            <div id="productsGrid" className="grid-container">
              {(selectedProductId
                ? filteredAndSortedProducts.filter(product => product.id === selectedProductId)
                : filteredAndSortedProducts
              ).map(product => {
                const isAli = product.source === 'aliexpress';
                const productId = product.id;
                const name = product.title || product.name;
                const image = product.image;
                const price = product.price;

                if (!productId || !name || !image) return null;

                return (
                  <div key={productId} className="product-wrapper" style={{ position: 'relative' }}>
                    {!isAli && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          toggleLike(productId);
                        }}
                        aria-label={likedProducts.has(productId) ? 'הסר מהמועדפים' : 'הוסף למועדפים'}
                        onMouseEnter={() => setHoveredProductId(productId)}
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
                          color: hoveredProductId === productId ? '#ff69b4' : likedProducts.has(productId) ? 'red' : 'black',
                          transition: 'transform 0.2s ease',
                          transform: hoveredProductId === productId ? 'scale(1.2)' : 'scale(1)',
                        }}
                      >
                        {hoveredProductId === productId ? '💗' : likedProducts.has(productId) ? '❤️' : '🤍'}
                      </button>
                    )}

                    {isAli ? (
                      <a
                        href={product.affiliateUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="grid-item"
                      >
                        <img src={image} alt={name} onError={(e) => { e.target.src = '/assets/images/FIND4ULOGGO.png'; }} />
                        <div className="product-info">
                          <p className="product-name">{name}</p>
                          <p className="product-price">לחץ לפרטים</p>
                        </div>
                      </a>
                    ) : (
                      <Link href={`/product/${productId}`} className="grid-item">
                        <img src={image} alt={name} onError={(e) => { e.target.src = '/assets/images/FIND4ULOGGO.png'; }} />
                        <div className="product-info">
                          <p className="product-name">{name}</p>
                          <p className="product-price">{price ? `${Number(price).toFixed(2)} ₪` : 'מחיר אינו זמין'}</p>
                        </div>
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

  {loadingMore && <p style={{ textAlign: 'center' }}>טוען עוד מוצרים...</p>}
  <div ref={observerRef}></div>

  {/* מוצרים חמים בחלק התחתון */}
  <HotProducts />
      </main>
    </>
  );
}