export default function ProductList({ products }) {
  return (
    <div className="products-grid">
      {products.map(product => (
        <div key={product.id} className="product-card">
          <img src={product.image} alt={product.title} width={200} />
          <h3>{product.title}</h3>
          <p>{product.price}</p>
          <a href={product.url} target="_blank" rel="noopener">
            קנה עכשיו
          </a>
        </div>
      ))}
    </div>
  );
}