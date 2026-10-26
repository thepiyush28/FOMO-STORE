import React from 'react';
import { DeliveryMode, StoreConfig } from '../../types';
import { Truck, Store, ArrowRight, ShieldCheck } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

interface HeroBannerProps {
  deliveryMode: DeliveryMode;
  onSelectDeliveryMode: (mode: DeliveryMode) => void;
  onOpenDeliveryModal: () => void;
  storeConfig: StoreConfig;
  onExploreClick: () => void;
}

export const HeroBanner: React.FC<HeroBannerProps> = ({
  deliveryMode,
  onSelectDeliveryMode,
  onOpenDeliveryModal,
  storeConfig,
  onExploreClick,
}) => {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-brand-grey-blue/60 via-white to-white pt-8 pb-10 border-b border-slate-100">
      <div className="max-w-6xl mx-auto px-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          
          {/* Left Column: Slogan Typography matching references */}
          <div className="lg:col-span-7 text-left space-y-5">
            {/* Supermarket town badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-brand-orange/30 shadow-sm text-xs text-brand-navy">
              <span className="w-2 h-2 rounded-full bg-brand-orange animate-pulse" />
              <span className="font-bold tracking-wider uppercase text-[11px] text-brand-navy">
                Physical Supermarket & Delivery
              </span>
              <span className="text-slate-300">|</span>
              <span className="font-semibold text-brand-orange">Rajauli, Bihar</span>
            </div>

            {/* Authentic Brand Slogan Typography */}
            <div className="space-y-1">
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-brand-navy font-display leading-[1.1]">
                <span>Your Town.</span> <br />
                <span className="text-brand-orange italic font-display">Everything</span> <br />
                <span>You Need.</span>
              </h1>
            </div>

            {/* Sub-text Tagline line matching reference typography */}
            <p className="text-xs sm:text-sm font-bold tracking-[0.15em] sm:tracking-[0.2em] text-brand-navy/80 uppercase font-sans">
              Rajauli · Nawada · Bihar
            </p>

            <p className="text-sm sm:text-base text-slate-600 max-w-xl leading-relaxed">
              One catalogue, one inventory, and the same fair price whether you walk into our neighbourhood store or order for doorstep delivery in Rajauli.
            </p>

            {/* Mode selection card inside hero */}
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-soft max-w-lg space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  How would you like to shop today?
                </span>
                <button
                  onClick={onOpenDeliveryModal}
                  className="text-[11px] text-brand-navy hover:text-brand-orange underline font-semibold transition-colors"
                >
                  View Details & Radius
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => onSelectDeliveryMode('delivery')}
                  className={`p-3 sm:p-3.5 rounded-xl border text-left transition-all touch-target flex flex-col justify-between ${
                    deliveryMode === 'delivery'
                      ? 'border-brand-orange bg-brand-orange-tint/40 ring-2 ring-brand-orange/30'
                      : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <Truck className={`w-5 h-5 ${deliveryMode === 'delivery' ? 'text-brand-orange' : 'text-slate-500'}`} />
                    <span className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${deliveryMode === 'delivery' ? 'border-brand-orange bg-brand-orange' : 'border-slate-300'}`}>
                      {deliveryMode === 'delivery' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs sm:text-sm font-bold text-brand-navy block">Doorstep Delivery</span>
                    <span className="text-[10px] sm:text-[11px] text-slate-500 block mt-0.5 font-mono break-words leading-tight">
                      Fee: {storeConfig.deliveryFeePlaceholder}
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => onSelectDeliveryMode('pickup')}
                  className={`p-3 sm:p-3.5 rounded-xl border text-left transition-all touch-target flex flex-col justify-between ${
                    deliveryMode === 'pickup'
                      ? 'border-brand-navy bg-brand-grey-blue ring-2 ring-brand-navy/30'
                      : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <Store className={`w-5 h-5 ${deliveryMode === 'pickup' ? 'text-brand-navy' : 'text-slate-500'}`} />
                    <span className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${deliveryMode === 'pickup' ? 'border-brand-navy bg-brand-navy' : 'border-slate-300'}`}>
                      {deliveryMode === 'pickup' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs sm:text-sm font-bold text-brand-navy block">Store Pickup</span>
                    <span className="text-[10px] sm:text-[11px] text-slate-500 block mt-0.5">
                      Ready at counter
                    </span>
                  </div>
                </button>
              </div>

              {/* Action row with strict contrast button (Navy text on Orange) */}
              <div className="pt-1 flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center">
                <Button
                  variant="primary"
                  onClick={onExploreClick}
                  className="gap-2 text-brand-navy font-bold shadow-md"
                >
                  <span>Explore Demo Products</span>
                  <ArrowRight className="w-4 h-4 text-brand-navy" />
                </Button>
                <div className="flex items-center gap-1.5 text-xs text-slate-500 px-2 justify-center">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>One Price Guarantee</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Visual Lockup with Brand Slogan Graphic */}
          <div className="lg:col-span-5 flex justify-center">
            <div className="relative w-full max-w-md bg-white p-6 rounded-3xl border-2 border-brand-orange/30 shadow-card text-center">
              {/* Reference image lockup */}
              <div className="relative rounded-2xl overflow-hidden bg-brand-grey-blue/50 p-6 flex flex-col items-center justify-center border border-slate-100">
                <img
                  src="/brand/slogan.png"
                  alt="FOMO Store - Your Town. Everything You Need."
                  className="w-full max-w-[280px] h-auto object-contain mx-auto drop-shadow-sm"
                />
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span className="font-semibold text-brand-navy">Brand Visual Spec</span>
                <Badge variant="placeholder" size="sm">
                  Active Reference Asset
                </Badge>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};
