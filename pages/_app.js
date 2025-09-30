import { DarkModeProvider } from '../context/DarkModeContext';
import { useEffect, useState } from 'react';
import '../styles/base.css';
import '../styles/search.css';
import '../styles/grid-products.css';
import '../styles/reviews.css';
import '../styles/profile.css';
import '../styles/lightbox.css';
import '../styles/dark-mode.css';
import '../styles/responsive.css';

import MobileNav from '../components/MobileNav';
import Header from '../components/Header';
import SocialBar from '../components/SocialBar';
import { useRouter } from 'next/router';

export default function App({ Component, pageProps }) {
  const router = useRouter();

  useEffect(() => {
    // שמור אם יש dark class
    const isDark = document.body.classList.contains('dark');

    // אפס רק את הקלאסים של דף ספציפי, אבל תשאיר את ה-dark
    document.body.className = '';

    // אם היה dark mode, תחזיר אותו
    if (isDark) {
      document.body.classList.add('dark');
    }

    // הוסף class לפי הנתיב
    if (router.pathname.startsWith('/product/')) {
      document.body.classList.add('product-page');
    }
  }, [router.pathname]);


  // Detect dark mode for SocialBar
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsDark(document.body.classList.contains('dark') || document.documentElement.getAttribute('data-theme') === 'dark');
      const checkDark = () => {
        setIsDark(document.body.classList.contains('dark') || document.documentElement.getAttribute('data-theme') === 'dark');
      };
      const observer = new window.MutationObserver(checkDark);
      observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      window.addEventListener('themechange', checkDark);
      return () => {
        observer.disconnect();
        window.removeEventListener('themechange', checkDark);
      };
    }
  }, []);

  return (
    <DarkModeProvider>
      <Header />
      <Component {...pageProps} />
      <div className="mobileOnly">
        <MobileNav />
      </div>
      {/* Desktop Social Bar - only show on desktop */}
      <div className="desktopOnly">
        <SocialBar dark={isDark} />
      </div>
    </DarkModeProvider>
  );
}

