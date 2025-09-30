// components/RecommendedProducts.js
import { useState, useEffect, useRef } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase/firebase-config';
import Link from 'next/link';
import styles from '../styles/RecommendedProducts.module.css';

export default function RecommendedProducts() {
  const [recommendedProducts, setRecommendedProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const scrollContainerRef = useRef(null);

  useEffect(() => {
    const loadRecommendedProducts = async () => {
      try {
        // טוען רק מוצרים שהועלו ידנית דרך האדמין
        const productsRef = collection(db, 'products');
        const q = query(
          productsRef, 
          where('showOnHome', '==', true),
          where('isAliExpress', '!=', true) // לא מוצרי AliExpress
        );
        
        const snapshot = await getDocs(q);
        const products = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })).filter(product => product.name && product.image); // רק מוצרים עם שם ותמונה

        console.log('Loaded recommended products:', products);
        setRecommendedProducts(products);
      } catch (error) {
        console.error('Error loading recommended products:', error);
        setRecommendedProducts([]);
      } finally {
        setLoading(false);
      }
    };

    loadRecommendedProducts();
  }, []);

  const scrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({
        left: -300,
        behavior: 'smooth'
      });
    }
  };

  const scrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({
        left: 300,
        behavior: 'smooth'
      });
    }
  };

  if (loading) {
    return (
      <div className={styles.recommendedContainer}>
        <h2 className={styles.sectionTitle}>⭐ המוצרים המומלצים שלנו</h2>
        <div className={styles.loadingContainer}>
          <div className={styles.loadingSpinner}></div>
          <p>טוען מוצרים מומלצים...</p>
        </div>
      </div>
    );
  }

  if (recommendedProducts.length === 0) {
    return null; // לא מציג את הסקשן אם אין מוצרים מומלצים
  }

  return (
    <div className={styles.recommendedContainer}>
      <h2 className={styles.sectionTitle}>⭐ המוצרים המומלצים שלנו</h2>
      
      <div className={styles.scrollWrapper}>
        <button 
          className={`${styles.scrollButton} ${styles.scrollLeft}`}
          onClick={scrollLeft}
          aria-label="גלול שמאלה"
        >
          ‹
        </button>
        
        <div className={styles.scrollContainer} ref={scrollContainerRef}>
          <div className={styles.productsWrapper}>
            {recommendedProducts.map((product) => {
              const name = product.name;
              const image = product.image;
              const price = product.price;
              const productId = product.id;

              if (!productId || !name || !image) return null;

              return (
                <div key={productId} className={styles.productCard}>
                  <Link href={`/product/${productId}`} className={styles.productLink}>
                    <div className={styles.imageContainer}>
                      <img 
                        src={image} 
                        alt={name} 
                        className={styles.productImage}
                        onError={(e) => {
                          e.target.src = '/assets/images/FIND4ULOGGO.png';
                        }}
                      />
                      <div className={styles.recommendedBadge}>⭐</div>
                    </div>
                    <div className={styles.productInfo}>
                      <h3 className={styles.productName}>{name}</h3>
                      <p className={styles.productPrice}>
                        {price ? `${Number(price).toFixed(2)} ₪` : 'מחיר אינו זמין'}
                      </p>
                      {product.likesCount > 0 && (
                        <p className={styles.productLikes}>
                          ❤️ {product.likesCount} אוהבים
                        </p>
                      )}
                    </div>
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
        
        <button 
          className={`${styles.scrollButton} ${styles.scrollRight}`}
          onClick={scrollRight}
          aria-label="גלול ימינה"
        >
          ›
        </button>
      </div>
    </div>
  );
}
