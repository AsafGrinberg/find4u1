import Link from 'next/link';
import styles from './MobileNav.module.css';
import { useRouter } from 'next/router';

export default function MobileNav() {
  const router = useRouter();

  return (
    <nav className={styles.mobileNav}>
      <Link href="/" className={router.pathname === '/' ? styles.active : ''}>
        <span>🏠<br />בית</span>
      </Link>

      <Link
        href={{
          pathname: '/category',
          query: { cat: 'כל המוצרים' }
        }}
        className={router.pathname === '/category' && router.query.cat === 'כל המוצרים' ? styles.active : ''}
      >
        <span>📂<br />קטגוריות</span>
      </Link>

      <Link href="/search" className={router.pathname === '/search' ? styles.active : ''}>
        <span>🔍<br />חיפוש</span>
      </Link>

      <Link href="/profile" className={router.pathname === '/profile' ? styles.active : ''}>
        <span>👤<br />פרופיל</span>
      </Link>
    </nav>
  );
}
