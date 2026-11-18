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
            r="10.4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
          />
          <circle cx="8.7" cy="9.9" r="1.5" fill="currentColor" />
          <circle cx="15.3" cy="9.9" r="1.5" fill="currentColor" />
          <path
            d="M7.5 14.2c1.2 2 2.9 3 4.5 3s3.3-1 4.5-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      </span>
    </span>
  );
}
