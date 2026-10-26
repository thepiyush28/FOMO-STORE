import React from 'react';
import { MapPin, ShoppingBag, Clock } from 'lucide-react';
import { DeliveryMode, StoreConfig } from '../../types';
import { Badge } from '../ui/Badge';

interface HeaderProps {
  deliveryMode: DeliveryMode;
  onSelectDeliveryMode: (mode: DeliveryMode) => void;
  onOpenDeliveryModal: () => void;
  storeConfig: StoreConfig;
  onOpenStoreModal: () => void;
  cartCount: number;
  onOpenCartDemo: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  deliveryMode,
  onSelectDeliveryMode,
  onOpenDeliveryModal,
  storeConfig,
  onOpenStoreModal,
  cartCount,
  onOpenCartDemo,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-sm transition-all">
      {/* Top micro-bar: Location & Store Status Banner */}
      <div className="bg-brand-grey-blue border-b border-slate-200/70 px-3 sm:px-4 py-1.5 text-xs">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
          {/* Location / Town Indicator - click to view delivery radius & store address */}
          <button
            onClick={onOpenDeliveryModal}
            className="flex items-center gap-1.5 text-brand-navy font-medium truncate text-left hover:text-brand-orange transition-colors"
            title="Click to view delivery areas & store pickup address"
          >
            <MapPin className="w-3.5 h-3.5 text-brand-orange flex-shrink-0" />
            <span className="font-semibold text-brand-navy">Rajauli, Nawada, Bihar</span>
            <span className="text-slate-400 hidden sm:inline">•</span>
            <span className="text-slate-500 hidden md:inline text-[11px] truncate max-w-[200px] lg:max-w-none">
              {storeConfig.addressPlaceholder}
            </span>
          </button>

          {/* Store Open/Closed indicator (explicit placeholder toggle) */}
          <button
            onClick={onOpenStoreModal}
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-full hover:bg-slate-200/60 transition-colors flex-shrink-0"
            title="Click to view store operating status"
          >
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            {storeConfig.isOpen ? (
              <Badge variant="green" size="sm" className="font-semibold">
                ● Store Open
              </Badge>
            ) : (
              <Badge variant="red" size="sm" className="font-semibold">
                ● Store Closed
              </Badge>
            )}
            <span className="text-[10px] text-amber-700 font-mono hidden md:inline">
              [Configurable]
            </span>
          </button>
        </div>
      </div>

      {/* Main Header Row */}
      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between gap-2 sm:gap-3">
        {/* Brand identity: Logo & Name */}
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          <a href="#" className="flex items-center gap-2 group">
            <img
              src="/brand/logo.jpeg"
              alt="FOMO Store Logo"
              className="w-9 h-9 sm:w-10 sm:h-10 object-contain rounded-lg border border-brand-orange/20 shadow-sm group-hover:scale-105 transition-transform"
            />
            <div className="flex flex-col">
              <span className="text-lg sm:text-xl font-extrabold tracking-tight text-brand-navy leading-none font-sans">
                FOMO <span className="text-brand-orange">STORE</span>
              </span>
              <span className="text-[9px] sm:text-[10px] font-medium tracking-wide text-slate-500 mt-0.5">
                SINCE 2026
              </span>
            </div>
          </a>
        </div>

        {/* Center: Delivery / Pickup Mode Toggle */}
        <div className="flex items-center bg-brand-grey-blue p-0.5 sm:p-1 rounded-xl border border-slate-200 flex-shrink-0">
          <button
            onClick={() => onSelectDeliveryMode('delivery')}
            className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs font-bold transition-all min-h-[36px] touch-target ${
              deliveryMode === 'delivery'
                ? 'bg-brand-navy text-white shadow-sm'
                : 'text-slate-600 hover:text-brand-navy'
            }`}
            aria-label="Select Doorstep Delivery"
          >
            <span>Delivery</span>
          </button>
          <button
            onClick={() => onSelectDeliveryMode('pickup')}
            className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs font-bold transition-all min-h-[36px] touch-target ${
              deliveryMode === 'pickup'
                ? 'bg-brand-navy text-white shadow-sm'
                : 'text-slate-600 hover:text-brand-navy'
            }`}
            aria-label="Select Store Pickup"
          >
            <span>Pickup</span>
          </button>
        </div>

        {/* Right side: Quick Cart button */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={onOpenCartDemo}
            className="relative flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-xl bg-brand-orange text-brand-navy font-bold text-xs sm:text-sm hover:bg-brand-orange-hover shadow-sm transition-transform active:scale-95 touch-target"
            title="Cart Demo (Prototype)"
          >
            <ShoppingBag className="w-4 h-4 text-brand-navy" />
            <span className="hidden sm:inline">Cart</span>
            <span className="bg-brand-navy text-white text-[11px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full font-bold">
              {cartCount}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
};
