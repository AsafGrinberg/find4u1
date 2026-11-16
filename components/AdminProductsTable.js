import { useMemo, useState } from 'react';
import Link from 'next/link';

import { productHref, formatPrice } from '../lib/urls';
import styles from '../styles/AdminTable.module.css';

function categoriesOf(product) {
  const value = product.categories ?? product.category;
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

function dateOf(product) {
  const value = product.createdAt || product.updatedAt;
  if (!value) return null;
  if (typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  return null;
}

export default function AdminProductsTable({
  products,
  loading,
  onEdit,
  onDelete,
}) {
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const allCategories = useMemo(() => {
    const set = new Set();
    products.forEach((product) => {
      categoriesOf(product).forEach((name) => set.add(name));
    });
    return [...set].sort((a, b) => a.localeCompare(b, 'he'));
  }, [products]);

  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();

    return products
      .filter((product) => {
        if (categoryFilter !== 'all') {
          if (!categoriesOf(product).includes(categoryFilter)) return false;
        }
        if (!term) return true;
        return [product.name, product.description, categoriesOf(product).join(' ')]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(term);
      })
      .sort((a, b) => (dateOf(b)?.getTime() || 0) - (dateOf(a)?.getTime() || 0));
  }, [products, query, categoryFilter]);

  return (
    <section className={styles.wrap}>
      <div className={styles.head}>
        <h2 className={styles.title}>
          מוצרים באתר
          <span className={styles.count}>
            {loading ? 'טוען...' : `${rows.length} מתוך ${products.length}`}
          </span>
        </h2>

        <div className={styles.filters}>
          <input
            type="search"
            className={styles.search}
            placeholder="חיפוש לפי שם או תיאור"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />

          <select
            className={styles.select}
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
          >
            <option value="all">כל הקטגוריות</option>
            {allCategories.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.thumbCol}>תמונה</th>
              <th>שם המוצר</th>
              <th>קטגוריות</th>
              <th>מחיר</th>
              <th>לייקים</th>
              <th>נוסף</th>
              <th className={styles.actionsCol}>פעולות</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((product) => {
              const date = dateOf(product);
              return (
                <tr key={product.id}>
                  <td>
                    {product.image ? (
                      <img
                        className={styles.thumb}
                        src={product.image}
                        alt=""
                        loading="lazy"
                      />
                    ) : (
                      <span className={styles.muted}>—</span>
                    )}
                  </td>

                  <td>
                    <div className={styles.nameCell}>
                      <Link href={productHref(product)} className={styles.name}>
                        {product.name || 'ללא שם'}
                      </Link>
                      {product.source ? (
                        <span className={styles.source}>{product.source}</span>
                      ) : null}
                    </div>
                  </td>

                  <td>
                    <div className={styles.categories}>
                      {categoriesOf(product).length === 0 ? (
                        <span className={styles.muted}>—</span>
                      ) : (
                        categoriesOf(product).map((name) => (
                          <span key={name} className={styles.chip}>
                            {name}
                          </span>
                        ))
                      )}
                    </div>
                  </td>

                  <td className={styles.price}>
                    {formatPrice(product.price) ? `${formatPrice(product.price)} ₪` : '—'}
                  </td>

                  <td className={styles.muted}>{product.likesCount || 0}</td>

                  <td className={styles.muted}>
                    {date ? date.toLocaleDateString('he-IL') : '—'}
                  </td>

                  <td>
                    <div className={styles.actions}>
                      {product.link ? (
                        <a
                          href={product.link}
                          target="_blank"
                          rel="noopener noreferrer sponsored"
                          className={styles.linkBtn}
                        >
                          קישור
                        </a>
                      ) : null}
                      <button
                        type="button"
                        className={styles.editBtn}
                        onClick={() => onEdit(product.id)}
                      >
                        עריכה
                      </button>
                      <button
                        type="button"
                        className={styles.deleteBtn}
                        onClick={() => onDelete(product.id)}
                      >
                        מחיקה
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {!loading && rows.length === 0 ? (
              <tr>
                <td colSpan={7} className={styles.empty}>
                  לא נמצאו מוצרים
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
