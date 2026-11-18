import { useEffect, useRef } from 'react';
import Link from 'next/link';

import ProductCard from './ProductCard';
import { categoryHref, categoryLabel } from '../lib/urls';

// שורה אופקית לכל קטגוריה: גלילה בגלגלת העכבר, בגרירת עכבר, במגע (אצבע),
// בחצים ובלחיצה על "הצג עוד" שמובילה לדף הקטגוריה המלא.
export default function CategoryRow({ category, products, likedProducts, onLike }) {
  const trackRef = useRef(null);
  const drag = useRef({ active: false, startX: 0, startScroll: 0, moved: 0 });

  function scrollByPage(direction) {
    const track = trackRef.current;
    if (!track) return;
    const amount = Math.max(Math.round(track.clientWidth * 0.8), 240);
    // ‎1 = אחורה (ימינה ב-RTL), ‎-1 = קדימה (שמאלה ב-RTL).
    track.scrollBy({ left: direction * amount, behavior: 'smooth' });
  }

  // גלגלת העכבר: גלילה אנכית מעל השורה מזיזה אותה אופקית, וכשנגמר המקום
  // האירוע לא נחסם ולכן העמוד ממשיך להיגלל.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return undefined;

    const onWheel = (event) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      if (track.scrollWidth - track.clientWidth < 8) return;

      const before = track.scrollLeft;
      track.scrollBy({ left: -event.deltaY, behavior: 'auto' });
      if (track.scrollLeft !== before) event.preventDefault();
    };

    track.addEventListener('wheel', onWheel, { passive: false });
    return () => track.removeEventListener('wheel', onWheel);
  }, []);

  // גרירת עכבר: לוחצים על השורה וגוררים, כמו בגלילה במגע.
  function onPointerDown(event) {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    const track = trackRef.current;
    if (!track) return;
    drag.current = {
      active: true,
      startX: event.clientX,
      startScroll: track.scrollLeft,
      moved: 0,
    };
  }

  function onPointerMove(event) {
    const state = drag.current;
    if (!state.active) return;
    const track = trackRef.current;
    if (!track) return;

    const dx = event.clientX - state.startX;
    state.moved = Math.max(state.moved, Math.abs(dx));
    if (state.moved < 4) return;

    track.classList.add('is-dragging');
    track.scrollLeft = state.startScroll - dx;
  }

  function endDrag() {
    const track = trackRef.current;
    drag.current.active = false;
    if (track) track.classList.remove('is-dragging');
  }

  // אחרי גרירה לא מפעילים קישור בטעות.
  function onTrackClick(event) {
    if (drag.current.moved > 6) {
      event.preventDefault();
      event.stopPropagation();
      drag.current.moved = 0;
    }
  }

  if (!products || products.length === 0) return null;

  return (
    <section className="cat-row" aria-label={categoryLabel(category)}>
      <div className="cat-row-head">
        <h2 className="cat-row-title">{categoryLabel(category)}</h2>

        <div className="cat-row-actions">
          <Link href={categoryHref(category)} className="cat-row-more">
            הצג עוד
          </Link>

          <button
            type="button"
            className="cat-row-arrow"
            aria-label="חזרה אחורה"
            onClick={() => scrollByPage(1)}
          >
            ›
          </button>

          <button
            type="button"
            className="cat-row-arrow"
            aria-label="הצג את הבאים"
            onClick={() => scrollByPage(-1)}
          >
            ‹
          </button>
        </div>
      </div>

      <div className="cat-row-viewport">
        <div
          className="cat-row-track"
          ref={trackRef}
          dir="rtl"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
          onPointerCancel={endDrag}
          onClickCapture={onTrackClick}
          onDragStart={(event) => event.preventDefault()}
        >
          {products.map((product) => (
            <div className="cat-row-item" key={product.id}>
              <ProductCard
                product={product}
                liked={likedProducts.has(product.id)}
                onLike={onLike}
              />
            </div>
          ))}

          <Link href={categoryHref(category)} className="cat-row-all">
            <span aria-hidden="true">←</span>
            לכל המוצרים
          </Link>
        </div>
      </div>
    </section>
  );
}
