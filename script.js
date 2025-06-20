let activeCategory = 'all';
let fuse;

function displayProducts(items) {
  const container = document.getElementById('productsGrid');
  container.classList.add('fade-out');

  setTimeout(() => {
    container.innerHTML = '';

    if (items.length === 0) {
      container.innerHTML = '<p class="no-results">לא נמצאו מוצרים</p>';
    } else {
      items.forEach(product => {
        const a = document.createElement('a');
        a.href = `product.html?id=${product.id}`; // כאן הקישור לדף מוצר
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

function showCategory(category, button) {
  activeCategory = category;

  const buttons = document.querySelectorAll('#categoryButtons button');
  buttons.forEach(btn => btn.classList.remove('active'));
  button.classList.add('active');
  document.getElementById('categoryButtons').classList.remove('show');

  filterProducts();
}

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
  showSuggestions(input, filtered);
}

function showSuggestions(input, items) {
  let list = document.querySelector('.autocomplete-list');
  if (!list) {
    list = document.createElement('ul');
    list.className = 'autocomplete-list';
    document.querySelector('.search-container').appendChild(list);
  }
  list.innerHTML = '';

  if (input.length === 0) return;

  const suggestions = items.slice(0, 5);
  suggestions.forEach(item => {
    const li = document.createElement('li');
    li.textContent = item.text;
    li.onclick = () => {
      document.getElementById('searchInput').value = item.text;
      filterProducts();
      list.innerHTML = '';
    };
    list.appendChild(li);
  });
}

window.onload = () => {
  displayProducts(products);

  const menuToggle = document.querySelector('.menu-toggle');
  const navCategories = document.getElementById('categoryButtons');

  if (menuToggle && navCategories) {
    menuToggle.addEventListener('click', () => {
      navCategories.classList.toggle('show');
    });
  }
};

document.getElementById('searchInput').addEventListener('input', filterProducts);
document.getElementById('searchInput').addEventListener('keydown', function (event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    filterProducts();
    document.querySelector('.autocomplete-list').innerHTML = '';
  }
});
// כבר יש לך את כל הפונקציות... ואז בסוף:
document.getElementById('googleLoginBtn').addEventListener('click', function(e) {
  e.preventDefault();
  alert("כאן תפעיל התחברות עם Google דרך Firebase או OAuth שלך");
});


