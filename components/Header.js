import { useState, useEffect, useRef } from 'react';
import { auth, provider } from '../firebase/firebase-config';
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { useRouter } from 'next/router';
import { useDarkMode } from '../context/DarkModeContext';
import Link from 'next/link';
import { FaSun, FaMoon, FaUser, FaCog, FaSignOutAlt } from 'react-icons/fa';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/firebase-config';
import styles from '../styles/components/Header.module.css';

export default function Header() {
  const { isDarkMode, setIsDarkMode } = useDarkMode();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [profileDropdownVisible, setProfileDropdownVisible] = useState(false);
  const [activeCategory, setActiveCategory] = useState('all');
  const [menuOpen, setMenuOpen] = useState(false);
  const [dynamicCategories, setDynamicCategories] = useState([]);
  const dropdownRef = useRef(null);
  const avatarRef = useRef(null);
  const menuButtonRef = useRef(null);
  const menuRef = useRef(null);

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

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target) &&
          avatarRef.current && !avatarRef.current.contains(event.target)) {
        setProfileDropdownVisible(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleClickOutsideMenu = (event) => {
      if (menuRef.current && 
          !menuRef.current.contains(event.target) && 
          !menuButtonRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutsideMenu);
    return () => document.removeEventListener('click', handleClickOutsideMenu);
  }, []);

  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    document.body.classList.toggle('dark', newMode);
  };

  const handleCategoryClick = (categorySlug) => {
    setActiveCategory(categorySlug);
    router.push(`/category?cat=${encodeURIComponent(categorySlug)}`);
    setMenuOpen(false);
  };

  const handleLogin = () => {
    signInWithPopup(auth, provider).catch(console.error);
  };

  const handleLogout = () => {
    signOut(auth).catch(console.error);
    setProfileDropdownVisible(false);
  };

  const navigateToProfile = () => {
    router.push("/profile");
    setProfileDropdownVisible(false);
  };

  const navigateToAdmin = () => {
    router.push("/admin");
    setProfileDropdownVisible(false);
  };

  return (
    <header className={`${styles.stickyHeader} ${isDarkMode ? styles.dark : ''}`}>
      <div className={styles.topBar}>
        <button
          ref={menuButtonRef}
          className={styles.menuToggle}
          aria-label="תפריט"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-expanded={menuOpen}
        >
          {menuOpen ? '✕' : '☰'}
        </button>

        <div className={styles.logoWrapper}>
          <Link href="/" passHref legacyBehavior>
            <a className={styles.logoLink}>
              <img
                src={isDarkMode ? "/assets/images/FIND4ULOGGO-dark.png" : "/assets/images/FIND4ULOGGO.png"}
                alt="Find4U Logo"
                className={styles.logo}
              />
            </a>
          </Link>
          <h1 className={styles.siteTitle}>
            כל מה שחיפשתם<br />במקום אחד
          </h1>
        </div>

        <div className={styles.actionsWrapper}>
          {!user ? (
            <button 
              className={styles.googleLoginBtn} 
              onClick={handleLogin} 
              aria-label="התחבר עם גוגל"
            >
              <img src="/assets/images/google-Logo.png" alt="Google Logo" />
              <span>התחבר</span>
            </button>
          ) : (
            <div className={styles.profileMenu} ref={avatarRef}>
              <div
                className={styles.profileAvatar}
                onClick={() => setProfileDropdownVisible(!profileDropdownVisible)}
                aria-expanded={profileDropdownVisible}
              >
                {user.displayName?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase()}
              </div>

              {profileDropdownVisible && (
                <div className={styles.profileDropdown} ref={dropdownRef}>
                  <button 
                    className={styles.dropdownBtn} 
                    onClick={navigateToProfile}
                  >
                    <FaUser className={styles.dropdownIcon} />
                    <span>הפרופיל שלי</span>
                  </button>
                  <button 
                    className={styles.dropdownBtn} 
                    onClick={navigateToAdmin}
                  >
                    <FaCog className={styles.dropdownIcon} />
                    <span>פאנל אדמין</span>
                  </button>
                  <button 
                    className={styles.dropdownBtn} 
                    onClick={handleLogout}
                  >
                    <FaSignOutAlt className={styles.dropdownIcon} />
                    <span>התנתק</span>
                  </button>
                  <div className={styles.darkModeContainer}>
                    <div className={styles.darkModeToggle}>
                      <div className={styles.darkModeContent}>
                        {isDarkMode ? 
                          <FaSun className={styles.darkModeIcon} /> : 
                          <FaMoon className={styles.darkModeIcon} />
                        }
                        <span>{isDarkMode ? 'מצב בהיר' : 'מצב כהה'}</span>
                        <label className={styles.switch}>
                          <input
                            type="checkbox"
                            checked={isDarkMode}
                            onChange={toggleDarkMode}
                            className={styles.darkModeInput}
                          />
                          <span className={styles.slider}></span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <nav
        ref={menuRef}
        className={`${styles.navCategories} ${menuOpen ? styles.navCategoriesShow : ''}`}
        aria-hidden={!menuOpen}
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