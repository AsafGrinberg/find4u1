import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  auth,
  db,
  collection,
  getDocs,
  doc,
  deleteDoc,
  addDoc,
  updateDoc,
  onAuthStateChanged,
  query,
  where,
} from '../firebase/firebase-config';
import * as XLSX from 'xlsx'; // 📦 ייבוא לייצוא לאקסל
import { CLOUDINARY_UPLOAD_PRESET, CLOUDINARY_API_URL } from '../lib/script';
import { Timestamp } from 'firebase/firestore';
// Removed AliExpress automations

import SocialBar from '../components/SocialBar';
import { getAdminEmails, addAdmin, removeAdmin, countProductsByAdmin } from '../lib/admin-control';

// בדיקת משתמש אדמין לפי מייל
// בדיקת משתמש אדמין לפי מייל
// פונקציה לא בשימוש, כל הבדיקות נעשות לפי adminEmails
function isAdminUser(user) {
  return user?.email === 'asafg999@gmail.com';
}

export default function AdminPage() {
  // Declare user and activeTab first so they are available for all logic/hooks
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('form');
  const MAIN_ADMIN_EMAIL = "asafg999@gmail.com";
  const [adminEmails, setAdminEmails] = useState([MAIN_ADMIN_EMAIL]);

  useEffect(() => {
    console.log('Loaded admins:', adminEmails, 'Current user:', user?.email);
  }, [adminEmails, user]);
  // ...existing code...

  // ...existing code...
  useEffect(() => {
    import('../lib/admin-control').then(({ getAdminEmails }) => {
      getAdminEmails().then(emails => {
        // Always include MAIN_ADMIN_EMAIL
        const allAdmins = [MAIN_ADMIN_EMAIL, ...emails.filter(e => e !== MAIN_ADMIN_EMAIL)];
        setAdminEmails(allAdmins);
      });
    });
  }, []);
  const isMainAdmin = user && user.email === MAIN_ADMIN_EMAIL;
  const isAdmin = user && (adminEmails.includes(user.email) || isMainAdmin);

  // --- Admin Management State & Logic ---
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [adminProductCounts, setAdminProductCounts] = useState({});
  const [loadingAdmins, setLoadingAdmins] = useState(false);

  const loadAdmins = useCallback(async () => {
    setLoadingAdmins(true);
    const emails = await getAdminEmails();
    // Always include MAIN_ADMIN_EMAIL
    const allAdmins = [MAIN_ADMIN_EMAIL, ...emails.filter(e => e !== MAIN_ADMIN_EMAIL)];
    setAdminEmails(allAdmins);
    // Count products for each admin
    const counts = {};
    for (const email of allAdmins) {
      counts[email] = await countProductsByAdmin(email);
    }
    setAdminProductCounts(counts);
    setLoadingAdmins(false);
  }, []);

  useEffect(() => {
    if (activeTab === 'admins' && user?.email === 'asafg999@gmail.com') {
      loadAdmins();
    }
  }, [activeTab, user]);

  const handleAddAdmin = async () => {
    const email = newAdminEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      showStatus('יש להזין מייל תקין', true);
      return;
    }
    if (adminEmails.includes(email)) {
      showStatus('האדמין כבר קיים', true);
      return;
    }
    await addAdmin(email);
    setNewAdminEmail('');
    showStatus('אדמין נוסף בהצלחה!', false);
    await loadAdmins();
  };

  const handleRemoveAdmin = async (email) => {
    if (window.confirm(`האם להסיר את האדמין ${email}?`)) {
      await removeAdmin(email);
      showStatus('אדמין הוסר בהצלחה!', false);
      await loadAdmins();
    }
  };
  const [categorySearch, setCategorySearch] = useState('');
  const [productId, setProductId] = useState('');
  const [productName, setProductName] = useState('');
  const [productDescription, setProductDescription] = useState('');
  const [productLink, setProductLink] = useState('');
  const [productPrice, setProductPrice] = useState('');
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [mainImageFile, setMainImageFile] = useState(null);
  const [mainImagePreviewUrl, setMainImagePreviewUrl] = useState('');
  const [galleryImageFiles, setGalleryImageFiles] = useState([]);
  const [galleryImagePreviews, setGalleryImagePreviews] = useState([]);
  const [videoEmbedUrls, setVideoEmbedUrls] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentEditingProduct, setCurrentEditingProduct] = useState(null);
  // רפרנסים לקבצי תמונה
  const mainImageFileInputRef = useRef();
  const galleryImageFileInputRef = useRef();
  // פונקציות עזר להעלאת תמונות
  const handleMainImageChange = (e) => {
    const file = e.target.files[0];
    setMainImageFile(file);
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setMainImagePreviewUrl(reader.result);
      reader.readAsDataURL(file);
    } else {
      setMainImagePreviewUrl('');
    }
  };
  const handleGalleryImagesChange = (e) => {
    const files = Array.from(e.target.files);
    setGalleryImageFiles(files);
    const previews = files.map(file => {
      const reader = new FileReader();
      return new Promise(resolve => {
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
    });
    Promise.all(previews).then(setGalleryImagePreviews);
  };
  const removeGalleryImage = (index) => {
    setGalleryImageFiles(prev => prev.filter((_, i) => i !== index));
    setGalleryImagePreviews(prev => prev.filter((_, i) => i !== index));
  };
  // סטייט למשתמש והטאב הפעיל כבר הוגדרו למעלה
  // בדיקת התחברות והאם המשתמש אדמין
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
    });
    return () => unsubscribe();
  }, []);
  const [allProducts, setAllProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  // סטייט לחיפוש וסינון קטגוריה
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  // טוען מוצרים מה-DB
  const loadProducts = useCallback(async () => {
    setLoadingProducts(true);
    const snapshot = await getDocs(collection(db, 'products'));
    const products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    setAllProducts(products);
    setLoadingProducts(false);
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);
  // סטייט להודעות סטטוס בטופס
  const [formStatusMessage, setFormStatusMessage] = useState('');
  const [formStatusIsError, setFormStatusIsError] = useState(false);

  // פונקציה להצגת הודעת סטטוס
  const showStatus = useCallback((msg, isError = false) => {
    setFormStatusMessage(msg);
    setFormStatusIsError(isError);
    // נעלם אוטומטית אחרי 4 שניות
    setTimeout(() => setFormStatusMessage(''), 4000);
  }, []);
  // טוען קטגוריות מה-DB
  const loadCategories = useCallback(async () => {
    const snapshot = await getDocs(collection(db, 'categories'));
    const cats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    setCategories(cats);
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);
  const [categories, setCategories] = useState([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  // Detect dark mode (dynamic)
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === 'undefined') return false;
    return document.body.classList.contains('dark') || document.documentElement.getAttribute('data-theme') === 'dark';
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const checkDark = () => {
      setIsDark(document.body.classList.contains('dark') || document.documentElement.getAttribute('data-theme') === 'dark');
    };
    // MutationObserver for class/data-theme changes
    const observer = new window.MutationObserver(checkDark);
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    window.addEventListener('themechange', checkDark); // in case you trigger custom event
    return () => {
      observer.disconnect();
      window.removeEventListener('themechange', checkDark);
    };
  }, []);

  const mainBg = isDark ? '#23243a' : '#f5f5f5';
  const cardBg = isDark ? '#23243a' : 'white';
  const cardText = isDark ? '#eee' : '#333';
  const cardShadow = isDark ? '0 4px 12px rgba(0,0,0,0.3)' : '0 4px 12px rgba(0,0,0,0.1)';
  const borderColor = isDark ? '#333' : '#e1e5e9';
  const inputBg = isDark ? '#23243a' : '#f8f9fa';
  const inputText = isDark ? '#eee' : '#333';
  const inputBorder = isDark ? '#444' : '#e1e5e9';
  const tabBg = isDark ? '#23243a' : 'white';
  const tabText = isDark ? '#eee' : '#666';
  const tabActiveBg = '#0070f3';
  const tabActiveText = 'white';
  const statusErrorBg = '#dc3545';
  const statusSuccessBg = '#28a745';
  const statusText = 'white';
  const tableHeaderBg = isDark ? '#23243a' : '#f8f9fa';
  const tableHeaderText = isDark ? '#eee' : '#333';
  // כפתורים
  const buttonBg = isDark ? '#0070f3' : '#0070f3';
  const buttonText = 'white';
  const buttonDangerBg = isDark ? '#dc3545' : '#dc3545';
  const buttonSecondaryBg = isDark ? '#444' : '#e1e5e9';
  const buttonSuccessBg = isDark ? '#28a745' : '#28a745';
  const buttonExportBg = isDark ? '#6c63ff' : '#0070f3';
  // חם
  const hotBg = isDark ? '#ff5722' : '#ffe0b2';
  const hotText = isDark ? 'white' : '#d84315';
  // גבול טבלה
  const tableBorder = isDark ? '#444' : '#dee2e6';
  // פונקציה נפרדת להמרת לינק רגיל ללינק שותפים
  const convertToAffiliateLink = async (url) => {
    if (url && url.includes('aliexpress.com')) {
      try {
        const resp = await fetch('/api/aliexpress-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url })
        });
        if (resp.ok) {
          const data = await resp.json();
          console.log('[aliexpress-link API]', data);
          if (data.affiliateUrl) return data.affiliateUrl;
        } else {
          console.warn('Affiliate link API response not ok:', await resp.text());
        }
      } catch (err) {
        console.warn('Affiliate link conversion failed:', err);
      }
    }
    return url;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
  // המרה אוטומטית של לינק רגיל ללינק שותפים
  let affiliateLink = await convertToAffiliateLink(productLink);
  console.log('[convertToAffiliateLink] input:', productLink, 'output:', affiliateLink);
  // לא מציג שגיאה אם הלינק לא הומר – שומר את הלינק המקורי (כולל לינק מקוצר)
  let mainImageUrl = '';
  let galleryUrls = [];

      // Auto-fetch images from AliExpress affiliate link if no images provided
      if (!mainImageFile && galleryImageFiles.length === 0 && affiliateLink) {
        let uploaded = [];
        let triedOriginalLink = false;
        let imageFetchLink = affiliateLink;
        for (let attempt = 0; attempt < 2; attempt++) {
          const resp = await fetch('/api/ali-images-by-link', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ affiliateUrl: imageFetchLink })
          });
          if (resp.ok) {
            const data = await resp.json();
            console.log('[AliExpress Images API Response]', data);
            const urlsToUpload = [];
            if (data.mainImage) urlsToUpload.push(data.mainImage);
            if (Array.isArray(data.gallery)) urlsToUpload.push(...data.gallery.slice(0, 8));

            for (const src of urlsToUpload) {
              const fd = new FormData();
              if (typeof src === 'string' && src.startsWith('http')) {
                const imgResp = await fetch(src);
                const imgBlob = await imgResp.blob();
                fd.append('file', imgBlob, 'image.jpg');
              } else {
                fd.append('file', src);
              }
              fd.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
              const uploadResp = await fetch(CLOUDINARY_API_URL, {
                method: 'POST',
                body: fd
              });
              if (uploadResp.ok) {
                const up = await uploadResp.json();
                uploaded.push(up.secure_url);
                console.log('[Cloudinary uploaded]', up.secure_url);
              } else {
                console.warn('Cloudinary upload failed for URL:', src, await uploadResp.text());
              }
            }
          } else {
            console.warn('AliExpress Images API failed:', await resp.text());
          }

          // אם לא התקבלו תמונות מה-API, ננסה מה-scraper
          if (uploaded.length === 0) {
            const scraperResp = await fetch('/api/extract-aliexpress-images', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ affiliateUrl: imageFetchLink })
            });
            if (scraperResp.ok) {
              const scraperData = await scraperResp.json();
              const scraperImages = Array.isArray(scraperData.images) ? scraperData.images.slice(0, 8) : [];
              for (const src of scraperImages) {
                const fd = new FormData();
                const imgResp = await fetch(src);
                const imgBlob = await imgResp.blob();
                fd.append('file', imgBlob, 'image.jpg');
                fd.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
                const uploadResp = await fetch(CLOUDINARY_API_URL, {
                  method: 'POST',
                  body: fd
                });
                if (uploadResp.ok) {
                  const up = await uploadResp.json();
                  uploaded.push(up.secure_url);
                }
              }
            } else {
              console.warn('Scraper image fetch failed:', await scraperResp.text());
            }
          }

          if (uploaded.length > 0) break;
          // אם לא הצליח, ננסה עם הקישור המקורי
          if (!triedOriginalLink) {
            imageFetchLink = productLink;
            triedOriginalLink = true;
          } else {
            break;
          }
        }
        if (!mainImageUrl && uploaded.length > 0) mainImageUrl = uploaded[0];
        if (uploaded.length > 1) galleryUrls = uploaded.slice(1);
        // אם עדיין אין תמונה ראשית, הצג שגיאה
        if (!mainImageUrl) {
          showStatus('לא נמצאה תמונה למוצר מאליאקספרס. נסה להעלות תמונה ידנית.', true);
          setIsSubmitting(false);
          return;
        }
      }

      // העלאת תמונה ראשית
      if (mainImageFile) {
        mainImageUrl = await uploadImageToCloudinary(mainImageFile);
      }

      // העלאת תמונות גלריה
      for (const file of galleryImageFiles) {
        const url = await uploadImageToCloudinary(file);
        galleryUrls.push(url);
      }

      // Fallback: if no main image yet but gallery has items, use first gallery image
      if (!mainImageUrl && galleryUrls.length > 0) {
        mainImageUrl = galleryUrls[0];
      }

      const isAliExpressProduct = productLink.includes('aliexpress.com/item/');
      const productData = {
        name: productName,
        description: productDescription,
        link: affiliateLink,
        originalLink: productLink,
        price: parseFloat(productPrice) || 0,
        categories: selectedCategories,
        image: mainImageUrl,
        gallery: galleryUrls,
        videos: videoEmbedUrls,
        addedAt: Timestamp.fromDate(new Date()),
        likesCount: 0,
        clicksCount: 0,
        showOnHome: true, // תמיד מופיע בדף הבית
        isAliExpress: isAliExpressProduct,
      };

      if (productId) {
        // עדכון מוצר קיים
        await updateDoc(doc(db, 'products', productId), productData);
        showStatus('מוצר עודכן בהצלחה!', false);
      } else {
        // הוספת מוצר חדש
        await addDoc(collection(db, 'products'), productData);
        showStatus('מוצר נוסף בהצלחה!', false);
      }

      // איפוס הטופס
      resetForm();
      await loadProducts();
    } catch (error) {
      console.error('Error submitting product:', error);
      showStatus(`שגיאה: ${error.message}`, true);
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- איפוס טופס ---
  const resetForm = () => {
    setProductId('');
    setProductName('');
    setProductDescription('');
    setProductLink('');
    setProductPrice('');
  setSelectedCategories([]);
    setMainImageFile(null);
    setMainImagePreviewUrl('');
    setGalleryImageFiles([]);
    setGalleryImagePreviews([]);
    setVideoEmbedUrls([]);
    setCurrentEditingProduct(null);
    
    if (mainImageFileInputRef.current) mainImageFileInputRef.current.value = '';
    if (galleryImageFileInputRef.current) galleryImageFileInputRef.current.value = '';
  };

  // --- עריכת מוצר ---
  const editProduct = (product) => {
    setProductId(product.id);
    setProductName(product.name || '');
    setProductDescription(product.description || '');
    setProductLink(product.link || '');
    setProductPrice(product.price?.toString() || '');
  setSelectedCategories(product.categories || []);
    setMainImagePreviewUrl(product.image || '');
    setGalleryImagePreviews(product.gallery || []);
    setVideoEmbedUrls(product.videos || []);
    setCurrentEditingProduct(product);
  };

  // --- מחיקת מוצר ---
  const deleteProduct = async (id, name) => {
    if (window.confirm(`האם למחוק את המוצר "${name}"?`)) {
      try {
        await deleteDoc(doc(db, 'products', id));
        showStatus('מוצר נמחק בהצלחה.', false);
        await loadProducts();
      } catch (error) {
        showStatus(`שגיאה במחיקת מוצר: ${error.message}`, true);
      }
    }
  };

  // --- הוספת קטגוריה ---
  const addCategory = useCallback(async () => {
    const name = newCategoryName.trim();
    if (!name) {
        showStatus('אנא הזן שם קטגוריה תקין.', true);
        return;
    }
    if (categories.some(cat => cat.name.toLowerCase() === name.toLowerCase())) {
        showStatus('קטגוריה עם שם זה כבר קיימת.', true);
        return;
    }
    try {
        await addDoc(collection(db, 'categories'), { name });
        setNewCategoryName('');
        showStatus('קטגוריה נוספה בהצלחה!', false);
        await loadCategories();
    } catch (error) {
        showStatus(`שגיאה בהוספת קטגוריה: ${error.message}`, true);
    }
  }, [newCategoryName, categories, loadCategories, showStatus]);

  const deleteCategory = useCallback(async (id, name) => {
    // 🛡️ הגנה על מחיקת קטגוריה בשימוש
    const productsQuery = query(collection(db, 'products'), where('category', '==', name));
    const snapshot = await getDocs(productsQuery);
    if (!snapshot.empty) {
        showStatus(`לא ניתן למחוק. ישנם ${snapshot.size} מוצרים בקטגוריה "${name}".`, true);
        return;
    }

    if (window.confirm(`האם למחוק את הקטגוריה "${name}"?`)) {
        try {
            await deleteDoc(doc(db, 'categories', id));
            showStatus('קטגוריה נמחקה בהצלחה.', false);
            await loadCategories();
        } catch (error) {
            showStatus(`שגיאה במחיקת קטגוריה: ${error.message}`, true);
        }
    }
  }, [loadCategories, showStatus]);
  
  const handleVideoLinksChange = (e) => setVideoLinks(e.target.value.split('\n'));
  
  // --- New Filtering & Exporting Logic ---
  const filteredProducts = useMemo(() => {
    return allProducts.filter(p => {
      const searchMatch = p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ?? true;
      let categoryMatch = true;
      if (categoryFilter) {
        if (Array.isArray(p.categories)) {
          categoryMatch = p.categories.includes(categoryFilter);
        } else {
          categoryMatch = p.category === categoryFilter;
        }
      }
      return searchMatch && categoryMatch;
    });
  }, [allProducts, searchQuery, categoryFilter]);

  const exportToExcel = useCallback(() => {
    const dataToExport = filteredProducts.map(p => ({
      'שם מוצר': p.name,
      'קטגוריה': p.category,
      'מחיר': p.price,
      'לייקים': p.likesCount ?? 0,
      'קליקים': p.clicksCount ?? 0,
      'קישור': p.link,
      'תאריך יצירה': p.createdAt,
    }));
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');
    XLSX.writeFile(workbook, 'Find4U_Products.xlsx');
  }, [filteredProducts]);

  // --- Render Logic ---
  if (!isAdmin) {
    return (
      <main style={{ padding: 20, textAlign: 'center', background: mainBg, color: cardText }}>
        <h1>אין גישה</h1>
        <p>אין לך הרשאה לצפות בדף זה. אנא התחבר עם חשבון אדמין.</p>
      </main>
    );
  }

  return (
    <main style={{ 
      maxWidth: 1200, 
      margin: 'auto', 
      padding: '145px 16px 20px 16px', /* מרווח עליון גדול יותר בדסקטופ */
      direction: 'rtl', 
      fontFamily: 'Arial, sans-serif',
      minHeight: '100vh',
      backgroundColor: mainBg,
      color: cardText,
      transition: 'background 0.3s, color 0.3s'
    }}>
      <h1 style={{ 
        marginBottom: 20, 
        textAlign: 'center',
        color: cardText,
        fontSize: '2rem',
        fontWeight: 'bold'
      }}>ניהול מוצרים - דף אדמין</h1>

      {formStatusMessage && (
        <div style={{ 
          marginBottom: 20, 
          padding: '16px 20px', 
          borderRadius: 8, 
          color: formStatusIsError ? 'white' : 'white', 
          backgroundColor: formStatusIsError ? '#dc3545' : '#28a745',
          textAlign: 'center',
          fontSize: '1rem',
          fontWeight: '500'
        }}>
          {formStatusMessage}
        </div>
      )}

      {/* Tab Navigation - Stacked and Centered */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        margin: '0 auto 24px auto',
        maxWidth: 400,
        backgroundColor: cardBg,
        borderRadius: 12,
        padding: 12,
        boxShadow: cardShadow
      }}>
        <button
          onClick={() => setActiveTab('form')}
          style={{
            width: '100%',
            padding: '16px 12px',
            border: 'none',
            borderRadius: 8,
            backgroundColor: activeTab === 'form' ? buttonBg : 'transparent',
            color: activeTab === 'form' ? buttonText : tabText,
            fontSize: '1rem',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.3s ease'
          }}
        >
          📝 טופס מוצר
        </button>
        <button
          onClick={() => setActiveTab('products')}
          style={{
            width: '100%',
            padding: '16px 12px',
            border: 'none',
            borderRadius: 8,
            backgroundColor: activeTab === 'products' ? '#0070f3' : 'transparent',
            color: activeTab === 'products' ? 'white' : '#666',
            fontSize: '1rem',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.3s ease'
          }}
        >
          📦 המוצרים
        </button>
        <button
          onClick={() => setActiveTab('categories')}
          style={{
            width: '100%',
            padding: '16px 12px',
            border: 'none',
            borderRadius: 8,
            backgroundColor: activeTab === 'categories' ? '#0070f3' : 'transparent',
            color: activeTab === 'categories' ? 'white' : '#666',
            fontSize: '1rem',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.3s ease'
          }}
        >
          🏷️ קטגוריות
        </button>
        {isMainAdmin && (
          <button
            onClick={() => setActiveTab('admins')}
            style={{
              width: '100%',
              padding: '16px 12px',
              border: 'none',
              borderRadius: 8,
              backgroundColor: activeTab === 'admins' ? '#0070f3' : 'transparent',
              color: activeTab === 'admins' ? 'white' : '#666',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.3s ease'
            }}
          >
            👑 ניהול אדמינים
          </button>
        )}
      {/* Admins Tab */}
  {activeTab === 'admins' && isMainAdmin && (
        <div style={{ backgroundColor: cardBg, borderRadius: 16, padding: 24, boxShadow: cardShadow, marginBottom: 24 }}>
          <h2 style={{ marginBottom: 24, color: cardText, fontSize: '1.5rem', fontWeight: 'bold', textAlign: 'center' }}>
            ניהול אדמינים
          </h2>
          <div style={{ marginBottom: 24 }}>
            <input
              type="email"
              value={newAdminEmail}
              onChange={e => setNewAdminEmail(e.target.value)}
              placeholder="הזן מייל של אדמין חדש"
              style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${borderColor}`, width: '60%', marginLeft: 8 }}
            />
            <button
              onClick={handleAddAdmin}
              style={{ padding: '8px 16px', borderRadius: 8, backgroundColor: buttonSuccessBg, color: 'white', border: 'none', fontWeight: 'bold', marginRight: 8 }}
            >
              הוסף אדמין
            </button>
          </div>
          {loadingAdmins ? (
            <div>טוען רשימת אדמינים...</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', background: 'inherit' }}>
              <thead>
                <tr style={{ background: tableHeaderBg, color: tableHeaderText }}>
                  <th style={{ padding: '8px', borderBottom: `1px solid ${tableBorder}` }}>מייל</th>
                  <th style={{ padding: '8px', borderBottom: `1px solid ${tableBorder}` }}>מוצרים שהעלה</th>
                  <th style={{ padding: '8px', borderBottom: `1px solid ${tableBorder}` }}>הסר</th>
                </tr>
              </thead>
              <tbody>
                {adminEmails.map(email => (
                  <tr key={email}>
                    <td style={{ padding: '8px', borderBottom: `1px solid ${tableBorder}` }}>{email}</td>
                    <td style={{ padding: '8px', borderBottom: `1px solid ${tableBorder}` }}>{adminProductCounts[email] ?? 0}</td>
                    <td style={{ padding: '8px', borderBottom: `1px solid ${tableBorder}` }}>
                      {email !== 'asafg999@gmail.com' && (
                        <button
                          onClick={() => handleRemoveAdmin(email)}
                          style={{ padding: '4px 10px', borderRadius: 6, backgroundColor: buttonDangerBg, color: 'white', border: 'none', fontWeight: 'bold' }}
                        >
                          הסר
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      </div>

      {/* Product Form Tab */}
      {activeTab === 'form' && (
        <div style={{ 
          backgroundColor: cardBg, 
          borderRadius: 16, 
          padding: 24, 
          boxShadow: cardShadow,
          marginBottom: 24
        }}>
          <h2 style={{ 
            marginBottom: 24, 
            color: cardText,
            fontSize: '1.5rem',
            fontWeight: 'bold',
            textAlign: 'center'
          }}>
            {productId ? 'עריכת מוצר' : 'הוספת מוצר חדש'}
          </h2>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Product Name */}
            <div>
              <label style={{ 
                display: 'block', 
                marginBottom: 8, 
                fontWeight: '600',
                color: cardText,
                fontSize: '1rem'
              }}>
                שם מוצר *
              </label>
              <input
                dir="rtl"
                type="text"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                required
                style={{ 
                  width: '100%', 
                  padding: 16, 
                  fontSize: 16,
                  border: `2px solid ${borderColor}`,
                  borderRadius: 12,
                  backgroundColor: inputBg,
                  color: inputText,
                  transition: 'all 0.3s ease'
                }}
                placeholder="הזן שם מוצר..."
              />
            </div>

            {/* Product Description */}
            <div>
              <label style={{ 
                display: 'block', 
                marginBottom: 8, 
                fontWeight: '600',
                color: cardText,
                fontSize: '1rem'
              }}>
                תיאור
              </label>
              <textarea
                dir="rtl"
                value={productDescription}
                onChange={(e) => setProductDescription(e.target.value)}
                rows={4}
                style={{ 
                  width: '100%', 
                  padding: 16, 
                  fontSize: 16,
                  border: `2px solid ${borderColor}`,
                  borderRadius: 12,
                  backgroundColor: inputBg,
                  color: inputText,
                  resize: 'vertical',
                  minHeight: 120,
                  transition: 'all 0.3s ease'
                }}
                placeholder="הזן תיאור מוצר..."
              />
            </div>

            {/* Product Link */}
            <div>
              <label style={{ 
                display: 'block', 
                marginBottom: 8, 
                fontWeight: '600',
                color: cardText,
                fontSize: '1rem'
              }}>
                קישור למוצר
              </label>
              <input
                dir="rtl"
                type="url"
                value={productLink}
                onChange={(e) => setProductLink(e.target.value)}
                style={{ 
                  width: '100%', 
                  padding: 16, 
                  fontSize: 16,
                  border: `2px solid ${borderColor}`,
                  borderRadius: 12,
                  backgroundColor: inputBg,
                  color: inputText,
                  transition: 'all 0.3s ease'
                }}
                placeholder="https://..."
              />
            </div>

            {/* Product Price */}
            <div>
              <label style={{ 
                display: 'block', 
                marginBottom: 8, 
                fontWeight: '600',
                color: cardText,
                fontSize: '1rem'
              }}>
                מחיר (₪)
              </label>
              <input
                dir="rtl"
                type="number"
                step="0.01"
                value={productPrice}
                onChange={(e) => setProductPrice(e.target.value)}
                style={{ 
                  width: '100%', 
                  padding: 16, 
                  fontSize: 16,
                  border: `2px solid ${borderColor}`,
                  borderRadius: 12,
                  backgroundColor: inputBg,
                  color: inputText,
                  transition: 'all 0.3s ease'
                }}
                placeholder="0.00"
              />
            </div>

            {/* Category Selection - צ'קבוקסים עם חיפוש */}
            <div>
              <label style={{
                display: 'block',
                marginBottom: 8,
                fontWeight: '600',
                color: cardText,
                fontSize: '1rem'
              }}>
                קטגוריות
              </label>
              <input
                type="text"
                placeholder="חפש קטגוריה..."
                value={categorySearch}
                onChange={e => setCategorySearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: 12,
                  fontSize: 16,
                  border: `2px solid ${borderColor}`,
                  borderRadius: 8,
                  backgroundColor: inputBg,
                  color: inputText,
                  marginBottom: 10
                }}
              />
              <div style={{
                maxHeight: 180,
                overflowY: 'auto',
                border: `1px solid ${borderColor}`,
                borderRadius: 8,
                background: inputBg,
                padding: 8
              }}>
                {categories.filter(cat => cat.name.toLowerCase().includes(categorySearch.toLowerCase())).map(cat => (
                  <label key={cat.id} style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, cursor: 'pointer'}}>
                    <input
                      type="checkbox"
                      checked={selectedCategories.includes(cat.name)}
                      onChange={e => {
                        if (e.target.checked) {
                          setSelectedCategories([...selectedCategories, cat.name]);
                        } else {
                          setSelectedCategories(selectedCategories.filter(c => c !== cat.name));
                        }
                      }}
                      style={{width: 18, height: 18, accentColor: '#0070f3'}}
                    />
                    <span>{cat.name}</span>
                  </label>
                ))}
                {categories.length === 0 && <div style={{textAlign: 'center', color: '#888'}}>לא נמצאו קטגוריות</div>}
              </div>
            </div>

            {/* Main Image Upload */}
            <div>
              <label style={{ 
                display: 'block', 
                marginBottom: 8, 
                fontWeight: '600',
                color: cardText,
                fontSize: '1rem'
              }}>
                תמונה ראשית *
              </label>
              <input
                ref={mainImageFileInputRef}
                type="file"
                accept="image/*"
                onChange={handleMainImageChange}
                required={!productId && !productLink}
                style={{ 
                  width: '100%', 
                  padding: 16, 
                  fontSize: 16,
                  border: `2px solid ${borderColor}`,
                  borderRadius: 12,
                  backgroundColor: inputBg,
                  color: inputText,
                  transition: 'all 0.3s ease'
                }}
              />
              {mainImagePreviewUrl && (
                <img
                  src={mainImagePreviewUrl}
                  alt="תמונה ראשית"
                  style={{
                    width: '100%',
                    maxWidth: 300,
                    height: 200,
                    objectFit: 'cover',
                    borderRadius: 12,
                    marginTop: 12,
                    border: `2px solid ${borderColor}`
                  }}
                />
              )}
            </div>

            {/* Gallery Images Upload */}
            <div>
              <label style={{ 
                display: 'block', 
                marginBottom: 8, 
                fontWeight: '600',
                color: cardText,
                fontSize: '1rem'
              }}>
                תמונות נוספות
              </label>
              <input
                ref={galleryImageFileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleGalleryImagesChange}
                style={{ 
                  width: '100%', 
                  padding: 16, 
                  fontSize: 16,
                  border: `2px solid ${borderColor}`,
                  borderRadius: 12,
                  backgroundColor: inputBg,
                  color: inputText,
                  transition: 'all 0.3s ease'
                }}
              />
              {galleryImagePreviews.length > 0 && (
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', 
                  gap: 12, 
                  marginTop: 12 
                }}>
                  {galleryImagePreviews.map((url, index) => (
                    <div key={index} style={{ position: 'relative' }}>
                      <img
                        src={url}
                        alt={`תמונה ${index + 1}`}
                        style={{
                          width: '100%',
                          height: 120,
                          objectFit: 'cover',
                          borderRadius: 8,
                          border: `2px solid ${borderColor}`
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => removeGalleryImage(index)}
                        style={{
                          position: 'absolute',
                          top: 4,
                          right: 4,
                          background: '#dc3545',
                          color: 'white',
                          border: 'none',
                          borderRadius: '50%',
                          width: 24,
                          height: 24,
                          fontSize: 12,
                          cursor: 'pointer'
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Video Links */}
            <div>
              <label style={{ 
                display: 'block', 
                marginBottom: 8, 
                fontWeight: '600',
                color: cardText,
                fontSize: '1rem'
              }}>
                קישורי וידאו (שורה לכל קישור)
              </label>
              <textarea
                dir="rtl"
                value={videoEmbedUrls.join('\n')}
                onChange={(e) => setVideoEmbedUrls(e.target.value.split('\n').filter(url => url.trim()))}
                rows={3}
                style={{ 
                  width: '100%', 
                  padding: 16, 
                  fontSize: 16,
                  border: `2px solid ${borderColor}`,
                  borderRadius: 12,
                  backgroundColor: inputBg,
                  color: inputText,
                  resize: 'vertical',
                  transition: 'all 0.3s ease'
                }}
                placeholder="https://www.youtube.com/embed/..."
              />
            </div>

            {/* Submit Buttons */}
            <div style={{ 
              display: 'flex', 
              gap: 16, 
              flexWrap: 'wrap',
              justifyContent: 'center'
            }}>
              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  padding: '16px 32px',
                  fontSize: '1.1rem',
                  fontWeight: '600',
                  backgroundColor: buttonBg,
                  color: buttonText,
                  border: 'none',
                  borderRadius: 12,
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  opacity: isSubmitting ? 0.7 : 1,
                  transition: 'all 0.3s ease',
                  minWidth: 140
                }}
              >
                {isSubmitting ? 'שולח...' : (productId ? 'עדכן מוצר' : 'הוסף מוצר')}
              </button>
              
              {productId && (
                <button
                  type="button"
                  onClick={resetForm}
                  style={{
                    padding: '16px 32px',
                    fontSize: '1.1rem',
                    fontWeight: '600',
                    backgroundColor: buttonSecondaryBg,
                    color: buttonText,
                    border: 'none',
                    borderRadius: 12,
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    minWidth: 140
                  }}
                >
                  ביטול עריכה
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      {/* Products Tab */}
      {activeTab === 'products' && (
        <div style={{ 
          backgroundColor: cardBg, 
          borderRadius: 16, 
          padding: 24, 
          boxShadow: cardShadow,
          marginBottom: 24
        }}>
          <h2 style={{ 
            marginBottom: 24, 
            color: cardText,
            fontSize: '1.5rem',
            fontWeight: 'bold',
            textAlign: 'center'
          }}>
            ניהול מוצרים
          </h2>

          {/* Action Buttons (ali features removed) */}
          <div style={{ 
            display: 'flex', 
            gap: 12, 
            marginBottom: 24,
            flexWrap: 'wrap',
            justifyContent: 'center'
          }}>
            {/* AliExpress buttons removed as requested */}
            
            <button
              onClick={exportToExcel}
              style={{
                padding: '12px 20px',
                fontSize: '1rem',
                fontWeight: '600',
                backgroundColor: buttonExportBg,
                color: buttonText,
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                transition: 'all 0.3s ease'
              }}
            >
              📊 ייצוא לאקסל
            </button>
          </div>

          {/* Search and Filter */}
          <div style={{ 
            display: 'flex', 
            gap: 12, 
            marginBottom: 20,
            flexWrap: 'wrap'
          }}>
            <input
              type="text"
              placeholder="חיפוש מוצרים..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                flex: 1,
                minWidth: 200,
                padding: 12,
                fontSize: 16,
                border: `2px solid ${borderColor}`,
                borderRadius: 8,
                backgroundColor: inputBg,
                color: inputText
              }}
            />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              style={{
                padding: 12,
                fontSize: 16,
                border: `2px solid ${borderColor}`,
                borderRadius: 8,
                backgroundColor: inputBg,
                color: inputText,
                minWidth: 150
              }}
            >
              <option value="">כל הקטגוריות</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.name}>{cat.name}</option>
              ))}
            </select>
          </div>

          {/* Products Table */}
          {loadingProducts ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <p>טוען מוצרים...</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ 
                width: '100%', 
                borderCollapse: 'collapse',
                fontSize: '0.9rem',
                backgroundColor: cardBg,
                color: cardText
              }}>
                <thead>
                  <tr style={{ backgroundColor: tableHeaderBg }}>
                    <th style={{ border: `1px solid ${tableBorder}`, padding: 12, textAlign: 'right', color: tableHeaderText }}>תמונה</th>
                    <th style={{ border: `1px solid ${tableBorder}`, padding: 12, textAlign: 'right', color: tableHeaderText }}>שם</th>
                    <th style={{ border: `1px solid ${tableBorder}`, padding: 12, textAlign: 'right', color: tableHeaderText }}>קטגוריה</th>
                    <th style={{ border: `1px solid ${tableBorder}`, padding: 12, textAlign: 'right', color: tableHeaderText }}>מחיר</th>
                    <th style={{ border: `1px solid ${tableBorder}`, padding: 12, textAlign: 'right', color: tableHeaderText }}>לייקים</th>
                    <th style={{ border: `1px solid ${tableBorder}`, padding: 12, textAlign: 'right', color: tableHeaderText }}>מכירות</th>
                    <th style={{ border: `1px solid ${tableBorder}`, padding: 12, textAlign: 'right', color: tableHeaderText }}>פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ border: '1px solid #dee2e6', padding: 20, textAlign: 'center' }}>
                        לא נמצאו מוצרים
                      </td>
                    </tr>
                  ) : (
                    filteredProducts.map((p) => (
                      <tr key={p.id} style={{ borderBottom: `1px solid ${tableBorder}` }}>
                        <td style={{ border: `1px solid ${tableBorder}`, padding: 8, textAlign: 'center' }}>
                          {p.image && (
                            <a href={`/product/${p.id}`} target="_blank" rel="noopener noreferrer">
                              <img
                                src={p.image}
                                alt={p.name}
                                style={{
                                  width: 60,
                                  height: 60,
                                  objectFit: 'cover',
                                  borderRadius: 8,
                                  border: `1px solid ${tableBorder}`,
                                  transition: 'box-shadow 0.2s',
                                  boxShadow: '0 2px 8px #0001',
                                  cursor: 'pointer'
                                }}
                              />
                            </a>
                          )}
                        </td>
                        <td style={{ border: `1px solid ${tableBorder}`, padding: 8, textAlign: 'right' }}>
                          <a href={`/product/${p.id}`} target="_blank" rel="noopener noreferrer" style={{textDecoration: 'none', color: cardText}}>
                            <div style={{ fontWeight: '600', cursor: 'pointer', textDecoration: 'underline' }}>{p.name}</div>
                          </a>
                          {p.isHot && (
                            <span style={{
                              backgroundColor: hotBg,
                              color: hotText,
                              padding: '2px 6px',
                              borderRadius: 4,
                              fontSize: '0.7rem',
                              marginTop: 4,
                              display: 'inline-block'
                            }}>
                              🔥 חם
                            </span>
                          )}
                        </td>
                          <td style={{ border: `1px solid ${tableBorder}`, padding: 8, textAlign: 'right' }}>
                            {Array.isArray(p.categories)
                              ? p.categories.join(', ')
                              : (p.category || '')}
                          </td>
                        <td style={{ border: `1px solid ${tableBorder}`, padding: 8, textAlign: 'right' }}>
                          {p.isAliExpress ? 'לחץ לפרטים' : `${p.price} ₪`}
                        </td>
                        <td style={{ border: `1px solid ${tableBorder}`, padding: 8, textAlign: 'center' }}>{p.likesCount ?? 0}</td>
                        <td style={{ border: `1px solid ${tableBorder}`, padding: 8, textAlign: 'center' }}>
                          {p.sales ? `${p.sales} יחידות` : '-'}
                        </td>
                        <td style={{ border: `1px solid ${tableBorder}`, padding: 8, textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                            <button
                              onClick={() => editProduct(p)}
                              style={{
                                padding: '6px 12px',
                                fontSize: '0.8rem',
                                backgroundColor: buttonBg,
                                color: buttonText,
                                border: 'none',
                                borderRadius: 4,
                                cursor: 'pointer'
                              }}
                            >
                              ערוך
                            </button>
                            <button
                              onClick={() => deleteProduct(p.id, p.name)}
                              style={{
                                padding: '6px 12px',
                                fontSize: '0.8rem',
                                backgroundColor: buttonDangerBg,
                                color: buttonText,
                                border: 'none',
                                borderRadius: 4,
                                cursor: 'pointer'
                              }}
                            >
                              מחק
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Categories Tab */}
      {activeTab === 'categories' && (
        <div style={{ 
          backgroundColor: cardBg, 
          borderRadius: 16, 
          padding: 24, 
          boxShadow: cardShadow,
          marginBottom: 24
        }}>
          <h2 style={{ 
            marginBottom: 24, 
            color: cardText,
            fontSize: '1.5rem',
            fontWeight: 'bold',
            textAlign: 'center'
          }}>
            ניהול קטגוריות
          </h2>

          {/* Add Category Form */}
          <div style={{ 
            display: 'flex', 
            gap: 12, 
            marginBottom: 24,
            flexWrap: 'wrap'
          }}>
            <input
              type="text"
              placeholder="שם קטגוריה חדשה..."
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              style={{
                flex: 1,
                minWidth: 200,
                padding: 12,
                fontSize: 16,
                border: `2px solid ${borderColor}`,
                borderRadius: 8,
                backgroundColor: inputBg,
                color: inputText
              }}
            />
            <button
              onClick={addCategory}
              style={{
                padding: '12px 24px',
                fontSize: '1rem',
                fontWeight: '600',
                backgroundColor: buttonSuccessBg,
                color: buttonText,
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                transition: 'all 0.3s ease'
              }}
            >
              הוסף קטגוריה
            </button>
          </div>

          {/* Categories List */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ 
              width: '100%', 
              borderCollapse: 'collapse',
              fontSize: '0.9rem',
              backgroundColor: cardBg,
              color: cardText
            }}>
              <thead>
                <tr style={{ backgroundColor: tableHeaderBg }}>
                  <th style={{ border: `1px solid ${tableBorder}`, padding: 12, textAlign: 'right', color: tableHeaderText }}>שם קטגוריה</th>
                  <th style={{ border: `1px solid ${tableBorder}`, padding: 12, textAlign: 'center', color: tableHeaderText }}>פעולות</th>
                </tr>
              </thead>
              <tbody>
                {categories.length === 0 ? (
                  <tr>
                    <td colSpan={2} style={{ border: '1px solid #dee2e6', padding: 20, textAlign: 'center' }}>
                      לא נמצאו קטגוריות
                    </td>
                  </tr>
                ) : (
                  categories.map((cat) => (
                    <tr key={cat.id} style={{ borderBottom: `1px solid ${tableBorder}` }}>
                      <td style={{ border: `1px solid ${tableBorder}`, padding: 12, textAlign: 'right', fontWeight: '600' }}>
                        {cat.name}
                      </td>
                      <td style={{ border: `1px solid ${tableBorder}`, padding: 12, textAlign: 'center' }}>
                        <button
                          onClick={() => deleteCategory(cat.id, cat.name)}
                          style={{
                            padding: '8px 16px',
                            fontSize: '0.9rem',
                            backgroundColor: buttonDangerBg,
                            color: buttonText,
                            border: 'none',
                            borderRadius: 6,
                            cursor: 'pointer',
                            transition: 'all 0.3s ease'
                          }}
                        >
                          מחק
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}