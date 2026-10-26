import React, { useState } from 'react';
import { DeliveryMode, DemoProduct, StoreConfig } from '../types';
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

export const HomePage: React.FC = () => {
  // Configurable Store State (Placeholders)
  const [storeConfig, setStoreConfig] = useState<StoreConfig>(STORE_INITIAL_CONFIG);
  
  // Delivery Mode state (delivery | pickup)
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>('delivery');

  // Search & Category Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Interactive Cart state for demo quantity stepper
  const [cartQuantities, setCartQuantities] = useState<Record<string, number>>({});

  // Mobile Bottom Nav active tab
  const [activeTab, setActiveTab] = useState('home');

  // Modals state
  const [isStoreModalOpen, setIsStoreModalOpen] = useState(false);
  const [isCartModalOpen, setIsCartModalOpen] = useState(false);
  const [isDeliveryModalOpen, setIsDeliveryModalOpen] = useState(false);

  // Cart operations
  const handleAddToCart = (product: DemoProduct) => {
    if (!product.inStock) return;
    setCartQuantities((prev) => ({
      ...prev,
      [product.id]: (prev[product.id] || 0) + 1,
    }));
  };

  const handleIncrement = (productId: string) => {
    const product = DEMO_PRODUCTS.find((p) => p.id === productId);
    if (product && !product.inStock) return;
    setCartQuantities((prev) => ({
      ...prev,
      [productId]: (prev[productId] || 0) + 1,
    }));
  };

  const handleDecrement = (productId: string) => {
    setCartQuantities((prev) => {
      const current = prev[productId] || 0;
      if (current <= 1) {
        const updated = { ...prev };
        delete updated[productId];
        return updated;
      }
      return {
        ...prev,
        [productId]: current - 1,
      };
    });
  };

  const handleClearCart = () => {
    setCartQuantities({});
  };

  // Toggle Store Open/Closed to test business rules
  const handleToggleStoreStatus = () => {
    setStoreConfig((prev) => ({
      ...prev,
      isOpen: !prev.isOpen,
    }));
  };

  // Total items in cart
  const totalCartItems = Object.values(cartQuantities).reduce((a, b) => a + b, 0);

  // Tab selection handler
  const handleSelectTab = (tabId: string) => {
    setActiveTab(tabId);
    if (tabId === 'cart') {
      setIsCartModalOpen(true);
    } else if (tabId === 'categories') {
      // Smooth scroll to categories section
      const catElement = document.getElementById('categories-section');
      if (catElement) {
        catElement.scrollIntoView({ behavior: 'smooth' });
      }
    } else if (tabId === 'orders' || tabId === 'account') {
      alert(`The ${tabId.toUpperCase()} module is scheduled for development in future phases with Supabase Auth & Orders tables.`);
    }
  };

  const scrollToProducts = () => {
    const el = document.getElementById('products-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
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

      {/* 4. Store Open/Closed configurable indicator banner */}
      <StoreNoticeBanner
        storeConfig={storeConfig}
        onOpenSettings={() => setIsStoreModalOpen(true)}
      />

      {/* Main Content */}
      <main className="flex-1">
        {/* 2 & 3. Hero Section with Brand Tagline & Delivery Mode UI */}
        <HeroBanner
          deliveryMode={deliveryMode}
          onSelectDeliveryMode={(mode) => setDeliveryMode(mode)}
          onOpenDeliveryModal={() => setIsDeliveryModalOpen(true)}
          storeConfig={storeConfig}
          onExploreClick={scrollToProducts}
        />

        <div className="max-w-6xl mx-auto px-4 py-4 space-y-6">
          {/* 5. Search Bar */}
          <SearchBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onClear={() => setSearchQuery('')}
          />

          {/* 5. Category Chips */}
          <div id="categories-section">
            <CategoryChips
              categories={CATEGORIES}
              selectedCategory={selectedCategory}
              onSelectCategory={setSelectedCategory}
            />
          </div>

          {/* 6. Promotional Banner (Placeholder copy only) */}
          <PromoBanner />

          {/* 7. Popular Products & New Arrivals (Demo items) */}
          <div id="products-section">
            <ProductGrid
              products={DEMO_PRODUCTS}
              cartQuantities={cartQuantities}
              onAdd={handleAddToCart}
              onIncrement={handleIncrement}
              onDecrement={handleDecrement}
              selectedCategory={selectedCategory}
              searchQuery={searchQuery}
              onClearSearch={() => setSearchQuery('')}
              onResetCategory={() => setSelectedCategory('all')}
            />
          </div>
        </div>
      </main>

      {/* Footer */}
      <Footer storeConfig={storeConfig} />

      {/* 8. Mobile Bottom Navigation */}
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
        products={DEMO_PRODUCTS}
        cartQuantities={cartQuantities}
        onIncrement={handleIncrement}
        onDecrement={handleDecrement}
        onClearCart={handleClearCart}
        storeConfig={storeConfig}
      />

      <DeliveryPickupModal
        isOpen={isDeliveryModalOpen}
        onClose={() => setIsDeliveryModalOpen(false)}
        deliveryMode={deliveryMode}
        onSelectMode={(mode) => setDeliveryMode(mode)}
        storeConfig={storeConfig}
      />
    </div>
  );
};
