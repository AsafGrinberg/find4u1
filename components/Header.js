import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { collection, getDocs } from 'firebase/firestore';
import { FaMoon, FaSun } from 'react-icons/fa';

import { auth, db, provider } from '../firebase/firebase-config';
import Logo from './Logo';
import { categoryHref, categoryLabel, categorySlug } from '../lib/urls';
import styles from '../styles/Header.module.css';

const ALL_PRODUCTS = 'כל המוצרים';

function readStoredTheme() {
  if (typeof window === 'undefined') return null;
  const stored = window.localStorage.getItem('darkMode');
  if (stored === null) return null;
  return stored === 'true';
}

export default function Header() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [profileDropdownVisible, setProfileDropdownVisible] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [categories, setCategories] = useState([ALL_PRODUCTS]);
  const [darkMode, setDarkMode] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const dropdownRef = useRef(null);
  const avatarRef = useRef(null);
  const menuRef = useRef(null);
  const moreRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    getDocs(collection(db, 'categories'))
      .then((snapshot) => {
        if (cancelled) return;
        const names = snapshot.docs
          .map((item) => item.data().name)
          .filter(Boolean);
        setCategories([ALL_PRODUCTS, ...new Set(names)]);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const applyTheme = (next) => {
      setDarkMode(next);
      if (typeof document === 'undefined') return;
      document.body.classList.toggle('dark', next);
      window.localStorage.setItem('darkMode', next ? 'true' : 'false');
    };

    const stored = readStoredTheme();
    applyTheme(
      stored !== null
        ? stored
        : window.matchMedia('(prefers-color-scheme: dark)').matches
    );
  }, []);

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
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

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
    return () => document.removeEventListener('click', handleClickOutsideMenu);
  }, []);

  // תפריט "עוד קטגוריות" נסגר בלחיצה על רקע האתר, לא רק בלחיצה על הכפתור.
  useEffect(() => {
    if (!moreOpen) return undefined;

    const handleOutside = (event) => {
      if (moreRef.current && !moreRef.current.contains(event.target)) {
        setMoreOpen(false);
      }
    };
    const handleEscape = (event) => {
      if (event.key === 'Escape') setMoreOpen(false);
    };

    document.addEventListener('click', handleOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('click', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [moreOpen]);

  function toggleTheme() {
    const next = !darkMode;
    setDarkMode(next);
    document.body.classList.toggle('dark', next);
    window.localStorage.setItem('darkMode', next ? 'true' : 'false');
  }

  function handleCategoryClick(name) {
    router.push(categoryHref(name));
    setMenuOpen(false);
    setMoreOpen(false);
    setProfileDropdownVisible(false);
  }

  function handleLogin() {
    signInWithPopup(auth, provider).catch(console.error);
  }

  function handleLogout() {
    signOut(auth).catch(console.error);
  }

  const slugParam = router.query.slug
    ? decodeURIComponent(String(router.query.slug))
    : null;
  const activeCategory = slugParam
    ? categories.find((name) => categorySlug(name) === slugParam) || ''
    : router.query.cat || ALL_PRODUCTS;
  // שורת הניווט מציגה קבוצה מצומצמת, וכל השאר נפתח בתפריט "עוד קטגוריות".
  const featuredCategories = categories.slice(0, 8);
  const restCategories = categories.slice(8);

  return (
    <header className={styles.stickyHeader}>
      <div className={styles.topBar}>
        <div className={styles.brandCluster}>
          <button
            type="button"
            className={styles.menuToggle}
            aria-label="תפריט קטגוריות"
            aria-expanded={menuOpen ? 'true' : 'false'}
            onClick={() => setMenuOpen((previous) => !previous)}
          >
            ☰
          </button>

          <Link href="/" className={styles.logoWrapper} aria-label="Find4U — לדף הבית">
            <Logo />
          </Link>
        </div>

        <p className={styles.siteTitle}>כל מה שחיפשתם במקום אחד</p>

        <div className={styles.actionsWrapper}>
          <Link
            href="/feed"
            className={styles.feedLink}
            aria-label="פיד מוצרים"
            title="פיד מוצרים"
          >
            <span aria-hidden="true">▶</span>
            <span className={styles.feedLinkText}>פיד</span>
          </Link>

          <button
            type="button"
            className={styles.iconButton}
            onClick={toggleTheme}
            aria-label={darkMode ? 'עבור למצב בהיר' : 'עבור למצב כהה'}
            title={darkMode ? 'מצב בהיר' : 'מצב כהה'}
          >
            {darkMode ? <FaSun size={15} color="#ffb020" /> : <FaMoon size={15} />}
          </button>

          <Link
            href="/liked"
            className={`${styles.iconButton} ${styles.likedLink}`}
            aria-label="מוצרים שמורים"
            title="מוצרים שמורים"
          >
            ♥
          </Link>

          {!user ? (
            <button
              type="button"
              className={styles.googleLoginBtn}
              onClick={handleLogin}
              aria-label="התחברות עם גוגל"
            >
              <img src="/assets/images/google-Logo.png" alt="" />
              <span>התחברות</span>
            </button>
          ) : (
            <div className={styles.profileMenu}>
              <button
                type="button"
                className={styles.profileAvatar}
                onClick={() => setProfileDropdownVisible((previous) => !previous)}
                ref={avatarRef}
                aria-label="תפריט משתמש"
              >
                {user.displayName
                  ? user.displayName[0].toUpperCase()
                  : user.email[0].toUpperCase()}
              </button>

              {profileDropdownVisible ? (
                <div className={styles.profileDropdown} ref={dropdownRef}>
                  <button
                    className={styles.dropdownBtn}
                    onClick={() => router.push('/profile')}
                  >
                    <i className="fa-solid fa-user" aria-hidden="true" />
                    <span>הפרופיל שלי</span>
                  </button>

                  <button
                    className={styles.dropdownBtn}
                    onClick={() => router.push('/liked')}
                  >
                    <i className="fa-solid fa-heart" aria-hidden="true" />
                    <span>מוצרים שמורים</span>
                  </button>

                  <button
                    className={styles.dropdownBtn}
                    onClick={() => router.push('/admin')}
                  >
                    <i className="fa-solid fa-screwdriver-wrench" aria-hidden="true" />
                    <span>פאנל אדמין</span>
                  </button>

                  <button className={styles.dropdownBtn} onClick={handleLogout}>
                    <i className="fa-solid fa-right-from-bracket" aria-hidden="true" />
                    <span>התנתקות</span>
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <div className={styles.navBar}>
        <nav
          ref={menuRef}
          className={`${styles.navCategories} ${
            menuOpen ? styles.navCategoriesShow : ''
          }`}
          aria-label="קטגוריות"
        >
          {featuredCategories.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => handleCategoryClick(name)}
              className={`${styles.navCategoriesButton} ${
                activeCategory === name ? styles.activeButton : ''
              }`}
            >
              {categoryLabel(name)}
            </button>
          ))}

          {restCategories.length > 0 ? (
            <div className={styles.moreWrap} ref={moreRef}>
              <button
                type="button"
                className={`${styles.navCategoriesButton} ${styles.navMore} ${
                  restCategories.includes(activeCategory) ? styles.activeButton : ''
                }`}
                onClick={() => setMoreOpen((previous) => !previous)}
                aria-expanded={moreOpen ? 'true' : 'false'}
              >
                עוד קטגוריות
                <span aria-hidden="true">{moreOpen ? '▴' : '▾'}</span>
              </button>

              <div
                className={`${styles.navRest} ${
                  moreOpen ? styles.navRestOpen : ''
                }`}
              >
                {restCategories.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => handleCategoryClick(name)}
                    className={`${styles.navRestButton} ${
                      activeCategory === name ? styles.navRestButtonActive : ''
                    }`}
                  >
                    {categoryLabel(name)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
