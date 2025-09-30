// components/HotProducts.js
import { useState, useEffect } from 'react';
import { getHotProducts } from '../lib/hot-products';
import Link from 'next/link';
import styles from '../styles/HotProducts.module.css';

export default function HotProducts() {
  const [hotProducts, setHotProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadHotProducts = async () => {
      try {
        const products = await getHotProducts();
        console.log('Loaded hot products:', products);
        setHotProducts(products);
      } catch (error) {
        console.error('Error loading hot products:', error);
        setHotProducts([]);
      } finally {
        setLoading(false);
      }
    };

    loadHotProducts();
  }, []);

  if (loading) {
    return (
      <div className={styles.hotProductsContainer}>
        <h2 className={styles.sectionTitle}>🔥 מוצרים חמים</h2>
        <div className={styles.loadingContainer}>
          <p>טוען מוצרים חמים...</p>
        </div>
      </div>
    );
  }

  if (hotProducts.length === 0) {
    return null; // Don't show the section if no hot products
  }

  return (
    <div className={styles.hotProductsContainer}>
      <h2 className={styles.sectionTitle}>🔥 מוצרים חמים</h2>
      <div className={styles.scrollContainer}>
        <div className={styles.productsWrapper}>
          {hotProducts.map((product) => {
            const name = product.title || product.name;
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
                        e.target.src = '/assets/images/FIND4ULOGGO.png'; // Fallback image
                      }}
                    />
                    <div className={styles.hotBadge}>🔥</div>
                  </div>
                                     <div className={styles.productInfo}>
                     <h3 className={styles.productName}>{name}</h3>
                     <p className={styles.productPrice}>
                       {price ? `${Number(price).toFixed(2)} ₪` : 'מחיר אינו זמין'}
                     </p>
                     {product.sales && (
                       <p className={styles.productSales}>
                         נמכרו {product.sales} יחידות
                       </p>
                     )}
                   </div>
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
