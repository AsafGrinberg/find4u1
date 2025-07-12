import React, { useState, useEffect, useRef } from 'react';
import { auth, provider } from '../firebase/firebase-config';
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import styles from '../styles/Header.module.css';
import { useRouter } from 'next/router';
import { useDarkMode } from '../context/DarkModeContext';
import Link from 'next/link';
import { FaSun, FaMoon } from 'react-icons/fa';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/firebase-config';

export default function Header() {
  const { isDarkMode, setIsDarkMode } = useDarkMode();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [profileDropdownVisible, setProfileDropdownVisible] = useState(false);
  const [activeCategory, setActiveCategory] = useState('all');
  const [menuOpen, setMenuOpen] = useState(false);
  const dropdownRef = useRef(null);
  const avatarRef = useRef(null);
const menuRef = useRef(null);
const [dynamicCategories, setDynamicCategories] = useState([]);

useEffect(() => {
  async function fetchCategories() {
    try {
      const snapshot = await getDocs(collection(db, 'categories'));
      const cats = snapshot.docs.map(doc => doc.data().name);
      setDynamicCategories(['כל המוצרים', ...cats]);
    } catch (error) {
      console.error("שגיאה בטעינת קטגוריות:", error);
    }
  }

  fetchCategories();
}, []);



  useEffect(() => {
    const categoryFromQuery = router.query.cat || 'all';
    setActiveCategory(categoryFromQuery);

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
    });
    return () => unsubscribe();
  }, [router.query.cat]);

// אפקט להאזנה ללחיצה מחוץ לדרופדאון של הפרופיל
useEffect(() => {
  const handleClickOutside = (event) => {
    if (
      dropdownRef.current &&
      !dropdownRef.current.contains(event.target) &&
      avatarRef.current &&
      !avatarRef.current.contains(event.target)
    ) {
      setProfileDropdownVisible(false);
    }
  };

  document.addEventListener('click', handleClickOutside);
  return () => {
    document.removeEventListener('click', handleClickOutside);
  };
}, []);


// אפקט לסגירת התפריט כשנלחץ מחוץ
useEffect(() => {
  const handleClickOutsideMenu = (event) => {
    if (
      menuRef.current &&
      !menuRef.current.contains(event.target) &&
      !event.target.closest(`.${styles.menuToggle}`)
    ) {
      setMenuOpen(false);
    }
  };

  document.addEventListener('click', handleClickOutsideMenu);
  return () => {
    document.removeEventListener('click', handleClickOutsideMenu);
  };
}, []);

const toggleDarkMode = (enable) => {
  setIsDarkMode(enable);
};



  const handleCategoryClick = (categorySlug) => {
    setActiveCategory(categorySlug);
    router.push(`/category?cat=${categorySlug}`);
    setMenuOpen(false);
  };

  const toggleMenu = () => {
    setMenuOpen(prev => !prev);
  };

  const handleLogin = () => {
    signInWithPopup(auth, provider).catch(console.error);
  };


  const handleLogout = () => {
    signOut(auth).catch(console.error);
  };

  return (
    <header className={styles.stickyHeader}>
      <div className={styles.topBar}>
        <button
          className={styles.menuToggle}
          aria-label="תפריט"
          onClick={toggleMenu}
        >
          ☰
        </button>

        <div className={styles.logoWrapper}>
<Link href="/" legacyBehavior>
  <a
    onClick={(e) => {
      e.preventDefault(); // נבטל ניווט ברירת מחדל
      if (typeof window !== 'undefined') {
        if (router.pathname === '/') {
          // אם אנחנו כבר בדף הבית
          if (typeof window.onLogoClick === 'function') {
            window.onLogoClick(); // נקרא לפונקציה הגלובלית שתאפס
          }
        } else {
          router.push('/'); // אחרת ננווט לדף הבית
        }
      }
    }}
  >
    <img
      src={isDarkMode ? "/assets/images/FIND4ULOGGO-dark.png" : "/assets/images/FIND4ULOGGO.png"}
      alt="Find4U Logo"
      className={styles.logo}
    />
  </a>
</Link>

          <h1 className={styles.siteTitle}>כל מה שחיפשתם במקום אחד</h1>
        </div>

        <div className={styles.actionsWrapper}>
          {!user ? (
            <button className={styles.googleLoginBtn} onClick={handleLogin} aria-label="התחבר עם גוגל">
              <img src="/assets/images/google-Logo.png" alt="Google Logo" />
              <span>התחבר</span>
            </button>
          ) : (
            <div className={styles.profileMenu}>
              <div
                className={styles.profileAvatar}
                onClick={() => setProfileDropdownVisible(!profileDropdownVisible)}
                ref={avatarRef}
              >
                {user.displayName ? user.displayName[0].toUpperCase() : user.email[0].toUpperCase()}
              </div>

              {profileDropdownVisible && (
                <div className={styles.profileDropdown} id="profileDropdown" ref={dropdownRef}>
<button className={styles.dropdownBtn} onClick={() => router.push("/profile")}>
  <i className="fa-solid fa-user"></i>
  <span>הפרופיל שלי</span>
</button>

<button className={styles.dropdownBtn} onClick={() => router.push("/admin")}>
  <i className="fa-solid fa-screwdriver-wrench"></i>
  <span>פאנל אדמין</span>
</button>

<button className={styles.dropdownBtn} onClick={handleLogout}>
  <i className="fa-solid fa-right-from-bracket"></i>
  <span>התנתק</span>
</button>

<button className={styles.dropdownBtn}>
  <div className={styles.darkModeContent}>
    {isDarkMode ? <FaSun size={16} color="orange" /> : <FaMoon size={16} color="black" />}
    <label className={styles.switch}>
      <input
        type="checkbox"
        id="darkModeSwitch"
        onChange={(e) => toggleDarkMode(e.target.checked)}
        checked={isDarkMode}
      />
      <span className={`${styles.slider} ${styles.round}`}></span>
    </label>
  </div>
</button>


                </div>
              )}
            </div>
          )}
        </div>
      </div>
<nav
  ref={menuRef}
  className={`${styles.navCategories} ${menuOpen ? styles.navCategoriesShow : ''}`}
  id="categoryButtons"
>

{dynamicCategories.map((cat) => (
  <button
    key={cat}
    onClick={() => handleCategoryClick(cat)}
    className={`${styles.navCategoriesButton} ${activeCategory === cat ? styles.activeButton : ''}`}
  >
    {cat}
  </button>
))}

      </nav>
    </header>
  );
}
