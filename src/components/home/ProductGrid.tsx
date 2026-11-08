import React from 'react';
import { DemoProduct } from '../../types';
import { ProductCard } from './ProductCard';
import { Flame, Sparkles, AlertCircle, SearchX, RefreshCw, PackageOpen, CheckCircle2 } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

interface ProductGridProps {
  products: DemoProduct[];
  cartQuantities: Record<string, number>;
  onAdd: (product: DemoProduct) => void;
  onIncrement: (productId: string) => void;
  onDecrement: (productId: string) => void;
  onViewDetails?: (product: DemoProduct) => void;
  selectedCategory: string;
  searchQuery: string;
  onClearSearch: () => void;
  onResetCategory: () => void;
  isLiveData?: boolean;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export const ProductGrid: React.FC<ProductGridProps> = ({
  products,
  cartQuantities,
  onAdd,
  onIncrement,
  onDecrement,
  onViewDetails,
  selectedCategory,
  searchQuery,
  onClearSearch,
  onResetCategory,
  isLiveData = false,
  isLoading = false,
  error = null,
  onRetry,
}) => {
  const query = searchQuery.trim().toLowerCase();

  // Loading Skeleton State
  if (isLoading) {
    return (
      <div className="space-y-6 my-6" aria-busy="true" aria-label="Loading catalog">
        <div className="h-14 rounded-2xl bg-slate-100 animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div
              key={idx}
              className="rounded-2xl border border-slate-100 bg-white p-4 space-y-3 shadow-soft"
            >
              <div className="w-full aspect-square rounded-xl bg-slate-100 animate-pulse" />
              <div className="h-3 w-1/2 bg-slate-100 rounded animate-pulse" />
              <div className="h-4 w-4/5 bg-slate-100 rounded animate-pulse" />
              <div className="h-10 w-full bg-slate-100 rounded-xl animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Filter products based on search & category
  const filteredProducts = products.filter((item) => {
    const matchesCategory =
      selectedCategory === 'all' ||
      item.category === selectedCategory ||
      item.categoryId === selectedCategory;

    const matchesSearch =
      query === '' ||
      item.name.toLowerCase().includes(query) ||
      item.category.toLowerCase().includes(query) ||
      item.category.replace(/-/g, ' ').toLowerCase().includes(query) ||
      item.unit.toLowerCase().includes(query);

    return matchesCategory && matchesSearch;
  });

  const popularProducts = filteredProducts.filter((p) => p.isPopular);
  const newArrivals = filteredProducts.filter((p) => p.isNewArrival);
  const otherProducts = filteredProducts.filter((p) => !p.isPopular && !p.isNewArrival);

  const isCustomView = selectedCategory !== 'all' || query !== '';

  return (
    <div className="space-y-10 my-6">
      {/* Error / Retry Banner */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs text-rose-900">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-rose-950">Unable to load live Supabase catalog</p>
              <p className="text-rose-700 mt-1 leading-relaxed">{error}</p>
            </div>
          </div>
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry} className="gap-1.5 flex-shrink-0">
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Live Fetch</span>
            </Button>
          )}
        </div>
      )}

      {/* Mode Indicator Banner: Live vs Demo */}
      {!error && !isLiveData ? (
        <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-4 flex items-start gap-3 text-xs text-amber-900">
          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">
              Demo Mode Active (Supabase Environment Variables Not Configured)
            </p>
            <p className="text-amber-800 leading-relaxed">
              The items below are representative demo samples to test layout, category filtering,
              out-of-stock states, and quantity stepper interactions. Connect{' '}
              <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to load live
              store inventory and prices.
            </p>
          </div>
        </div>
      ) : !error && isLiveData ? (
        <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl px-4 py-3 flex items-center justify-between gap-3 text-xs text-emerald-950">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>
              <strong>Live Store Catalog Connected:</strong> Showing real-time products, prices, and
              stock availability from FOMO Store.
            </span>
          </div>
          {onRetry && (
            <button
              onClick={onRetry}
              className="inline-flex items-center gap-1 font-bold text-brand-navy hover:text-brand-orange underline"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>
          )}
        </div>
      ) : null}

      {/* Empty Live Catalog State */}
      {error && products.length === 0 ? null : products.length === 0 ? (
        <div className="text-center py-14 px-4 bg-brand-grey-blue rounded-2xl border border-slate-200 space-y-3">
          <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center mx-auto text-brand-navy shadow-sm">
            <PackageOpen className="w-7 h-7 text-brand-orange" />
          </div>
          <p className="text-base font-bold text-brand-navy">No active products in catalog yet</p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            The store owner has not published any active products yet. Products added in the Owner
            Dashboard (<code>/admin</code>) will appear here automatically.
          </p>
          {onRetry && (
            <div className="pt-2">
              <Button variant="outline" size="sm" onClick={onRetry} className="gap-1.5">
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reload Catalog</span>
              </Button>
            </div>
          )}
        </div>
      ) : isCustomView ? (
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
                Showing {filteredProducts.length} {isLiveData ? '' : 'demo '}
                {filteredProducts.length === 1 ? 'item' : 'items'}
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
                <p className="text-base font-bold text-brand-navy">No items match your filter</p>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  {query && selectedCategory !== 'all'
                    ? `No items found matching "${searchQuery}" in this category.`
                    : query
                    ? `No items match "${searchQuery}". Try searching "rice", "milk", or "soap".`
                    : 'No items currently in this category.'}
                </p>
              </div>

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
                  onViewDetails={onViewDetails}
                />
              ))}
            </div>
          )}
        </section>
      ) : (
        /* Standard Default View: Popular Items, New Arrivals & All Products */
        <>
          {popularProducts.length > 0 && (
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
                <Badge variant={isLiveData ? 'green' : 'orange'} size="sm">
                  {isLiveData ? 'Live Stock' : 'Demo Section'}
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
                    onViewDetails={onViewDetails}
                  />
                ))}
              </div>
            </section>
          )}

          {newArrivals.length > 0 && (
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
                      Newly added stock items & seasonal grocery lines
                    </p>
                  </div>
                </div>
                <Badge variant="placeholder" size="sm">
                  {isLiveData ? 'Fresh Catalog' : 'Sample Catalog'}
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
                    onViewDetails={onViewDetails}
                  />
                ))}
              </div>
            </section>
          )}

          {otherProducts.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-extrabold text-brand-navy tracking-tight">
                  {popularProducts.length === 0 && newArrivals.length === 0
                    ? 'All Store Products'
                    : 'More Store Items'}
                </h2>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {otherProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    quantity={cartQuantities[product.id] || 0}
                    onAdd={onAdd}
                    onIncrement={onIncrement}
                    onDecrement={onDecrement}
                    onViewDetails={onViewDetails}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
};
