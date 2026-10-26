import React from 'react';
import { DemoProduct } from '../../types';
import { ProductCard } from './ProductCard';
import { Flame, Sparkles, AlertCircle, SearchX } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

interface ProductGridProps {
  products: DemoProduct[];
  cartQuantities: Record<string, number>;
  onAdd: (product: DemoProduct) => void;
  onIncrement: (productId: string) => void;
  onDecrement: (productId: string) => void;
  selectedCategory: string;
  searchQuery: string;
  onClearSearch: () => void;
  onResetCategory: () => void;
}

export const ProductGrid: React.FC<ProductGridProps> = ({
  products,
  cartQuantities,
  onAdd,
  onIncrement,
  onDecrement,
  selectedCategory,
  searchQuery,
  onClearSearch,
  onResetCategory,
}) => {
  const query = searchQuery.trim().toLowerCase();

  // Filter products based on search & category
  const filteredProducts = products.filter((item) => {
    const matchesCategory =
      selectedCategory === 'all' || item.category === selectedCategory;
    
    const matchesSearch =
      query === '' ||
      item.name.toLowerCase().includes(query) ||
      item.category.toLowerCase().includes(query) ||
      item.category.replace('-', ' ').toLowerCase().includes(query) ||
      item.unit.toLowerCase().includes(query);

    return matchesCategory && matchesSearch;
  });

  const popularProducts = filteredProducts.filter((p) => p.isPopular);
  const newArrivals = filteredProducts.filter((p) => p.isNewArrival);

  // If filtering or searching, display combined results
  const isCustomView = selectedCategory !== 'all' || query !== '';

  return (
    <div className="space-y-12 my-6">
      {/* Disclaimer on demo data */}
      <div className="bg-amber-50/60 border border-amber-200/80 rounded-2xl p-4 flex items-start gap-3 text-xs text-amber-900">
        <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold">
            Demo Inventory & Pricing Specification
          </p>
          <p className="text-amber-800 leading-relaxed">
            The items below are representative samples created exclusively to test layout, category filtering, out-of-stock states, and quantity stepper interactions. Actual store catalog, wholesale pricing, and SKU lists will be uploaded in the Owner Dashboard (/admin) prior to launch.
          </p>
        </div>
      </div>

      {isCustomView ? (
        /* Filtered/Searched View */
        <section>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="text-xl font-black text-brand-navy">
                {selectedCategory !== 'all' && query !== ''
                  ? `Search results in category`
                  : query !== ''
                  ? `Search results for "${searchQuery}"`
                  : `Filtered by category`}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Showing {filteredProducts.length} demo {filteredProducts.length === 1 ? 'item' : 'items'}
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              <Badge variant="placeholder" size="sm">
                Active Filter
              </Badge>
              <button
                onClick={() => {
                  onClearSearch();
                  onResetCategory();
                }}
                className="text-xs text-brand-orange hover:underline font-bold px-1"
              >
                Reset All
              </button>
            </div>
          </div>

          {filteredProducts.length === 0 ? (
            <div className="text-center py-12 px-4 bg-brand-grey-blue rounded-2xl border border-slate-200 space-y-3">
              <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mx-auto text-slate-400 shadow-sm">
                <SearchX className="w-6 h-6 text-slate-400" />
              </div>
              <div>
                <p className="text-base font-bold text-brand-navy">No demo items match your filter</p>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  {query && selectedCategory !== 'all'
                    ? `No items found matching "${searchQuery}" in this category.`
                    : query
                    ? `No demo items match "${searchQuery}". Try searching "rice", "milk", or "soap".`
                    : 'No items currently in this category.'}
                </p>
              </div>

              {/* Instant filter recovery actions */}
              <div className="pt-2 flex flex-wrap gap-2 justify-center">
                {query && (
                  <Button variant="outline" size="sm" onClick={onClearSearch}>
                    <span>Clear Search</span>
                  </Button>
                )}
                {selectedCategory !== 'all' && (
                  <Button variant="outline" size="sm" onClick={onResetCategory}>
                    <span>Show All Categories</span>
                  </Button>
                )}
                {query && selectedCategory !== 'all' && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      onClearSearch();
                      onResetCategory();
                    }}
                  >
                    <span>Reset All Filters</span>
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  quantity={cartQuantities[product.id] || 0}
                  onAdd={onAdd}
                  onIncrement={onIncrement}
                  onDecrement={onDecrement}
                />
              ))}
            </div>
          )}
        </section>
      ) : (
        /* Standard Default View: Popular Items & New Arrivals */
        <>
          {/* Section 1: Popular Items */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-brand-orange-tint flex items-center justify-center">
                  <Flame className="w-4 h-4 text-brand-orange" />
                </div>
                <div>
                  <h2 className="text-xl font-extrabold text-brand-navy tracking-tight">
                    Popular Items
                  </h2>
                  <p className="text-xs text-slate-500">
                    Daily staples most frequently ordered by local households
                  </p>
                </div>
              </div>
              <Badge variant="orange" size="sm">
                Demo Section
              </Badge>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {popularProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  quantity={cartQuantities[product.id] || 0}
                  onAdd={onAdd}
                  onIncrement={onIncrement}
                  onDecrement={onDecrement}
                />
              ))}
            </div>
          </section>

          {/* Section 2: New Arrivals */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-brand-grey-blue flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-brand-navy" />
                </div>
                <div>
                  <h2 className="text-xl font-extrabold text-brand-navy tracking-tight">
                    New Arrivals & Essentials
                  </h2>
                  <p className="text-xs text-slate-500">
                    Newly added demo stock items & seasonal grocery lines
                  </p>
                </div>
              </div>
              <Badge variant="placeholder" size="sm">
                Sample Catalog
              </Badge>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {newArrivals.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  quantity={cartQuantities[product.id] || 0}
                  onAdd={onAdd}
                  onIncrement={onIncrement}
                  onDecrement={onDecrement}
                />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
};
