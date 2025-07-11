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

export default function App({ Component, pageProps }) {
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    if (isDarkMode) {
      document.body.classList.add('dark');
    } else {
      document.body.classList.remove('dark');
    }
  }, [isDarkMode]);

  return (
    <>
      <Header isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />
      <Component {...pageProps} />
      <div className="mobileOnly">
        <MobileNav />
      </div>
    </>
  );
}
