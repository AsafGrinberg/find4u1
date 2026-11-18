import styles from '../styles/Logo.module.css';

// הלוגו של Find4U: וורדמארק וקטורי שמתאים את עצמו למצב בהיר וכהה,
// בלי תמונות נפרדות לכל מצב.
export default function Logo({ className = '' }) {
  return (
    <span className={`${styles.wordmark} ${className}`.trim()} aria-hidden="true">
      <span className={styles.find}>Find</span>
      <span className={styles.four}>
        4U
        <svg className={styles.smiley} viewBox="0 0 24 24" focusable="false">
          <circle
            cx="12"
            cy="12"
            r="10"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.8"
          />
          <circle cx="8.6" cy="9.7" r="1.8" fill="currentColor" />
          <circle cx="15.4" cy="9.7" r="1.8" fill="currentColor" />
          <path
            d="M7.2 13.8c1.3 2.2 3.1 3.3 4.8 3.3s3.5-1.1 4.8-3.3"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.8"
            strokeLinecap="round"
          />
        </svg>
      </span>
    </span>
  );
}
