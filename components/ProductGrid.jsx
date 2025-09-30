"use client";
import { useEffect, useState } from "react";

export default function ProductGrid({ defaultKeyword = "shoes" }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState(defaultKeyword);
  const [query, setQuery] = useState(defaultKeyword);

  useEffect(() => {
    async function fetchProducts() {
      setLoading(true);
      try {
        const res = await fetch(`/api/aliexpress?keyword=${encodeURIComponent(query)}`);
        const data = await res.json();
        setProducts(data);
      } catch (err) {
        console.error("Failed to load products:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchProducts();
  }, [query]);

  const handleSearch = (e) => {
    e.preventDefault();
    setQuery(keyword);
  };

  return (
    <div className="p-6">
      {/* Search Form */}
      <form onSubmit={handleSearch} className="flex justify-center gap-2 mb-6">
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="Search products..."
          className="border rounded-xl px-4 py-2 w-64 shadow-sm"
        />
        <button
          type="submit"
          className="bg-blue-600 text-white px-4 py-2 rounded-xl hover:bg-blue-700 transition"
        >
          Search
        </button>
      </form>

      {/* Loading State */}
      {loading && <p className="text-center">Loading...</p>}

      {/* No Results */}
      {!loading && products.length === 0 && (
        <p className="text-center">No products found.</p>
      )}

      {/* Products Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {products.map((p, idx) => (
          <div
            key={p.id}
            className="product-card fade-in"
            style={{
              animationDelay: `${idx * 0.08}s`,
            }}
          >
            <img
              src={p.image}
              alt={p.title}
              className="product-card-image"
            />
            <div className="product-card-info">
              <h3 className="product-card-title">{p.title}</h3>
              <p className="product-card-price">{p.price}</p>
              <a
                href={p.affiliateUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="product-card-buy"
              >
                Buy Now
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
