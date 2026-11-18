import '../styles/base.css';
import '../styles/search.css';
import '../styles/grid-products.css';
import '../styles/components.css';
import '../styles/profile.css';
import '../styles/lightbox.css';
import '../styles/dark-mode.css';
import '../styles/responsive.css';

import MobileNav from '../components/MobileNav';
import Header from '../components/Header';
import Footer from '../components/Footer';

export default function App({ Component, pageProps }) {
  // מצב הדארק-מוד מנוהל במקום אחד בלבד: components/Header.js
  // הוא גם מוסיף/מסיר class="dark" ל-body ושומר את הבחירה ב-localStorage.
  return (
    <>
      <Header />
      <Component {...pageProps} />
      <Footer />
      <div className="mobileOnly">
        <MobileNav />
      </div>
    </>
  );
}
