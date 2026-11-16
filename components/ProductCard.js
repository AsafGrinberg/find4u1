import Link from 'next/link';
import { productHref, formatPrice, discountOf } from '../lib/urls';

export default function ProductCard({ product, liked, onLike }) {
  const price = formatPrice(product.price);
  const original = formatPrice(product.originalPrice);
  const discount = discountOf(product);
  const rating = Number(product.rating);

  return (
    <article className="card">
      <button
        type="button"
        className={`card-like${liked ? ' is-liked' : ''}`}
        aria-label={liked ? 'הסר מהמועדפים' : 'הוסף למועדפים'}
        aria-pressed={liked ? 'true' : 'false'}
        onClick={(event) => {
          event.preventDefault();
          onLike(product.id);
        }}
      >
        {liked ? '♥' : '♡'}
      </button>

      <Link href={productHref(product)} className="card-link">
        <div className="card-media">
          {product.image ? (
            <img src={product.image} alt={product.name} loading="lazy" decoding="async" />
          ) : null}
          {discount ? <span className="card-badge">{discount}%−</span> : null}
        </div>

        <div className="card-body">
          <h3 className="card-title">{product.name}</h3>

          {Number.isFinite(rating) || product.sales ? (
            <div className="card-meta">
              {Number.isFinite(rating) ? (
                <span className="card-rating">★ {rating.toFixed(1)}</span>
              ) : null}
              {product.sales ? (
                <span>{Number(product.sales).toLocaleString('he-IL')} נמכרו</span>
              ) : null}
            </div>
          ) : null}

          <div className="card-price">
            {price ? `${price} ₪` : 'לפרטים'}
            {original && Number(product.originalPrice) > Number(product.price) ? (
              <s>{original} ₪</s>
            ) : null}
          </div>
        </div>
      </Link>

      {product.link ? (
        <a
          href={product.link}
          target="_blank"
          rel="noopener noreferrer sponsored"
          className="card-buy"
        >
          לרכישה מאליאקספרס
          <span aria-hidden="true">←</span>
        </a>
      ) : null}
    </article>
  );
}
