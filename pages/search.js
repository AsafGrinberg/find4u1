import { useState, useEffect } from 'react';
import Head from 'next/head';
import { fetchProducts } from '../lib/products'; // נניח שזה שם הפונקציה שלך לטעינת מוצרים
import Link from 'next/link';
import styles from '../styles/search.module.css'; // חדש!

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState([]);
  const [filtered, setFiltered] = useState([]);

  useEffect(() => {
    fetchProducts().then(data => setProducts(data));
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setFiltered([]);
      return;
    }
    const q = query.toLowerCase();
    const filteredResults = products.filter(p =>
      p.name.toLowerCase().includes(q) || (p.description && p.description.toLowerCase().includes(q))
    );
    setFiltered(filteredResults);
  }, [query, products]);

  return (<>
  <Head>
    <title>חיפוש מוצרים - Find4U</title>
  </Head>
  <main dir="rtl" className={styles.mainWithHeaderSpacing}>
    <h1 className={styles.pageTitle}>חיפוש מוצרים</h1>

    <input
      type="search"
      className={styles.searchInput}
      placeholder="חפש מוצר..."
      value={query}
      onChange={e => setQuery(e.target.value)}
      aria-label="שדה חיפוש מוצר"
    />

    {filtered.length === 0 && query && <p>לא נמצאו מוצרים מתאימים</p>}

    <ul className={styles.productList}>
      {filtered.map(product => (
        <li key={product.id} className={styles.productItem}>
          <Link href={`/product/${product.id}`} className={styles.productLink}>
            {product.image && (
              <img
                src={product.image}
                alt={product.name}
                className={styles.productImage}
                loading="lazy"
              />
            )}
            <div className={styles.productText}>
              <div className={styles.productName} title={product.name}>
                {product.name}
              </div>
              <p className={styles.productDescription}>
                {product.description ? product.description.split(' ').slice(0, 3).join(' ') + '...' : ''}
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  </main>
</>

  );
}
