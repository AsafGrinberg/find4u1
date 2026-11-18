// components/ShareButton.js
// שיתוף מוצר בוואטסאפ — הערוץ החזק ביותר בישראל, ובלי עלות.
export default function ShareButton({
  title,
  url,
  label = 'שיתוף',
  className = 'share-btn',
}) {
  const text = `${title || 'מצאתי משהו שווה ב-Find4U'} ${url || ''}`.trim();

  return (
    <a
      href={`https://wa.me/?text=${encodeURIComponent(text)}`}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      aria-label="שיתוף בוואטסאפ"
      title="שיתוף בוואטסאפ"
    >
      <span aria-hidden="true">💬</span>
      <span className="share-btn-label">{label}</span>
    </a>
  );
}
