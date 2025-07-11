import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
  increment,
} from 'firebase/firestore';
import { db, auth } from '../firebase/firebase-config';
import Link from 'next/link';
import { onAuthStateChanged } from 'firebase/auth';
import Head from 'next/head';
import Fuse from 'fuse.js';
import Header from '../components/Header';

export default function CategoryPage() {
  const router = useRouter();
  const { cat } = router.query;

  const [products, setProducts] = useState([]);
  const [user, setUser] = useState(null);
  const [likedProducts, setLikedProducts] = useState(new Set());
  const [hoveredProductId, setHoveredProductId] = useState(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [filteredProducts, setFilteredProducts] = useState([]);
  const autocompleteRef = useRef(null);

  async function loadUserLikes(userId) {
    const snapshot = await getDocs(collection(db, 'users', userId, 'likedProducts'));
    const likedSet = new Set();
    snapshot.forEach(doc => likedSet.add(doc.id));
    setLikedProducts(likedSet);
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) loadUserLikes(u.uid);
      else setLikedProducts(new Set());
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!cat) return;

    const fetchProducts = async () => {
      try {
        let q;
        if (cat === 'כל המוצרים') {
          q = collection(db, 'products');
        } else {
          q = query(
            collection(db, 'products'),
            where('category', 'array-contains', cat)
          );
        }

        const snapshot = await getDocs(q);
        const items = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setProducts(items);
        setFilteredProducts(items);
        setSearchTerm('');
      } catch (error) {
        console.error('שגיאה בטעינת מוצרים:', error);
      }
    };

    fetchProducts();
  }, [cat]);

  useEffect(() => {
    if (products.length === 0) return;

    // כאן מחפשים לפי name ו-description (כמו ב-index.js)  
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

  return (
    <>
      <Head>
        <title>קטגוריה: {cat}</title>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <main dir="rtl">
        <Header />

        <p className="welcome-text">📦 קטגוריה: {cat}</p>

        <div className="search-container">
          <input
            id="searchInput"
            type="text"
            placeholder="חפש מוצר בקטגוריה זו..."
            dir="rtl"
            autoComplete="off"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="search-input"
          />
          {searchTerm.trim() !== '' && (
            <ul className="autocomplete-list" ref={autocompleteRef}>
              {filteredProducts.slice(0, 5).map(product => (
                <li
                  key={product.id}
                  onClick={() => {
                    setSearchTerm(product.name);
                    router.push(`/product/${product.id}`);
                  }}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setSearchTerm(product.name);
                      router.push(`/product/${product.id}`);
                    }
                  }}
                >
                  {product.name}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="grid-container" id="productsGrid">
          {filteredProducts.map(product => (
            <div
              key={product.id}
              className="product-wrapper"
              style={{ position: 'relative' }}
            >
              <button
                onClick={(e) => {
                  e.preventDefault();
                  toggleLike(product.id);
                }}
                aria-label={likedProducts.has(product.id) ? 'הסר מהמועדפים' : 'הוסף למועדפים'}
                onMouseEnter={() => setHoveredProductId(product.id)}
                onMouseLeave={() => setHoveredProductId(null)}
                className="like-btn"
                style={{
                  color: hoveredProductId === product.id ? '#ff69b4' : undefined,
                  transform: hoveredProductId === product.id ? 'scale(1.2)' : 'scale(1)',
                  transition: 'transform 0.2s ease',
                }}
              >
                {hoveredProductId === product.id ? '💗' : likedProducts.has(product.id) ? '❤️' : '🤍'}
              </button>

              <Link href={`/product/${product.id}`} className="grid-item">
                <img
                  src={product.image}
                  alt={product.name}
                  loading="lazy"
                />

                <p>{product.name}</p>

              </Link>
            </div>
          ))}
        </div>
      </main>
    </>
  );
}
