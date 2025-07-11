import { useState, useEffect } from 'react';
import { deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase/firebase-config'; // אם לא יובא כבר

function ProfileCards({
  userData,
  likedProductsArray,
  likedProducts,
  toggleLike,
  hoveredProductId,
  setHoveredProductId,
  userReviews,
  loadingLikes,
  loadingReviews,
  handleLogout,
  removeReviewById,
}) {

  const [expandedReviews, setExpandedReviews] = useState({});
function toggleReviewExpand(id) {
  setExpandedReviews(prev => ({
    ...prev,
    [id]: !prev[id],
  }));
}

  const cardStyle = {
    border: '1px solid #ccc',
    borderRadius: 8,
    padding: 20,
    marginBottom: 30,
    background: '#fff',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    textAlign: 'right',
  };

  return (
    <>
      <section style={cardStyle}>
        <h2>פרטים אישיים</h2>
        <p>ברוך הבא, <strong>{userData?.displayName || 'משתמש'}</strong></p>
      </section>

      <section style={cardStyle}>
        <h2>מוצרים שאהבתי</h2>
        {loadingLikes ? (
          <p>טוען...</p>
        ) : likedProductsArray.length === 0 ? (
          <p>לא סימנת לייק עדיין</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 10 }}>
            {likedProductsArray.map(product => (
              <div key={product.id} style={{ position: 'relative', border: '1px solid #ccc', borderRadius: 6, overflow: 'hidden', background: '#fff' }}>
                {/* לייק */}
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    toggleLike(product.id);
                  }}
                  onMouseEnter={() => setHoveredProductId(product.id)}
                  onMouseLeave={() => setHoveredProductId(null)}
                  style={{
                    position: 'absolute',
                    top: 10,
                    left: 10,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 24,
                    color: hoveredProductId === product.id ? '#ff69b4' : likedProducts.has(product.id) ? 'red' : 'black',
                  }}
                >
                  {hoveredProductId === product.id ? '💗' : likedProducts.has(product.id) ? '❤️' : '🤍'}
                </button>

                <a href={`/product/${product.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <img src={product.image} alt={product.name} style={{ width: '100%', height: 200, objectFit: 'cover' }} />
                  <div style={{ padding: 10 }}>
                    <p style={{ margin: 0, fontWeight: 'bold' }}>{product.name}</p>
                    {typeof product.price === 'number' && product.price > 0 && (
                      <p style={{ margin: 0 }}>₪{product.price.toFixed(2)}</p>
                    )}
                  </div>
                </a>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={cardStyle}>
        <h2>הביקורות שלי</h2>
        {loadingReviews ? (
          <p>טוען...</p>
        ) : userReviews.length === 0 ? (
          <p>לא כתבת ביקורות</p>
        ) : (
          <div>
            {userReviews.map((review) => {
              const dateObj = review.createdAt?.toDate ? review.createdAt.toDate() : new Date(review.createdAt);
              const dateStr = dateObj.toLocaleDateString('he-IL');
              const timeStr = dateObj.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
              const stars = '⭐'.repeat(review.rating);
              return (
                <div key={review.id} style={{ border: '1px solid #ccc', borderRadius: 6, padding: 10, marginBottom: 10, background: '#fff', position: 'relative' }}>
                  <div style={{ fontWeight: 'bold' }}>
                    {review.userName || 'משתמש'} - {stars} <a href={`/product/${review.productId}`}>{review.productTitle}</a>
                  </div>
<div style={{
  whiteSpace: 'normal',
  wordWrap: 'break-word',
  overflowWrap: 'break-word',
}}>                
  {expandedReviews[review.id] || review.text.length <= 200
    ? review.text
    : review.text.slice(0, 200) + '...'}
  {review.text.length > 200 && (
    <button
      onClick={() => toggleReviewExpand(review.id)}
      style={{
        color: 'blue',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
        marginLeft: '8px',
        textDecoration: 'underline',
        fontSize: '0.9rem',
      }}
      aria-label={expandedReviews[review.id] ? 'הצג פחות' : 'קרא עוד'}
    >
      {expandedReviews[review.id] ? 'קרא פחות' : 'קרא עוד'}
    </button>
  )}
</div>
                  <div style={{ fontSize: 12, color: '#666', marginTop: 5 }}>{dateStr} בשעה {timeStr}</div>
                  <button
  onClick={async () => {
    if (confirm('למחוק ביקורת?')) {
      try {
        await deleteDoc(doc(db, 'products', review.productId, 'reviews', review.id));
        removeReviewById(review.id);  // כאן מעדכנים את ה־state בפרופיל
      } catch (err) {
        alert('שגיאה: ' + err.message);
      }
    }
  }}
  style={{ position: 'absolute', top: 5, left: 5, background: 'none', border: 'none', fontSize: 18, color: 'red' }}
>
  ×
</button>

                </div>
              );
            })}
          </div>
        )}
      </section>

      <button
        onClick={handleLogout}
        style={{
          backgroundColor: '#c0392b',
          color: 'white',
          border: 'none',
          borderRadius: 5,
          cursor: 'pointer',
          width: '90%',
          maxWidth: 80,
          margin: '40px auto',
          display: 'block',
          padding: '10px 10px',
        }}
      >
        התנתק
      </button>
    </>
  );
}

export default ProfileCards;
