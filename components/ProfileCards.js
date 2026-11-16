import { useState } from 'react';
import Link from 'next/link';
import { deleteDoc, doc } from 'firebase/firestore';

import { db } from '../firebase/firebase-config';
import { productHref, formatPrice } from '../lib/urls';

function Stars({ value }) {
  const filled = Math.max(0, Math.min(5, Number(value) || 0));
  return (
    <span className="profile-stars" aria-label={`${filled} מתוך 5`}>
      {'★'.repeat(filled)}
      <span className="profile-stars-empty">{'★'.repeat(5 - filled)}</span>
    </span>
  );
}

export default function ProfileCards({
  userData,
  likedProductsArray,
  likedProducts,
  toggleLike,
  userReviews,
  loadingLikes,
  loadingReviews,
  handleLogout,
  removeReviewById,
}) {
  const [expandedReviews, setExpandedReviews] = useState({});

  return (
    <>
      <section className="profile-card">
        <div className="profile-card-head">
          <h2>פרטים אישיים</h2>
        </div>
        <div className="profile-details">
          <div className="profile-detail">
            <span className="profile-detail-label">שם</span>
            <span className="profile-detail-value">
              {userData?.displayName || 'משתמש'}
            </span>
          </div>
          <div className="profile-detail">
            <span className="profile-detail-label">אימייל</span>
            <span className="profile-detail-value">{userData?.email || '—'}</span>
          </div>
        </div>
      </section>

      <section className="profile-card">
        <div className="profile-card-head">
          <h2>מוצרים שמורים</h2>
          <span className="profile-card-count">
            {loadingLikes ? 'טוען...' : `${likedProductsArray.length} מוצרים`}
          </span>
        </div>

        {loadingLikes ? (
          <p className="profile-muted">טוען מוצרים...</p>
        ) : likedProductsArray.length === 0 ? (
          <p className="profile-muted">
            עדיין לא שמרת מוצרים. לחצו על הלב בכל כרטיס מוצר והוא יופיע כאן.
          </p>
        ) : (
          <div className="profile-liked-grid">
            {likedProductsArray.map((product) => (
              <article key={product.id} className="profile-liked">
                <button
                  type="button"
                  className="profile-liked-remove"
                  onClick={() => toggleLike(product.id)}
                  aria-label="הסר מהמוצרים השמורים"
                  title="הסר מהמוצרים השמורים"
                >
                  {likedProducts.has(product.id) ? '♥' : '♡'}
                </button>

                <Link href={productHref(product)} className="profile-liked-link">
                  {product.image ? (
                    <img src={product.image} alt={product.name} loading="lazy" />
                  ) : null}
                  <div className="profile-liked-body">
                    <h3>{product.name}</h3>
                    {formatPrice(product.price) ? (
                      <span className="profile-liked-price">
                        {formatPrice(product.price)} ₪
                      </span>
                    ) : null}
                  </div>
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="profile-card">
        <div className="profile-card-head">
          <h2>הביקורות שלי</h2>
          <span className="profile-card-count">
            {loadingReviews ? 'טוען...' : `${userReviews.length} ביקורות`}
          </span>
        </div>

        {loadingReviews ? (
          <p className="profile-muted">טוען ביקורות...</p>
        ) : userReviews.length === 0 ? (
          <p className="profile-muted">עדיין לא כתבת ביקורות.</p>
        ) : (
          <div className="profile-review-list">
            {userReviews.map((review) => {
              const date = review.createdAt?.toDate
                ? review.createdAt.toDate()
                : new Date(review.createdAt);
              const text = review.text || '';
              const expanded = expandedReviews[review.id];
              const isLong = text.length > 200;

              return (
                <article key={review.id} className="profile-review">
                  <div className="profile-review-head">
                    <Link
                      href={`/product/${encodeURIComponent(review.productId)}`}
                      className="profile-review-product"
                    >
                      {review.productTitle}
                    </Link>
                    <Stars value={review.rating} />
                  </div>

                  <p className="profile-review-text">
                    {expanded || !isLong ? text : `${text.slice(0, 200)}...`}
                    {isLong ? (
                      <button
                        type="button"
                        className="profile-review-more"
                        onClick={() =>
                          setExpandedReviews((previous) => ({
                            ...previous,
                            [review.id]: !previous[review.id],
                          }))
                        }
                      >
                        {expanded ? 'הצג פחות' : 'קרא עוד'}
                      </button>
                    ) : null}
                  </p>

                  <div className="profile-review-foot">
                    <span>
                      {Number.isNaN(date.getTime())
                        ? ''
                        : date.toLocaleDateString('he-IL')}
                    </span>
                    <button
                      type="button"
                      className="profile-review-delete"
                      onClick={async () => {
                        if (!confirm('למחוק את הביקורת?')) return;
                        try {
                          await deleteDoc(
                            doc(db, 'products', review.productId, 'reviews', review.id)
                          );
                          removeReviewById(review.id);
                        } catch {
                          // מחיקה נכשלה - הביקורת נשארת ברשימה
                        }
                      }}
                    >
                      מחיקה
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <button type="button" className="profile-logout" onClick={handleLogout}>
        התנתקות
      </button>
    </>
  );
}
