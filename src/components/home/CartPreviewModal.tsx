import React from 'react';
import { DemoProduct, StoreConfig } from '../../types';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { ShoppingBag, Plus, Minus, Trash2, AlertCircle, ShieldAlert } from 'lucide-react';

interface CartPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: DemoProduct[];
  cartQuantities: Record<string, number>;
  onIncrement: (id: string) => void;
  onDecrement: (id: string) => void;
  onClearCart: () => void;
  storeConfig: StoreConfig;
}

export const CartPreviewModal: React.FC<CartPreviewModalProps> = ({
  isOpen,
  onClose,
  products,
  cartQuantities,
  onIncrement,
  onDecrement,
  onClearCart,
  storeConfig,
}) => {
  const cartItems = products.filter((p) => (cartQuantities[p.id] || 0) > 0);
  const totalItemsCount = Object.values(cartQuantities).reduce((acc, qty) => acc + qty, 0);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Demo Cart & Breakdown">
      <div className="space-y-4 text-sm">
        {/* Prototype Banner */}
        <div className="bg-amber-50 p-3 rounded-xl border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <span>
            <strong>Prototype Notice:</strong> Checkout, OTP authentication, and payment gateways are intentionally non-functional in Phase 1. Real prices will be configured in owner settings.
          </span>
        </div>

        {/* Closed store warning rule */}
        {!storeConfig.isOpen && (
          <div className="bg-rose-50 p-3 rounded-xl border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
            <span>
              <strong>Store Currently Closed:</strong> In accordance with FOMO Store business rules, checkout is locked while the store is closed.
            </span>
          </div>
        )}

        {/* Free Delivery Threshold Hint (Placeholders preserved) */}
        <div className="bg-brand-grey-blue p-3 rounded-xl border border-brand-grey-blue-border text-xs flex items-center justify-between">
          <span className="text-brand-navy font-semibold">
            Free Delivery Hint:
          </span>
          <span className="font-mono text-slate-600">
            [Add {storeConfig.freeDeliveryThresholdPlaceholder} for free delivery]
          </span>
        </div>

        {/* Cart Items List */}
        {cartItems.length === 0 ? (
          <div className="text-center py-8 text-slate-500 space-y-3">
            <div className="w-16 h-16 bg-brand-grey-blue rounded-full flex items-center justify-center mx-auto text-slate-400">
              <ShoppingBag className="w-8 h-8 text-slate-400" />
            </div>
            <div>
              <p className="font-bold text-brand-navy text-base">Your demo cart is empty</p>
              <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                Select any available demo items from the homepage to test quantity stepper and cart counts.
              </p>
            </div>
            <div className="pt-2">
              <Button variant="primary" size="sm" onClick={onClose}>
                <span>Explore Products</span>
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
            {cartItems.map((item) => {
              const qty = cartQuantities[item.id];
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200/80 gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <h5 className="font-bold text-brand-navy truncate text-xs">{item.name}</h5>
                    <span className="text-[11px] text-slate-400 block font-mono">
                      {item.pricePlaceholder} / {item.unit}
                    </span>
                  </div>

                  {/* Quantity Stepper */}
                  <div className="flex items-center bg-white rounded-lg border border-slate-200 shadow-xs">
                    <button
                      onClick={() => onDecrement(item.id)}
                      className="p-1.5 hover:bg-slate-100 rounded-l-lg touch-target flex items-center justify-center text-brand-navy"
                      aria-label={`Decrease ${item.name}`}
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="px-2 text-xs font-bold font-mono text-brand-navy min-w-[24px] text-center">
                      {qty}
                    </span>
                    <button
                      onClick={() => onIncrement(item.id)}
                      className="p-1.5 hover:bg-slate-100 rounded-r-lg touch-target flex items-center justify-center text-brand-navy"
                      aria-label={`Increase ${item.name}`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Bill Breakdown (Placeholder) */}
        {cartItems.length > 0 && (
          <div className="pt-3 border-t border-slate-200 space-y-1.5 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>Items Total ({totalItemsCount} demo items):</span>
              <span className="font-mono font-semibold">[Calculated at checkout]</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Delivery Fee:</span>
              <span className="font-mono font-semibold">{storeConfig.deliveryFeePlaceholder}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Promo Discount:</span>
              <span className="font-mono text-emerald-600 font-semibold">[Promo Applied]</span>
            </div>
            <div className="flex justify-between text-sm font-extrabold text-brand-navy pt-2 border-t border-slate-200">
              <span>Estimated Total:</span>
              <span className="font-mono text-brand-orange">[Demo Total Placeholder]</span>
            </div>
          </div>
        )}

        {/* Actions */}
        {cartItems.length > 0 && (
          <div className="pt-3 space-y-2">
            <Button
              variant="primary"
              fullWidth
              disabled={!storeConfig.isOpen}
              onClick={() => {
                alert('Phase 1 Prototype Notice: Real checkout and phone OTP login will be integrated in Phase 2 with Supabase.');
              }}
            >
              <span>Proceed to Checkout [Demo Only]</span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              fullWidth
              onClick={onClearCart}
              className="text-slate-500 hover:text-rose-600 gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Reset Demo Cart</span>
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
};
