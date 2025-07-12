import { useState, useEffect, useRef } from 'react';
import {
  auth,
  db,
  collection,
  getDocs,
  doc,
  deleteDoc,
  addDoc,
  updateDoc,
  onAuthStateChanged
} from '../firebase/firebase-config';

import { CLOUDINARY_UPLOAD_PRESET, CLOUDINARY_API_URL } from '../lib/script';

// בדיקת משתמש אדמין לפי מייל
function isAdminUser(user) {
  return user?.email === 'asafg999@gmail.com';
}

export default function AdminPage() {
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

  // --- טעינת קטגוריות מה-Firestore ---
  async function loadCategories() {
    try {
      const categoriesCol = collection(db, 'categories');
      const snapshot = await getDocs(categoriesCol);
      const cats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCategories(cats);
    } catch (error) {
      showStatus(`שגיאה בטעינת קטגוריות: ${error.message}`, true);
    }
  }

  // --- טעינת מוצרים מה-Firestore ---
  async function loadProducts() {
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
  }

  // --- טעינת נתונים לאחר התחברות ---
  useEffect(() => {
    if (user) {
      loadProducts();
      loadCategories();
    }
  }, [user]);

  // --- הצגת סטטוס הודעה ---
  function showStatus(message, isError = false) {
    setFormStatusMessage(message);
    setFormStatusIsError(isError);
    setTimeout(() => {
      setFormStatusMessage('');
      setFormStatusIsError(false);
    }, 5000);
  }

  // --- העלאת תמונה ל-Cloudinary ---
  async function uploadImageToCloudinary(file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    try {
      const response = await fetch(CLOUDINARY_API_URL, {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (data.secure_url) {
        return data.secure_url;
      } else {
        showStatus(`שגיאת העלאה: ${data.error ? data.error.message : 'לא ידוע'}`, true);
        return null;
      }
    } catch (error) {
      showStatus(`שגיאת רשת בהעלאת תמונה: ${error.message}`, true);
      return null;
    }
  }

  // --- המרת קישורי וידאו ל-embed URLs ---
function getVideoEmbedUrl(url) {
  // YouTube
  let match = url.match(/(?:https?:\/\/)?(?:www\.)?(?:m\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=|embed\/|v\/|)?([\w-]{11})/);
  if (match && match[1]) {
    return `https://www.youtube.com/embed/${match[1]}?autoplay=0&loop=0`;
  }

  // TikTok
  match = url.match(/(?:https?:\/\/)?(?:www\.)?tiktok\.com\/(?:@[^/]+\/video\/|v\/|embed\/)?(\d+)/);
  if (match && match[1]) {
    return `https://www.tiktok.com/embed/v2/${match[1]}?lang=he-IL&autoplay=0`;
  }

  return null;
}


  // --- עדכון תצוגות embed לוידאו ---
  useEffect(() => {
    const urls = videoLinks
      .map((link) => getVideoEmbedUrl(link.trim()))
      .filter((url) => url !== null);
    setVideoEmbedUrls(urls);
  }, [videoLinks]);

  // --- תצוגת תצוגה מקדימה לתמונה ראשית ---
  useEffect(() => {
    if (!mainImageFile) {
      setMainImagePreviewUrl('');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      setMainImagePreviewUrl(e.target.result);
    };
    reader.readAsDataURL(mainImageFile);
  }, [mainImageFile]);

  // --- תצוגת תצוגה מקדימה לתמונות בגלריה ---
  useEffect(() => {
    if (!galleryImageFiles.length) {
      setGalleryImagePreviews([]);
      return;
    }
    const previews = [];
    galleryImageFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        previews.push(e.target.result);
        if (previews.length === galleryImageFiles.length) {
          setGalleryImagePreviews([...previews]);
        }
      };
      reader.readAsDataURL(file);
    });
  }, [galleryImageFiles]);

  // --- שליחת הטופס להוספה / עדכון מוצר ---
  async function handleSubmit(e) {
    e.preventDefault();
    showStatus('מעבד...', false);

    if (!productName.trim()) {
      showStatus('יש להזין שם מוצר.', true);
      return;
    }
if (!selectedCategory) {
  showStatus('יש לבחור קטגוריה.', true);
  return;
}


    let priceNum = null;
    if (productPrice.trim() !== '') {
      priceNum = parseFloat(productPrice);
      if (isNaN(priceNum)) {
        showStatus('מחיר לא תקין.', true);
        return;
      }
    }

    // העלאת תמונה ראשית
    let mainImageUrl = null;
    if (mainImageFile) {
      mainImageUrl = await uploadImageToCloudinary(mainImageFile);
      if (!mainImageUrl) {
        showStatus('שגיאה בהעלאת תמונה ראשית.', true);
        return;
      }
    } else if (currentEditingProduct) {
      mainImageUrl = currentEditingProduct.image;
    } else {
      showStatus('יש לבחור תמונה ראשית.', true);
      return;
    }

    // העלאת תמונות גלריה
    let galleryImageUrls = [];
    if (currentEditingProduct && currentEditingProduct.gallery) {
      galleryImageUrls = [...currentEditingProduct.gallery];
    }

    if (galleryImageFiles.length > 0) {
      for (const file of galleryImageFiles) {
        const url = await uploadImageToCloudinary(file);
        if (url) {
          galleryImageUrls.push(url);
        } else {
          showStatus(`שגיאה בהעלאת תמונה בגלריה: ${file.name}`, true);
          return;
        }
      }
    }

    const productData = {
      name: productName.trim(),
      description: productDescription.trim(),
      link: productLink.trim(),
      price: priceNum,
category: selectedCategory,
      image: mainImageUrl,
      gallery: galleryImageUrls,
      videos: [...videoEmbedUrls],
      createdAt: currentEditingProduct ? currentEditingProduct.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      if (productId) {
        // עדכון מוצר קיים
        await updateDoc(doc(db, 'products', productId), productData);
        showStatus('המוצר עודכן בהצלחה!', false);
      } else {
        // הוספת מוצר חדש
        await addDoc(collection(db, 'products'), productData);
        showStatus('המוצר נוסף בהצלחה!', false);
      }
      resetForm();
      await loadProducts();
    } catch (error) {
      console.error('שגיאה בשמירת מוצר:', error);
      showStatus(`שגיאה בשמירת מוצר: ${error.message}`, true);
    }
  }

  // --- איפוס טופס ---
  function resetForm() {
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
  }

  // --- טעינת מוצר לעריכה ---
  function editProduct(productIdToEdit) {
    const product = allProducts.find((p) => p.id === productIdToEdit);
    if (!product) {
      showStatus('המוצר לא נמצא.', true);
      return;
    }
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
  }

  // --- מחיקת מוצר ---
  async function deleteProduct(productIdToDelete) {
    if (!confirm('אתה בטוח שברצונך למחוק את המוצר? פעולה זו לא ניתנת לביטול.')) {
      return;
    }
    try {
      await deleteDoc(doc(db, 'products', productIdToDelete));
      showStatus('המוצר נמחק בהצלחה.', false);
      if (currentEditingProduct && currentEditingProduct.id === productIdToDelete) {
        resetForm();
      }
      await loadProducts();
    } catch (error) {
      console.error('שגיאה במחיקת מוצר:', error);
      showStatus(`שגיאה במחיקת מוצר: ${error.message}`, true);
    }
  }
async function addCategory() {
  const name = newCategoryName.trim();
  if (!name) {
    showStatus('אנא הזן שם קטגוריה תקין.', true);
    return;
  }
  try {
    // בדיקה אם כבר קיימת קטגוריה עם השם הזה
    if (categories.some(cat => cat.name === name)) {
      showStatus('קטגוריה עם שם זה כבר קיימת.', true);
      return;
    }
    await addDoc(collection(db, 'categories'), { name });
    setNewCategoryName('');
    showStatus('קטגוריה נוספה בהצלחה!', false);
    await loadCategories();  // רענון רשימת הקטגוריות
  } catch (error) {
    console.error('שגיאה בהוספת קטגוריה:', error);
    showStatus(`שגיאה בהוספת קטגוריה: ${error.message}`, true);
  }
}

async function deleteCategory(id) {
  if (!confirm('אתה בטוח שברצונך למחוק את הקטגוריה?')) return;
  try {
    await deleteDoc(doc(db, 'categories', id));
    showStatus('קטגוריה נמחקה בהצלחה.', false);
    await loadCategories();
  } catch (error) {
    console.error('שגיאה במחיקת קטגוריה:', error);
    showStatus(`שגיאה במחיקת קטגוריה: ${error.message}`, true);
  }
}



  // --- טיפול בשינוי קישורי וידאו ---
  function handleVideoLinksChange(e) {
    const lines = e.target.value.split('\n');
    setVideoLinks(lines);
  }

  // --- אין הרשאה ---
  if (user === null) {
    return (
      <main style={{ padding: 20, textAlign: 'center' }}>
        <h1>אין גישה</h1>
        <p>אין לך הרשאה לצפות בדף זה. אנא התחבר עם חשבון אדמין.</p>
      </main>
    );
  }

  // --- UI ---
  return (
    <main
      style={{
        maxWidth: 1200,
        margin: 'auto',
        padding: 20,
        direction: 'rtl',
        fontFamily: 'Arial, sans-serif',
      }}
    >
      <h1 style={{ marginBottom: 20 }}>ניהול מוצרים - דף אדמין</h1>

      {formStatusMessage && (
        <div
          style={{
            marginBottom: 20,
            padding: '10px 20px',
            borderRadius: 4,
            color: formStatusIsError ? 'red' : 'green',
            backgroundColor: formStatusIsError ? '#ffd6d6' : '#d6ffd6',
          }}
        >
          {formStatusMessage}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        style={{ border: '1px solid #ccc', padding: 20, borderRadius: 8, marginBottom: 40 }}
      >
        <h2>{productId ? 'עריכת מוצר' : 'הוספת מוצר חדש'}</h2>

        <div style={{ marginBottom: 15 }}>
          <label>
            שם מוצר:<br />
            <input
              type="text"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              required
              style={{ width: '100%', padding: 8, fontSize: 16 }}
            />
          </label>
        </div>

        <div style={{ marginBottom: 15 }}>
          <label>
            תיאור:<br />
            <textarea
              value={productDescription}
              onChange={(e) => setProductDescription(e.target.value)}
              rows={3}
              style={{ width: '100%', padding: 8, fontSize: 16 }}
            />
          </label>
        </div>

        <div style={{ marginBottom: 15 }}>
          <label>
            קישור למוצר (URL):<br />
            <input
              type="url"
              value={productLink}
              onChange={(e) => setProductLink(e.target.value)}
              style={{ width: '100%', padding: 8, fontSize: 16 }}
            />
          </label>
        </div>

        <div style={{ marginBottom: 15 }}>
          <label>
            מחיר:<br />
            <input
              type="number"
              min="0"
              step="0.01"
              value={productPrice}
              onChange={(e) => setProductPrice(e.target.value)}
              placeholder="לדוגמה: 59.90"
              style={{ width: '100%', padding: 8, fontSize: 16 }}
            />
          </label>
        </div>

<fieldset style={{ marginBottom: 15 }}>
  <legend>קטגוריות (בחר אחת):</legend>
  {categories.map((cat) => (
    <label key={cat.id} style={{ marginRight: 15 }}>
      <input
        type="radio"
        name="category"
        value={cat.name}
        checked={selectedCategory === cat.name}
        onChange={() => setSelectedCategory(cat.name)}
      />{' '}
      {cat.name}
    </label>
  ))}
</fieldset>



        <div style={{ marginBottom: 15 }}>
          <label>
            תמונה ראשית:<br />
            <input
              ref={mainImageFileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => setMainImageFile(e.target.files[0])}
            />
          </label>
          {mainImagePreviewUrl && (
            <div style={{ marginTop: 10 }}>
              <img
                src={mainImagePreviewUrl}
                alt="תצוגה מקדימה"
                style={{ maxWidth: '200px', borderRadius: 6 }}
              />
            </div>
          )}
        </div>

        <div style={{ marginBottom: 15 }}>
          <label>
            גלריית תמונות (ניתן לבחור מספר קבצים):<br />
            <input
              ref={galleryImageFileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => setGalleryImageFiles(Array.from(e.target.files))}
            />
          </label>
          <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {galleryImagePreviews.map((url, idx) => (
              <img
                key={idx}
                src={url}
                alt={`תמונה בגלריה ${idx + 1}`}
                style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 6 }}
              />
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 15 }}>
          <label>
            קישורי וידאו (YouTube / TikTok) - כל קישור בשורה חדשה:<br />
            <textarea
              value={videoLinks.join('\n')}
              onChange={handleVideoLinksChange}
              rows={4}
              style={{ width: '100%', padding: 8, fontSize: 16 }}
            />
          </label>
          <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {videoEmbedUrls.map((embedUrl, idx) => (
<iframe
  key={idx}
  src={embedUrl}
  frameBorder="0"
  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
  allowFullScreen
  title={`וידאו ${idx + 1}`}
  style={{
    width: embedUrl.includes('tiktok.com') ? '325px' : '320px',
    height: embedUrl.includes('tiktok.com') ? '580px' : '180px',
    borderRadius: 6,
  }}
/>


            ))}
          </div>
        </div>

        <div>
          <button type="submit" style={{ padding: '10px 25px', fontSize: 16 }}>
            {productId ? 'עדכן מוצר' : 'הוסף מוצר'}
          </button>{' '}
          <button
            type="button"
            onClick={resetForm}
            style={{ padding: '10px 25px', fontSize: 16, marginLeft: 10 }}
          >
            נקה טופס
          </button>
        </div>
      </form>
<section style={{ marginTop: 40, borderTop: '1px solid #aaa', paddingTop: 20 }}>
  <h2>ניהול קטגוריות</h2>

  <div style={{ marginBottom: 15 }}>
    <input
      type="text"
      placeholder="הזן שם קטגוריה חדשה"
      value={newCategoryName}
      onChange={(e) => setNewCategoryName(e.target.value)}
      style={{ padding: 8, fontSize: 16, width: 300 }}
    />
    <button
      onClick={addCategory}
      style={{ padding: '9px 20px', fontSize: 16, marginLeft: 10 }}
    >
      הוסף קטגוריה
    </button>
  </div>

  <ul>
    {categories.length === 0 && <li>אין קטגוריות מוגדרות</li>}
    {categories.map((cat) => (
      <li key={cat.id} style={{ marginBottom: 6 }}>
        {cat.name}{' '}
        <button
          onClick={() => deleteCategory(cat.id)}
          style={{ color: 'red', marginLeft: 10 }}
          title="מחק קטגוריה"
        >
          מחק
        </button>
      </li>
    ))}
  </ul>
</section>

      <section>
        <h2>רשימת מוצרים ({loadingProducts ? 'טוען...' : allProducts.length})</h2>
<div style={{ overflowX: 'auto' }}>
  <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            direction: 'rtl',
            textAlign: 'right',
                  minWidth: 600 // חשוב כדי לאפשר גלילה כשצריך

          }}
        >
          <thead>
            <tr style={{ backgroundColor: '#ddd' }}>
              <th style={{ border: '1px solid #aaa', padding: '8px' }}>תמונה</th>
              <th style={{ border: '1px solid #aaa', padding: '8px' }}>שם מוצר</th>
              <th style={{ border: '1px solid #aaa', padding: '8px' }}>קטגוריות</th>
              <th style={{ border: '1px solid #aaa', padding: '8px' }}>מחיר</th>
              <th style={{ border: '1px solid #aaa', padding: '8px' }}>פעולות</th>
            </tr>
          </thead>
          <tbody>
            {allProducts.map((p) => (
              <tr key={p.id} style={{ borderBottom: '1px solid #ccc' }}>
                <td style={{ border: '1px solid #aaa', padding: '4px' }}>
                  {p.image ? (
                    <img
                      src={p.image}
                      alt={p.name}
                      style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 6 }}
                    />
                  ) : (
                    'אין תמונה'
                  )}
                </td>
<td
  style={{
    border: '1px solid #aaa',
    padding: '4px',
    maxWidth: 180, // הגבלת רוחב
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    direction: 'rtl',
  }}
  title={p.name}
>
  {p.name}
</td>
<td style={{ border: '1px solid #aaa', padding: '4px' }}>
  {typeof p.category === 'string' ? p.category : (Array.isArray(p.category) ? p.category.join(', ') : '-')}
</td>
                <td style={{ border: '1px solid #aaa', padding: '4px' }}>
                  {p.price != null ? p.price.toFixed(2) : '-'}
                </td>
                <td style={{ border: '1px solid #aaa', padding: '4px' }}>
                  <button onClick={() => editProduct(p.id)} style={{ marginRight: 10 }}>
                    עריכה
                  </button>
                  <button onClick={() => deleteProduct(p.id)} style={{ color: 'red' }}>
                    מחיקה
                  </button>
                </td>
              </tr>
            ))}
            {allProducts.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: 15, textAlign: 'center' }}>
                  לא נמצאו מוצרים
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>

      </section>
    </main>
  );
}
