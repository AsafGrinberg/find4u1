// פונקציה להחלפת קטגוריות
function showCategory(category, button) {
  const buttons = document.querySelectorAll('#categoryButtons button');
  buttons.forEach(btn => btn.classList.remove('active'));
  button.classList.add('active');

  const items = document.querySelectorAll('.grid-item');
  items.forEach(item => {
    if (category === 'all' || item.dataset.category === category) {
      item.style.display = 'flex';
      item.style.opacity = 1;
    } else {
      item.style.display = 'none';
      item.style.opacity = 0;
    }
  });

  // איפוס שורת החיפוש כשמשנים קטגוריה
  document.getElementById('searchInput').value = '';
}

// סינון חיפוש
const searchInput = document.getElementById('searchInput');
const products = document.querySelectorAll('.grid-item');

searchInput.addEventListener('input', () => {
  const filter = searchInput.value.toLowerCase();
  const activeCategoryBtn = document.querySelector('#categoryButtons button.active');
  const activeCategory = activeCategoryBtn ? activeCategoryBtn.textContent : 'כל המוצרים';

  products.forEach(product => {
    const matchesCategory = activeCategory === 'כל המוצרים' || product.dataset.category === activeCategoryBtn.getAttribute('onclick').match(/'(.+)'/)[1];
    const text = product.textContent.toLowerCase();

    if (matchesCategory && text.includes(filter)) {
      product.style.display = 'flex';
      product.style.opacity = 1;
    } else {
      product.style.display = 'none';
      product.style.opacity = 0;
    }
  });
});

window.onload = () => {
  showCategory('all', document.querySelector('#categoryButtons button.active'));
};
