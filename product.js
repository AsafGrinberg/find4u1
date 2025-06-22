// קובץ product.js - טוען מוצר לפי id מה-URL
const urlParams = new URLSearchParams(window.location.search);
const productId = parseInt(urlParams.get('id'));
const product = products.find(p => p.id === productId);

if (product) {
  document.getElementById('productTitle').textContent = product.text;
  document.getElementById('productDescription').textContent = product.description;
  document.getElementById('buyButton').href = product.link;

  const gallery = document.getElementById('imageGallery');
  product.gallery.forEach(imgUrl => {
    const img = document.createElement('img');
    img.src = imgUrl;
    img.style.maxWidth = '300px';
    img.style.borderRadius = '12px';
    gallery.appendChild(img);
  });

} else {
  document.querySelector('main').innerHTML = '<p>המוצר לא נמצא.</p>';
}