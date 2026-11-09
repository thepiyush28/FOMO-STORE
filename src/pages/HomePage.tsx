import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Category, DeliveryMode, DemoProduct, StoreConfig } from '../types';
import { CATEGORIES, DEMO_PRODUCTS, STORE_INITIAL_CONFIG } from '../data/mockData';
import { Header } from '../components/layout/Header';
import { BottomNav } from '../components/layout/BottomNav';
import { Footer } from '../components/layout/Footer';
import { StoreNoticeBanner } from '../components/home/StoreNoticeBanner';
import { HeroBanner } from '../components/home/HeroBanner';
import { SearchBar } from '../components/home/SearchBar';
import { CategoryChips } from '../components/home/CategoryChips';
import { PromoBanner } from '../components/home/PromoBanner';
import { ProductGrid } from '../components/home/ProductGrid';
import { StoreConfigModal } from '../components/home/StoreConfigModal';
import { CartPreviewModal } from '../components/home/CartPreviewModal';
import { DeliveryPickupModal } from '../components/home/DeliveryPickupModal';
import { ProductDetailsModal } from '../components/home/ProductDetailsModal';
import { PhoneOtpModal } from '../components/auth/PhoneOtpModal';
import { CustomerOrdersSection } from '../components/customer/CustomerOrdersSection';
import { CustomerAccountSection } from '../components/customer/CustomerAccountSection';
import { useAuth } from '../context/AuthContext';
import {
  clearCustomerCartInDb,
  fetchCustomerCartFromDb,
  fetchStorefrontCatalogAndSettings,
  isSupabaseConfigured,
  supabase,
  syncCustomerCartItemToDb,
} from '../lib/supabase';

const LOCAL_CART_STORAGE_KEY = 'fomo_store_guest_cart_v1';

export const HomePage: React.FC = () => {
  const { userId, profile, refreshProfile, signOut } = useAuth();
  const hasLiveConfig = isSupabaseConfigured();

  // Catalog & Store Settings state (truthful connection status: never claim live connection before fetch succeeds)
  const [categories, setCategories] = useState<Category[]>(() =>
    hasLiveConfig ? [{ id: 'all', name: 'All Categories' }] : CATEGORIES
  );
  const [products, setProducts] = useState<DemoProduct[]>(() =>
    hasLiveConfig ? [] : DEMO_PRODUCTS
  );
  const [storeConfig, setStoreConfig] = useState<StoreConfig>(() => ({
    ...STORE_INITIAL_CONFIG,
    isOpen: false,
    statusNotice: hasLiveConfig
      ? 'Connecting to live store settings…'
      : STORE_INITIAL_CONFIG.statusNotice,
    isLiveData: false,
    connectionStatus: hasLiveConfig ? 'connecting' : 'demo',
    connectionError: null,
  }));
  const [isLiveData, setIsLiveData] = useState<boolean>(false);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState<boolean>(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  // Delivery Mode state (delivery | pickup)
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>('delivery');

  // Search & Category Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Interactive Cart state (synced with localStorage for guests & Supabase carts/cart_items for signed-in users)
  const [cartQuantities, setCartQuantities] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_CART_STORAGE_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Mobile Bottom Nav active tab ('home' | 'categories' | 'cart' | 'orders' | 'account')
  const [activeTab, setActiveTab] = useState('home');

  // Modals state
  const [isStoreModalOpen, setIsStoreModalOpen] = useState(false);
  const [isCartModalOpen, setIsCartModalOpen] = useState(false);
  const [isDeliveryModalOpen, setIsDeliveryModalOpen] = useState(false);
  const [isOtpModalOpen, setIsOtpModalOpen] = useState(false);
  const [selectedProductForDetails, setSelectedProductForDetails] = useState<DemoProduct | null>(null);

  // Load storefront catalog & settings from Supabase (or labelled demo fallback)
  const loadStorefront = useCallback(async () => {
    setIsLoadingCatalog(true);
    setCatalogError(null);
    const res = await fetchStorefrontCatalogAndSettings();
    setCategories(res.categories);
    setProducts(res.products);
    setStoreConfig(res.storeConfig);
    setIsLiveData(res.isLiveData);
    setCatalogError(res.error);
    // If live store has not configured delivery fee or serviceable PIN codes yet,
    // default fulfillment mode to Store Pickup so only genuinely configured options are active by default.
    if (res.isLiveData) {
      const deliveryReady =
        res.storeConfig.deliveryFee !== null &&
        res.storeConfig.deliveryFee !== undefined &&
        Array.isArray(res.storeConfig.serviceablePincodes) &&
        res.storeConfig.serviceablePincodes.length > 0;
      if (!deliveryReady) {
        setDeliveryMode('pickup');
      }
    }
    setSelectedCategory((prev) =>
      prev === 'all' || res.categories.some((c) => c.id === prev) ? prev : 'all'
    );
    setIsLoadingCatalog(false);
  }, []);

  useEffect(() => {
    loadStorefront();
  }, [loadStorefront]);

  // Realtime subscription: keep customer storefront synchronized with store_settings, products, categories & inventory
  useEffect(() => {
    const client = supabase;
    if (!client) return;

    const channel = client
      .channel('storefront-live-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'store_settings' }, () => {
        loadStorefront();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        loadStorefront();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, () => {
        loadStorefront();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, () => {
        loadStorefront();
      })
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [loadStorefront]);

  // Persist guest cart to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_CART_STORAGE_KEY, JSON.stringify(cartQuantities));
    } catch {
      // ignore storage quota errors
    }
  }, [cartQuantities]);

  // Load & merge persistent cart from Supabase when user signs in
  useEffect(() => {
    if (!userId || !isLiveData) return;
    let active = true;
    fetchCustomerCartFromDb(userId)
      .then((dbCart) => {
        if (!active) return;
        if (Object.keys(dbCart).length > 0) {
          setCartQuantities((prev) => {
            const merged = { ...dbCart };
            for (const [k, v] of Object.entries(prev)) {
              merged[k] = Math.max(merged[k] || 0, v);
            }
            return merged;
          });
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [userId, isLiveData]);

  // Cart operations
  const handleAddToCart = (product: DemoProduct) => {
    if (!product.inStock) return;
    const nextQty = (cartQuantities[product.id] || 0) + 1;
    setCartQuantities((prev) => ({
      ...prev,
      [product.id]: nextQty,
    }));
    if (userId && isLiveData && !product.isDemoItem) {
      syncCustomerCartItemToDb(userId, product.id, nextQty).catch(() => {});
    }
  };

  const handleIncrement = (productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (product && !product.inStock) return;
    const nextQty = (cartQuantities[productId] || 0) + 1;
    setCartQuantities((prev) => ({
      ...prev,
      [productId]: nextQty,
    }));
    if (userId && isLiveData && product && !product.isDemoItem) {
      syncCustomerCartItemToDb(userId, productId, nextQty).catch(() => {});
    }
  };

  const handleDecrement = (productId: string) => {
    const current = cartQuantities[productId] || 0;
    const nextQty = current <= 1 ? 0 : current - 1;
    setCartQuantities((prev) => {
      if (nextQty <= 0) {
        const updated = { ...prev };
        delete updated[productId];
        return updated;
      }
      return {
        ...prev,
        [productId]: nextQty,
      };
    });
    const product = products.find((p) => p.id === productId);
    if (userId && isLiveData && product && !product.isDemoItem) {
      syncCustomerCartItemToDb(userId, productId, nextQty).catch(() => {});
    }
  };

  const handleClearCart = () => {
    setCartQuantities({});
    if (userId && isLiveData) {
      clearCustomerCartInDb(userId).catch(() => {});
    }
  };

  const handleReorderItems = (items: Array<{ productId: string; quantity: number }>) => {
    setCartQuantities((prev) => {
      const updated = { ...prev };
      for (const item of items) {
        updated[item.productId] = (updated[item.productId] || 0) + item.quantity;
        if (userId && isLiveData) {
          syncCustomerCartItemToDb(userId, item.productId, updated[item.productId]).catch(() => {});
        }
      }
      return updated;
    });
    setIsCartModalOpen(true);
  };

  // Toggle Store Open/Closed locally in demo mode to test business rules
  const handleToggleStoreStatus = () => {
    setStoreConfig((prev) => {
      if (prev.isLiveData) return prev;
      const nextIsOpen = !prev.isOpen;
      return {
        ...prev,
        isOpen: nextIsOpen,
        statusNotice: nextIsOpen
          ? 'Store is currently OPEN for orders. [Demo mode status toggle]'
          : 'Store is temporarily closed while configuration is being finalized',
      };
    });
  };

  // Total items in cart
  const totalCartItems = Object.values(cartQuantities).reduce((a, b) => a + b, 0);

  // Tab selection handler
  const handleSelectTab = (tabId: string) => {
    if (tabId === 'cart') {
      setIsCartModalOpen(true);
      return;
    }
    setActiveTab(tabId);
    if (tabId === 'categories') {
      setTimeout(() => {
        const catElement = document.getElementById('categories-section');
        if (catElement) {
          catElement.scrollIntoView({ behavior: 'smooth' });
        }
      }, 50);
    } else if (tabId === 'home') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const scrollToProducts = () => {
    setActiveTab('home');
    setTimeout(() => {
      const el = document.getElementById('products-section');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      }
    }, 50);
  };

  return (
    <div className="min-h-screen bg-white flex flex-col selection:bg-brand-orange-tint selection:text-brand-navy">
      {/* 1. Top Header */}
      <Header
        deliveryMode={deliveryMode}
        onSelectDeliveryMode={(mode) => setDeliveryMode(mode)}
        onOpenDeliveryModal={() => setIsDeliveryModalOpen(true)}
        storeConfig={storeConfig}
        onOpenStoreModal={() => setIsStoreModalOpen(true)}
        cartCount={totalCartItems}
        onOpenCartDemo={() => setIsCartModalOpen(true)}
      />

      {/* 2. Store Open/Closed configurable indicator banner */}
      <StoreNoticeBanner
        storeConfig={storeConfig}
        onOpenSettings={() => setIsStoreModalOpen(true)}
      />

      {/* Desktop Sub-Navigation Bar */}
      <div className="hidden md:block bg-slate-50 border-b border-slate-200/80 px-4 py-2">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            {[
              { id: 'home', label: 'Storefront Catalog' },
              { id: 'orders', label: 'My Orders & Live Tracking' },
              { id: 'account', label: 'Account & Saved Addresses' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleSelectTab(tab.id)}
                className={`px-3.5 py-1.5 rounded-lg font-bold transition-colors ${
                  activeTab === tab.id || (tab.id === 'home' && activeTab === 'categories')
                    ? 'bg-brand-navy text-white'
                    : 'text-slate-600 hover:bg-slate-200/70 hover:text-brand-navy'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 text-slate-500">
            <Link to="/admin" className="hover:text-brand-orange font-semibold">
              Owner Dashboard (/admin)
            </Link>
            <span>•</span>
            <Link to="/rider" className="hover:text-brand-orange font-semibold">
              Rider App (/rider)
            </Link>
          </div>
        </div>
      </div>

      {/* Main Content Area: Storefront, My Orders, or My Account */}
      <main className="flex-1">
        {activeTab === 'orders' ? (
          <CustomerOrdersSection
            userId={userId}
            products={products}
            onRequireLogin={() => setIsOtpModalOpen(true)}
            onReorderItems={handleReorderItems}
            onBackToShop={() => setActiveTab('home')}
          />
        ) : activeTab === 'account' ? (
          <CustomerAccountSection
            userId={userId}
            profile={profile}
            storeConfig={storeConfig}
            onRequireLogin={() => setIsOtpModalOpen(true)}
            onProfileUpdated={refreshProfile}
            onSignOut={signOut}
            onBackToShop={() => setActiveTab('home')}
          />
        ) : (
          <>
            {/* Hero Section with Brand Tagline & Delivery Mode UI */}
            <HeroBanner
              deliveryMode={deliveryMode}
              onSelectDeliveryMode={(mode) => setDeliveryMode(mode)}
              onOpenDeliveryModal={() => setIsDeliveryModalOpen(true)}
              storeConfig={storeConfig}
              onExploreClick={scrollToProducts}
            />

            <div className="max-w-6xl mx-auto px-4 py-4 space-y-6">
              {/* Search Bar */}
              <SearchBar
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                onClear={() => setSearchQuery('')}
              />

              {/* Category Chips */}
              <div id="categories-section">
                <CategoryChips
                  categories={categories}
                  selectedCategory={selectedCategory}
                  onSelectCategory={setSelectedCategory}
                  isLoading={isLoadingCatalog}
                  isLiveData={isLiveData}
                />
              </div>

              {/* Promotional Banner */}
              <PromoBanner
                bannerMessage={storeConfig.bannerMessage}
                isLiveData={isLiveData}
              />

              {/* Product Catalog Grid (Live Supabase or Labelled Demo Fallback) */}
              <div id="products-section">
                <ProductGrid
                  products={products}
                  cartQuantities={cartQuantities}
                  onAdd={handleAddToCart}
                  onIncrement={handleIncrement}
                  onDecrement={handleDecrement}
                  onViewDetails={setSelectedProductForDetails}
                  selectedCategory={selectedCategory}
                  searchQuery={searchQuery}
                  onClearSearch={() => setSearchQuery('')}
                  onResetCategory={() => setSelectedCategory('all')}
                  isLiveData={isLiveData}
                  isLoading={isLoadingCatalog}
                  error={catalogError}
                  onRetry={loadStorefront}
                />
              </div>
            </div>
          </>
        )}
      </main>

      {/* Footer */}
      <Footer storeConfig={storeConfig} />

      {/* Mobile Bottom Navigation */}
      <BottomNav
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        cartCount={totalCartItems}
      />

      {/* Modals */}
      <StoreConfigModal
        isOpen={isStoreModalOpen}
        onClose={() => setIsStoreModalOpen(false)}
        config={storeConfig}
        onToggleStatus={handleToggleStoreStatus}
      />

      <CartPreviewModal
        isOpen={isCartModalOpen}
        onClose={() => setIsCartModalOpen(false)}
        products={products}
        cartQuantities={cartQuantities}
        onIncrement={handleIncrement}
        onDecrement={handleDecrement}
        onClearCart={handleClearCart}
        storeConfig={storeConfig}
        deliveryMode={deliveryMode}
        onSelectDeliveryMode={setDeliveryMode}
        userId={userId}
        onRequireLogin={() => setIsOtpModalOpen(true)}
        onOrderPlaced={() => {
          loadStorefront();
        }}
        onViewOrders={() => setActiveTab('orders')}
      />

      <DeliveryPickupModal
        isOpen={isDeliveryModalOpen}
        onClose={() => setIsDeliveryModalOpen(false)}
        deliveryMode={deliveryMode}
        onSelectMode={(mode) => setDeliveryMode(mode)}
        storeConfig={storeConfig}
      />

      <ProductDetailsModal
        product={selectedProductForDetails}
        isOpen={Boolean(selectedProductForDetails)}
        onClose={() => setSelectedProductForDetails(null)}
        quantity={
          selectedProductForDetails ? cartQuantities[selectedProductForDetails.id] || 0 : 0
        }
        onAdd={handleAddToCart}
        onIncrement={handleIncrement}
        onDecrement={handleDecrement}
        onOpenCart={() => setIsCartModalOpen(true)}
      />

      <PhoneOtpModal
        isOpen={isOtpModalOpen}
        onClose={() => setIsOtpModalOpen(false)}
        onSuccess={() => {
          refreshProfile();
        }}
      />
    </div>
  );
};
