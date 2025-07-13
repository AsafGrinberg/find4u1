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

// בדיקת משתמש אדמין לפי מייל
function isAdminUser(user) {
  return user?.email === 'asafg999@gmail.com';
}

export default function AdminPage() {
  // --- States from original code ---
  const [user, setUser] = useState(null);
  const [categories, setCategories] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [formStatusMessage, setFormStatusMessage] = useState('');
  const [formStatusIsError, setFormStatusIsError] = useState(false);

  const [productId, setProductId] = useState('');
  const [productName, setProductName] = useState('');
  const [productDescription, setProductDescription] = useState('');
  const [productLink, setProductLink] = useState('');
  const [productPrice, setProductPrice] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [videoLinks, setVideoLinks] = useState([]);

  const [mainImageFile, setMainImageFile] = useState(null);
  const [mainImagePreviewUrl, setMainImagePreviewUrl] = useState('');
  const [galleryImageFiles, setGalleryImageFiles] = useState([]);
  const [galleryImagePreviews, setGalleryImagePreviews] = useState([]);

  const [videoEmbedUrls, setVideoEmbedUrls] = useState([]);
  const [currentEditingProduct, setCurrentEditingProduct] = useState(null);
  const [newCategoryName, setNewCategoryName] = useState('');

  const mainImageFileInputRef = useRef(null);
  const galleryImageFileInputRef = useRef(null);

  // --- New states for added features ---
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  // --- ניהול הרשאות משתמש ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (u && isAdminUser(u)) {
        setUser(u);
      } else {
        setUser(null);
      }
    });
    return () => unsubscribe();
  }, []);

  // --- Improved Data Loading with useCallback ---
  const showStatus = useCallback((message, isError = false) => {
    setFormStatusMessage(message);
    setFormStatusIsError(isError);
    setTimeout(() => {
      setFormStatusMessage('');
      setFormStatusIsError(false);
    }, 5000);
  }, []);

  const loadCategories = useCallback(async () => {
    try {
      const categoriesCol = collection(db, 'categories');
      const snapshot = await getDocs(categoriesCol);
      const cats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCategories(cats);
    } catch (error) {
      showStatus(`שגיאה בטעינת קטגוריות: ${error.message}`, true);
    }
  }, [showStatus]);

  const loadProducts = useCallback(async () => {
    setLoadingProducts(true);
    try {
      const productsCol = collection(db, 'products');
      const snapshot = await getDocs(productsCol);
      const products = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          price: data.price != null ? Number(data.price) : null,
        };
      });
      setAllProducts(products);
    } catch (error) {
      showStatus(`שגיאה בטעינת מוצרים: ${error.message}`, true);
      console.error(error);
    }
    setLoadingProducts(false);
  }, [showStatus]);

  useEffect(() => {
    if (user) {
      loadProducts();
      loadCategories();
    }
  }, [user, loadProducts, loadCategories]);

  // --- Image & Video Logic ---
  const uploadImageToCloudinary = useCallback(async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    try {
      const response = await fetch(CLOUDINARY_API_URL, { method: 'POST', body: formData });
      const data = await response.json();
      if (data.secure_url) return data.secure_url;
      throw new Error(data.error?.message || 'שגיאת Cloudinary לא ידועה');
    } catch (error) {
      showStatus(`שגיאת רשת בהעלאת תמונה: ${error.message}`, true);
      return null;
    }
  }, [showStatus]);
  
  function getVideoEmbedUrl(url) {
    let match = url.match(/(?:https?:\/\/)?(?:www\.)?(?:m\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=|embed\/|v\/|)?([\w-]{11})/);
    if (match && match[1]) return `https://www.youtube.com/embed/$${match[1]}?autoplay=0&loop=0`;
    match = url.match(/(?:https?:\/\/)?(?:www\.)?tiktok\.com\/(?:@[^/]+\/video\/|v\/|embed\/)?(\d+)/);
    if (match && match[1]) return `https://www.tiktok.com/embed/v2/${match[1]}?lang=he-IL&autoplay=0`;
    return null;
  }

  useEffect(() => {
    const urls = videoLinks.map((link) => getVideoEmbedUrl(link.trim())).filter(Boolean);
    setVideoEmbedUrls(urls);
  }, [videoLinks]);

  useEffect(() => {
    if (!mainImageFile) {
        if (!currentEditingProduct) setMainImagePreviewUrl('');
        return;
    }
    const objectUrl = URL.createObjectURL(mainImageFile);
    setMainImagePreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [mainImageFile, currentEditingProduct]);

  useEffect(() => {
    if (!galleryImageFiles.length) {
        if (!currentEditingProduct) setGalleryImagePreviews([]);
        return;
    }
    const objectUrls = galleryImageFiles.map(file => URL.createObjectURL(file));
    setGalleryImagePreviews(objectUrls);
    return () => objectUrls.forEach(url => URL.revokeObjectURL(url));
  }, [galleryImageFiles, currentEditingProduct]);

  // --- Improved Form Logic ---
  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (isSubmitting) return; // 🛡️ מניעת שליחה כפולה

    if (!productName.trim() || !selectedCategory) {
      showStatus('יש למלא שם מוצר ולבחור קטגוריה.', true);
      return;
    }

    setIsSubmitting(true);
    showStatus('מעבד...', false);

    try {
      let mainImageUrl = currentEditingProduct?.image || null;
      if (mainImageFile) {
        mainImageUrl = await uploadImageToCloudinary(mainImageFile);
        if (!mainImageUrl) throw new Error('העלאת תמונה ראשית נכשלה.');
      }
      if (!mainImageUrl) throw new Error('יש לבחור תמונה ראשית.');
      
      const newGalleryImageUrls = await Promise.all(galleryImageFiles.map(uploadImageToCloudinary));
      if (newGalleryImageUrls.some(url => url === null)) {
        throw new Error('חלק מהעלאות התמונות לגלריה נכשלו.');
      }
      
      const productData = {
        name: productName.trim(),
        description: productDescription.trim(),
        link: productLink.trim(),
        price: productPrice ? parseFloat(productPrice) : null,
        category: selectedCategory,
        image: mainImageUrl,
        gallery: [...(currentEditingProduct?.gallery || []), ...newGalleryImageUrls],
        videos: videoEmbedUrls,
        updatedAt: new Date().toISOString(),
        ...(productId ? {} : { 
          createdAt: new Date().toISOString(), 
          clicksCount: 0, 
          likesCount: 0 
        }),
      };

      if (productId) {
        await updateDoc(doc(db, 'products', productId), productData);
        showStatus('המוצר עודכן בהצלחה!', false);
      } else {
        await addDoc(collection(db, 'products'), productData);
        showStatus('המוצר נוסף בהצלחה!', false);
      }
      resetForm();
      await loadProducts();
    } catch (error) {
      showStatus(`שגיאה בשמירת מוצר: ${error.message}`, true);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    isSubmitting, productName, selectedCategory, mainImageFile, galleryImageFiles, 
    currentEditingProduct, productDescription, productLink, productPrice, videoEmbedUrls, 
    productId, showStatus, uploadImageToCloudinary, loadProducts // Dependencies for useCallback
  ]);

  const resetForm = useCallback(() => {
    setProductId('');
    setProductName('');
    setProductDescription('');
    setProductLink('');
    setProductPrice('');
    setSelectedCategory('');
    setMainImageFile(null);
    setMainImagePreviewUrl('');
    setGalleryImageFiles([]);
    setGalleryImagePreviews([]);
    setVideoLinks([]);
    setCurrentEditingProduct(null);

    if (mainImageFileInputRef.current) mainImageFileInputRef.current.value = '';
    if (galleryImageFileInputRef.current) galleryImageFileInputRef.current.value = '';
  }, []);

  const editProduct = useCallback((product) => {
    window.scrollTo(0, 0); // Scroll to top to see the form
    setCurrentEditingProduct(product);
    setProductId(product.id);
    setProductName(product.name || '');
    setProductDescription(product.description || '');
    setProductLink(product.link || '');
    setProductPrice(product.price != null ? product.price.toString() : '');
    setSelectedCategory(product.category || '');
    setMainImagePreviewUrl(product.image || '');
    setMainImageFile(null);
    setGalleryImagePreviews(product.gallery || []);
    setGalleryImageFiles([]);
    setVideoLinks(product.videos ? product.videos.map((v) => v.trim()) : []);
  }, []);
  
  const deleteProduct = useCallback(async (productIdToDelete) => {
    if (window.confirm('אתה בטוח שברצונך למחוק את המוצר? פעולה זו לא ניתנת לביטול.')) {
      try {
        await deleteDoc(doc(db, 'products', productIdToDelete));
        showStatus('המוצר נמחק בהצלחה.', false);
        if (currentEditingProduct?.id === productIdToDelete) resetForm();
        await loadProducts();
      } catch (error) {
        showStatus(`שגיאה במחיקת מוצר: ${error.message}`, true);
      }
    }
  }, [currentEditingProduct, resetForm, loadProducts, showStatus]);
  
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
      const categoryMatch = categoryFilter ? p.category === categoryFilter : true;
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
  if (user === null) {
    return (
      <main style={{ padding: 20, textAlign: 'center' }}>
        <h1>אין גישה</h1>
        <p>אין לך הרשאה לצפות בדף זה. אנא התחבר עם חשבון אדמין.</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 1200, margin: 'auto', padding: 20, direction: 'rtl', fontFamily: 'Arial, sans-serif' }}>
      <h1 style={{ marginBottom: 20 }}>ניהול מוצרים - דף אדמין</h1>

      {formStatusMessage && (
        <div style={{ marginBottom: 20, padding: '10px 20px', borderRadius: 4, color: formStatusIsError ? 'red' : 'green', backgroundColor: formStatusIsError ? '#ffd6d6' : '#d6ffd6' }}>
          {formStatusMessage}
        </div>
      )}

      {/* --- The Original Form Structure --- */}
      <form onSubmit={handleSubmit} style={{ border: '1px solid #ccc', padding: 20, borderRadius: 8, marginBottom: 40 }}>
        <h2>{productId ? 'עריכת מוצר' : 'הוספת מוצר חדש'}</h2>
        <div style={{ marginBottom: 15 }}>
          <label>שם מוצר:<br />
            <input dir="rtl" type="text" value={productName} onChange={(e) => setProductName(e.target.value)} required style={{ width: '100%', padding: 8, fontSize: 16 }} />
          </label>
        </div>
        <div style={{ marginBottom: 15 }}>
          <label>תיאור:<br />
            <textarea dir="rtl" value={productDescription} onChange={(e) => setProductDescription(e.target.value)} rows={3} style={{ width: '100%', padding: 8, fontSize: 16 }} />
          </label>
        </div>
        {/* ... Other form fields with dir="rtl" where needed */}
        <div style={{ marginBottom: 15 }}>
          <label>
            קישור למוצר (URL):<br />
            <input dir="rtl" type="url" value={productLink} onChange={(e) => setProductLink(e.target.value)} style={{ width: '100%', padding: 8, fontSize: 16 }} />
          </label>
        </div>
        <div style={{ marginBottom: 15 }}>
          <label>
            מחיר:<br />
            <input type="number" min="0" step="0.01" value={productPrice} onChange={(e) => setProductPrice(e.target.value)} placeholder="לדוגמה: 59.90" style={{ width: '100%', padding: 8, fontSize: 16 }} />
          </label>
        </div>
        <fieldset style={{ marginBottom: 15 }}>
          <legend>קטגוריות (בחר אחת):</legend>
          {categories.map((cat) => (
            <label key={cat.id} style={{ marginRight: 15 }}>
              <input type="radio" name="category" value={cat.name} checked={selectedCategory === cat.name} onChange={() => setSelectedCategory(cat.name)} />{' '} {cat.name}
            </label>
          ))}
        </fieldset>
        {/* ... rest of the form fields */}
        <div style={{ marginBottom: 15 }}>
          <label>
            תמונה ראשית:<br />
            <input ref={mainImageFileInputRef} type="file" accept="image/*" onChange={(e) => setMainImageFile(e.target.files[0])} />
          </label>
          {mainImagePreviewUrl && <div style={{ marginTop: 10 }}><img src={mainImagePreviewUrl} alt="תצוגה מקדימה" style={{ maxWidth: '200px', borderRadius: 6 }} /></div>}
        </div>
        <div style={{ marginBottom: 15 }}>
          <label>גלריית תמונות (ניתן לבחור מספר קבצים):<br />
            <input ref={galleryImageFileInputRef} type="file" accept="image/*" multiple onChange={(e) => setGalleryImageFiles(Array.from(e.target.files))} />
          </label>
          <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {galleryImagePreviews.map((url, idx) => (<img key={idx} src={url} alt={`תמונה בגלריה ${idx + 1}`} style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 6 }}/>))}
          </div>
        </div>
        <div style={{ marginBottom: 15 }}>
          <label>קישורי וידאו (YouTube / TikTok) - כל קישור בשורה חדשה:<br />
            <textarea dir="rtl" value={videoLinks.join('\n')} onChange={handleVideoLinksChange} rows={4} style={{ width: '100%', padding: 8, fontSize: 16 }} />
          </label>
          <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {videoEmbedUrls.map((embedUrl, idx) => (<iframe key={idx} src={embedUrl} frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen title={`וידאו ${idx + 1}`} style={{ width: embedUrl.includes('tiktok.com') ? '325px' : '320px', height: embedUrl.includes('tiktok.com') ? '580px' : '180px', borderRadius: 6 }}/>))}
          </div>
        </div>
        <div>
          {/* ✅ Submit button with isSubmitting protection */}
          <button type="submit" disabled={isSubmitting} style={{ padding: '10px 25px', fontSize: 16, backgroundColor: isSubmitting ? '#ccc' : '#007bff', color: 'white', border: 'none' }}>
            {isSubmitting ? 'מעבד...' : (productId ? 'עדכן מוצר' : 'הוסף מוצר')}
          </button>
          <button type="button" onClick={resetForm} disabled={isSubmitting} style={{ padding: '10px 25px', fontSize: 16, marginLeft: 10 }}>
            נקה טופס
          </button>
        </div>
      </form>

      {/* --- Category Management Section --- */}
      <section style={{ marginTop: 40, borderTop: '1px solid #aaa', paddingTop: 20 }}>
        <h2>ניהול קטגוריות</h2>
        <div style={{ marginBottom: 15 }}>
          <input dir="rtl" type="text" placeholder="הזן שם קטגוריה חדשה" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} style={{ padding: 8, fontSize: 16, width: 300 }} />
          {/* ✅ Disabled button with visual feedback */}
          <button onClick={addCategory} disabled={!newCategoryName.trim()} style={{ padding: '9px 20px', fontSize: 16, marginLeft: 10, backgroundColor: !newCategoryName.trim() ? '#ccc' : '#28a745', color: 'white', border: 'none' }}>
            הוסף קטגוריה
          </button>
        </div>
        <ul>
          {categories.length === 0 && <li>אין קטגוריות מוגדרות</li>}
          {categories.map((cat) => (
            <li key={cat.id} style={{ marginBottom: 6 }}>{cat.name}{' '}
              {/* ✅ Protected delete */}
              <button onClick={() => deleteCategory(cat.id, cat.name)} style={{ color: 'red', marginLeft: 10 }} title="מחק קטגוריה">
                מחק
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* --- Products List Section with All New Features --- */}
      <section>
        <h2>רשימת מוצרים ({loadingProducts ? 'טוען...' : filteredProducts.length})</h2>
        
        {/* ✅ Search, Filter, and Export UI */}
        <div style={{ marginBottom: 20, display: 'flex', gap: '15px', alignItems: 'center' }}>
            <input dir="rtl" type="text" placeholder="🔍 חפש מוצר..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ padding: 8, fontSize: 16 }}/>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} style={{ padding: 8, fontSize: 16 }}>
                <option value="">סינון לפי קטגוריה</option>
                {categories.map(cat => <option key={cat.id} value={cat.name}>{cat.name}</option>)}
            </select>
            <button onClick={exportToExcel} disabled={filteredProducts.length === 0} style={{ padding: '9px 20px', fontSize: 16 }}>
              📥 ייצוא לאקסל
            </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', direction: 'rtl', textAlign: 'right', minWidth: 600 }}>
            <thead>
              {/* ✅ Corrected Column Order */}
              <tr style={{ backgroundColor: '#ddd' }}>
                <th style={{ border: '1px solid #aaa', padding: '8px' }}>תמונה</th>
                <th style={{ border: '1px solid #aaa', padding: '8px' }}>שם מוצר</th>
                <th style={{ border: '1px solid #aaa', padding: '8px' }}>קטגוריה</th>
                <th style={{ border: '1px solid #aaa', padding: '8px' }}>מחיר</th>
                <th style={{ border: '1px solid #aaa', padding: '8px' }}>קליקים</th>
                <th style={{ border: '1px solid #aaa', padding: '8px' }}>לייקים</th>
                <th style={{ border: '1px solid #aaa', padding: '8px' }}>פעולות</th>
              </tr>
            </thead>
            <tbody>
              {/* ✅ Rendering filteredProducts */}
              {filteredProducts.map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid #ccc' }}>
                  <td style={{ border: '1px solid #aaa', padding: '4px' }}>
                    {p.image ? (<img src={p.image} alt={p.name} style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 6 }}/>) : ('אין תמונה')}
                  </td>
                  <td style={{ border: '1px solid #aaa', padding: '4px', maxWidth: 180, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={p.name}>
                    {p.name}
                  </td>
                  <td style={{ border: '1px solid #aaa', padding: '4px' }}>
                    {p.category || '-'}
                  </td>
                  <td style={{ border: '1px solid #aaa', padding: '4px' }}>
                    {p.price != null ? `₪${p.price.toFixed(2)}` : '-'}
                  </td>
                  <td style={{ border: '1px solid #aaa', padding: '4px' }}>
                    {p.clicksCount ?? 0}
                  </td>
                  <td style={{ border: '1px solid #aaa', padding: '4px' }}>
                    {p.likesCount ?? 0}
                  </td>
                  {/* ✅ Actions column at the end */}
                  <td style={{ border: '1px solid #aaa', padding: '4px' }}>
                    <button onClick={() => editProduct(p)} style={{ marginRight: 10 }}>עריכה</button>
                    <button onClick={() => deleteProduct(p.id)} style={{ color: 'red' }}>מחיקה</button>
                  </td>
                </tr>
              ))}
              {allProducts.length === 0 && !loadingProducts && (
                <tr><td colSpan={7} style={{ padding: 15, textAlign: 'center' }}>לא נמצאו מוצרים</td></tr>
              )}
               {filteredProducts.length === 0 && allProducts.length > 0 && (
                <tr><td colSpan={7} style={{ padding: 15, textAlign: 'center' }}>לא נמצאו מוצרים התואמים לחיפוש/סינון</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}