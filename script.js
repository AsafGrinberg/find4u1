let activeCategory = 'all';
let fuse;

// פונקציה שמציגה את המוצרים בדף
function displayProducts(items) {
  const container = document.getElementById('productsGrid');

  container.classList.add('fade-out');

  setTimeout(() => {
    container.innerHTML = '';

    if (items.length === 0) {
      container.innerHTML = '<p>לא נמצאו מוצרים</p>';
    } else {
      items.forEach(product => {
        const a = document.createElement('a');
        a.href = product.link;
        a.target = '_blank';
        a.className = 'grid-item';
        a.dataset.category = product.category.join(',');

        const img = document.createElement('img');
        img.src = product.image;
        img.alt = product.alt;

        const p = document.createElement('p');
        p.textContent = product.text;

        a.appendChild(img);
        a.appendChild(p);
        container.appendChild(a);
      });
    }

    container.classList.remove('fade-out');
    container.classList.add('fade-in');

    setTimeout(() => {
      container.classList.remove('fade-in');
    }, 400);

  }, 400);
}

// פונקציה לבחירת קטגוריה
function showCategory(category, button) {
  activeCategory = category;

  const buttons = document.querySelectorAll('#categoryButtons button');
  buttons.forEach(btn => btn.classList.remove('active'));
  button.classList.add('active');
  document.getElementById('categoryButtons').classList.remove('show');


  filterProducts();
}

// פונקציה לסינון לפי חיפוש וקטגוריה
function filterProducts() {
  const input = document.getElementById('searchInput').value.trim();

  let filtered = products;

  if (activeCategory !== 'all') {
    filtered = filtered.filter(p => p.category.includes(activeCategory));
  }

  if (input.length > 0) {
    if (!fuse) {
      fuse = new Fuse(filtered, {
        keys: ['text'],
        threshold: 0.4,
        ignoreLocation: true,
        isCaseSensitive: false,
      });
    } else {
      fuse.setCollection(filtered);
    }

    const result = fuse.search(input);
    filtered = result.map(r => r.item);
  }

  displayProducts(filtered);
}

// קוד שמריץ הכל בהעלאת הדף
window.onload = () => {
  displayProducts(products);

  // פתיחת תפריט המבורגר במובייל
  const menuToggle = document.querySelector('.menu-toggle');
  const navCategories = document.getElementById('categoryButtons');

  if (menuToggle && navCategories) {
    menuToggle.addEventListener('click', () => {
      navCategories.classList.toggle('show');
    });
  }
};

// אפשרות לחיפוש גם עם אנטר
document.getElementById('searchInput').addEventListener('keydown', function(event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    filterProducts();
  }
});
