import Link from 'next/link';
import styles from './MobileNav.module.css';
import { useRouter } from 'next/router';

const socialLinks = [
  {
    href: 'https://www.tiktok.com/@find4u_il',
    label: 'TikTok',
    svg: (
      <svg width="24" height="24" viewBox="0 0 48 48" fill="none"><path d="M33 6v28a9 9 0 11-9-9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/><path d="M33 6c1.5 4.5 6 7.5 10 7.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
    )
  },
  {
    href: 'https://www.instagram.com/find4u_il/#/',
    label: 'Instagram',
    svg: (
      <svg width="24" height="24" viewBox="0 0 48 48" fill="none"><rect x="8" y="8" width="32" height="32" rx="10" stroke="currentColor" strokeWidth="2.2"/><circle cx="24" cy="24" r="7" stroke="currentColor" strokeWidth="2.2"/><circle cx="33" cy="15" r="2" fill="currentColor"/></svg>
    )
  },
  {
    href: 'https://www.facebook.com/Find4UShopping/',
    label: 'Facebook',
    svg: (
      <svg width="24" height="24" viewBox="0 0 48 48" fill="none"><rect x="8" y="8" width="32" height="32" rx="16" stroke="currentColor" strokeWidth="2.2"/><path d="M28 18h-3a2 2 0 00-2 2v4h5l-1 5h-4v9h-5v-9h-3v-5h3v-3a6 6 0 016-6h3v5z" fill="currentColor"/></svg>
    )
  }
];

export default function MobileNav() {
  const router = useRouter();

  // Detect dark mode
  const isDark = typeof window !== 'undefined' && (document.body.classList.contains('dark') || document.documentElement.getAttribute('data-theme') === 'dark');

  return (
    <nav className={styles.mobileNav}>
      <Link
        href="/"
        className={router.pathname === '/' ? styles.active : ''}
        onClick={e => {
          if (router.pathname === '/') {
            e.preventDefault();
            window.location.reload();
          }
        }}
      >
        <span>🏠<br />בית</span>
      </Link>

      {/* Social icons bar above categories link */}
      {/* כל הקטגוריות */}
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
