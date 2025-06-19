let activeCategory = 'all';

function displayProducts(items) {
  const container = document.getElementById('productsGrid');
  container.innerHTML = '';

  if (items.length === 0) {
    container.innerHTML = '<p>לא נמצאו מוצרים</p>';
    return;
  }

  items.forEach(product => {
    const a = document.createElement('a');
    a.href = product.link;
    a.target = '_blank';
    a.className = 'grid-item';
    a.dataset.category = product.category.join(','); // לשם נוחות, אך לא חובה

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

function showCategory(category, button) {
  activeCategory = category;

  const buttons = document.querySelectorAll('#categoryButtons button');
  buttons.forEach(btn => btn.classList.remove('active'));
  button.classList.add('active');

  filterProducts();
}

function filterProducts() {
  const input = document.getElementById('searchInput').value.toLowerCase();

  let filtered = products;

  if (activeCategory !== 'all') {
    filtered = filtered.filter(p => p.category.includes(activeCategory));
  }

  if (input) {
    filtered = filtered.filter(p => p.text.toLowerCase().includes(input));
  }

  displayProducts(filtered);
}

window.onload = () => {
  displayProducts(products);
};
