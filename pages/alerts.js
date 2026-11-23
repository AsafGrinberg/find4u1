import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, getDocs } from 'firebase/firestore';

import { auth, db } from '../firebase/firebase-config';
import { fetchProducts } from '../lib/products.module';
import { fetchProductsServer } from '../lib/firestore-server';
import { readGuestLikes } from '../lib/likes';
import {
  categoriesOf,
  dedupeProducts,
  formatPrice,
  goHref,
  priceDropped,
  productHref,
  productUrl,
  withoutUnavailable,
  SITE_URL,
} from '../lib/urls';
import ShareButton from '../components/ShareButton';

const ALERT_STORE = 'f4u:alerted';

function readAlerted() {
  try {
    return JSON.parse(window.localStorage.getItem(ALERT_STORE) || '{}') || {};
  } catch {
    return {};
  }
}

function writeAlerted(value) {
  try {
    window.localStorage.setItem(ALERT_STORE, JSON.stringify(value));
  } catch {
    // מצב פרטי בדפדפן — פשוט לא נשמור.
  }
}

export async function getServerSideProps() {
  const products = await fetchProductsServer();
  const drops = withoutUnavailable(dedupeProducts(products))
    .filter(priceDropped)
    .sort((a, b) => (b.previousPrice - b.price) - (a.previousPrice - a.price))
    .slice(0, 60);

  return { props: { initialDrops: drops }, revalidate: 300 };
}

export default function AlertsPage({ initialDrops = [] }) {
  const [drops, setDrops] = useState(initialDrops);
  const [savedIds, setSavedIds] = useState(new Set());
  const [permission, setPermission] = useState('default');

  useEffect(() => {
    let cancelled = false;

    fetchProducts().then((data) => {
      if (cancelled || !data.length) return;
      const fromClient = withoutUnavailable(dedupeProducts(data))
        .filter(priceDropped)
        .sort((a, b) => (b.previousPrice - b.price) - (a.previousPrice - a.price))
        .slice(0, 60);
      if (fromClient.length) setDrops(fromClient);
    });

    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermission(window.Notification.permission);
    }

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setSavedIds(readGuestLikes());

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) return;
      try {
        const snapshot = await getDocs(
          collection(db, 'users', currentUser.uid, 'likedProducts')
        );
        setSavedIds((previous) => {
          const next = new Set(previous);
          snapshot.docs.forEach((item) => next.add(item.id));
          return next;
        });
      } catch {
        // אם אין הרשאה — נשארים עם השמירות המקומיות.
      }
    });
    return () => unsubscribe();
  }, []);

  const myDrops = useMemo(
    () => drops.filter((product) => savedIds.has(product.id)),
    [drops, savedIds]
  );

  // התראה בדפדפן על מוצר ששמרתם שירד במחיר — פעם ביום לכל מוצר.
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (window.Notification.permission !== 'granted') return;
    if (myDrops.length === 0) return;

    const today = new Date().toISOString().slice(0, 10);
    const alerted = readAlerted();
    let changed = false;

    myDrops.slice(0, 3).forEach((product) => {
      if (alerted[product.id] === today) return;
      const price = formatPrice(product.price);
      try {
        new window.Notification('ירידת מחיר ב-Find4U', {
          body: `${product.name} — עכשיו ${price} ₪`,
          tag: `f4u-${product.id}`,
        });
      } catch {
        return;
      }
      alerted[product.id] = today;
      changed = true;
    });

    if (changed) writeAlerted(alerted);
  }, [myDrops]);

  async function enableNotifications() {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    const result = await window.Notification.requestPermission();
    setPermission(result);
  }

  return (
    <>
      <Head>
        <title>התראות ירידת מחיר — Find4U</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta
          name="description"
          content="כל המוצרים שמחירם ירד, כולל מוצרים ששמרתם. התראה בדפדפן כשמחיר יורד."
        />
        <link rel="canonical" href={`${SITE_URL}/alerts`} />
      </Head>

      <main dir="rtl">
        <div className="page-shell">
          <nav className="breadcrumb-row" aria-label="ניווט">
            <Link href="/">בית</Link>
            <span aria-hidden="true">/</span>
            <span>התראות ירידת מחיר</span>
          </nav>

          <section className="hero">
            <p className="hero-eyebrow">🔔 התראות</p>
            <h1 className="hero-title">המחיר ירד</h1>
            <p className="hero-sub">
              מוצרים ששמרתם, ומוצרים שנכנסו למבצע. שווה לבדוק שוב.
            </p>

            {permission !== 'granted' && permission !== 'denied' ? (
              <div className="alerts-action">
                <button type="button" className="alerts-btn" onClick={enableNotifications}>
                  🔔 הפעל התראות בדפדפן
                </button>
                <span>נעדכן אתכם כשמוצר ששמרתם יורד במחיר.</span>
              </div>
            ) : null}
          </section>

          {myDrops.length > 0 ? (
            <section className="section">
              <div className="section-head">
                <h2 className="section-title">מוצרים ששמרתם ירדו במחיר</h2>
                <span className="section-count">{myDrops.length} מוצרים</span>
              </div>
              <div className="alerts-list">
                {myDrops.map((product) => (
                  <AlertRow key={product.id} product={product} highlighted />
                ))}
              </div>
            </section>
          ) : null}

          <section className="section">
            <div className="section-head">
              <h2 className="section-title">כל ירידות המחיר</h2>
              <span className="section-count">{drops.length} מוצרים</span>
            </div>

            {drops.length === 0 ? (
              <div className="empty-state">
                <strong>אין ירידות מחיר כרגע</strong>
                נחזור לבדוק את המחירים בשעה הקרובה.
              </div>
            ) : (
              <div className="alerts-list">
                {drops.map((product) => (
                  <AlertRow key={product.id} product={product} />
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  );
}

function AlertRow({ product, highlighted }) {
  const price = formatPrice(product.price);
  const previous = formatPrice(product.previousPrice);
  const drop = Math.round(
    ((Number(product.previousPrice) - Number(product.price)) /
      Number(product.previousPrice)) *
      100
  );

  return (
    <article className={`alert-row${highlighted ? ' alert-row--saved' : ''}`}>
      <Link href={productHref(product)} className="alert-media">
        {product.image ? (
          <Image
            src={product.image}
            alt={product.name || 'מוצר'}
            fill
            sizes="96px"
            style={{ objectFit: 'cover' }}
          />
        ) : null}
      </Link>

      <div className="alert-body">
        <Link href={productHref(product)} className="alert-title">
          {product.name}
        </Link>
        <span className="alert-meta">{categoriesOf(product)[0] || ''}</span>
        <div className="alert-prices">
          <b>{price} ₪</b>
          {previous ? <s>{previous} ₪</s> : null}
          {drop > 0 ? <span className="alert-drop">↓ {drop}%</span> : null}
        </div>
      </div>

      <div className="alert-actions">
        {product.link ? (
          <a
            href={goHref(product)}
            target="_blank"
            rel="noopener noreferrer sponsored"
            className="card-buy alert-buy"
          >
            לרכישה
          </a>
        ) : null}
        <ShareButton
          title={product.name}
          url={productUrl(product)}
          label=""
          className="card-share"
        />
      </div>
    </article>
  );
}
