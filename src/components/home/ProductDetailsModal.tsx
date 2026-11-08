import React, { useState } from 'react';
import { DemoProduct } from '../../types';
import { Modal } from '../ui/Modal';
import { Badge } from '../ui/Badge';
import {
  Package,
  Plus,
  Minus,
  CheckCircle2,
  Ban,
  ShoppingBag,
  Sparkles,
  Flame,
  ShieldCheck,
  Tag,
} from 'lucide-react';
import { formatCurrencyOrPlaceholder } from '../../lib/pricing';

interface ProductDetailsModalProps {
  product: DemoProduct | null;
  isOpen: boolean;
  onClose: () => void;
  quantity: number;
  onAdd: (product: DemoProduct) => void;
  onIncrement: (productId: string) => void;
  onDecrement: (productId: string) => void;
  onOpenCart?: () => void;
}

export const ProductDetailsModal: React.FC<ProductDetailsModalProps> = ({
  product,
  isOpen,
  onClose,
  quantity,
  onAdd,
  onIncrement,
  onDecrement,
  onOpenCart,
}) => {
  const [imgError, setImgError] = useState(false);

  if (!product) return null;

  const displayPrice =
    product.price !== null && product.price !== undefined
      ? formatCurrencyOrPlaceholder(product.price, product.pricePlaceholder)
      : product.pricePlaceholder;

  const displayMrp =
    product.mrp !== null && product.mrp !== undefined && Number(product.mrp) > Number(product.price ?? 0)
      ? formatCurrencyOrPlaceholder(product.mrp, '')
      : product.isDemoItem
      ? product.mrpPlaceholder
      : '';

  const savings =
    product.price !== null &&
    product.price !== undefined &&
    product.mrp !== null &&
    product.mrp !== undefined &&
    Number(product.mrp) > Number(product.price)
      ? Number(product.mrp) - Number(product.price)
      : null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Product Details"
      maxWidth="max-w-lg"
    >
      <div className="space-y-5">
        {/* Product Image Section */}
        <div className="relative w-full aspect-square sm:aspect-[4/3] bg-brand-grey-blue rounded-2xl flex flex-col items-center justify-center p-6 border border-slate-100 overflow-hidden">
          {product.imageUrl && !imgError ? (
            <img
              src={product.imageUrl}
              alt={product.name}
              onError={() => setImgError(true)}
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-center p-4">
              <Package className="w-20 h-20 text-brand-navy/25 mb-3" />
              <span className="text-xs font-mono font-semibold text-slate-400 uppercase tracking-wider">
                {product.isDemoItem ? '[Sample Product Image]' : 'FOMO Store Product'}
              </span>
            </div>
          )}

          {/* Badges on image */}
          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[80%]">
            {product.isDemoItem && (
              <Badge variant="placeholder" size="sm">
                Demo Item
              </Badge>
            )}
            {product.isPopular && (
              <Badge variant="orange" size="sm" className="flex items-center gap-1">
                <Flame className="w-3 h-3 text-brand-orange" />
                <span>Popular</span>
              </Badge>
            )}
            {product.isNewArrival && (
              <Badge variant="navy" size="sm" className="flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-brand-orange" />
                <span>New Arrival</span>
              </Badge>
            )}
            {product.discountPercent && (
              <Badge variant="orange" size="sm" className="font-extrabold">
                {product.discountPercent}
              </Badge>
            )}
          </div>

          {/* Out of Stock Overlay */}
          {!product.inStock && (
            <div className="absolute inset-0 bg-white/85 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center">
              <Ban className="w-10 h-10 text-rose-600 mb-2" />
              <span className="text-sm font-bold text-rose-700">Currently Out of Stock</span>
              <span className="text-xs text-slate-500 font-mono mt-1">
                Restocking soon at FOMO Store Rajauli
              </span>
            </div>
          )}
        </div>

        {/* Product Information */}
        <div className="space-y-3">
          {/* Category & Unit header */}
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="uppercase tracking-wider font-semibold text-slate-400">
              {product.category.replace(/-/g, ' ')}
            </span>
            <span className="font-medium bg-slate-100 px-2.5 py-0.5 rounded-full text-slate-700">
              Pack Size: <strong className="text-brand-navy">{product.unit}</strong>
            </span>
          </div>

          {/* Product Name */}
          <h2 className="text-lg sm:text-xl font-black text-brand-navy leading-snug">
            {product.name}
          </h2>

          {/* Stock Status Indicator */}
          <div className="flex items-center gap-2 pt-0.5">
            {product.inStock ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2.5 py-1 rounded-lg">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>In Stock • Ready for Doorstep Delivery & Store Pickup</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200/80 px-2.5 py-1 rounded-lg">
                <Ban className="w-4 h-4 text-rose-600" />
                <span>Out of Stock</span>
              </span>
            )}
          </div>

          {/* Price & Savings Card */}
          <div className="bg-brand-grey-blue p-4 rounded-2xl border border-slate-200/80 flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="text-[11px] text-slate-500 font-medium block">FOMO Store Price</span>
              <div className="flex items-baseline gap-2.5 mt-0.5">
                <span className="text-2xl font-black text-brand-navy font-mono">
                  {displayPrice}
                </span>
                {displayMrp && (
                  <span className="text-sm text-slate-400 line-through font-mono">
                    {displayMrp}
                  </span>
                )}
              </div>
            </div>

            {savings !== null && savings > 0 && (
              <div className="bg-emerald-100/80 border border-emerald-300 text-emerald-900 px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-emerald-700" />
                <span>Save ₹{savings.toFixed(0)}</span>
              </div>
            )}
          </div>

          {/* FOMO Store Promise */}
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200/60 text-xs text-slate-600">
            <ShieldCheck className="w-4 h-4 text-brand-orange flex-shrink-0 mt-0.5" />
            <div>
              <strong className="text-brand-navy">Single-Price Supermarket Guarantee:</strong> Every item is sold at the exact same transparent price in-store at Rajauli as in the mobile app.
            </div>
          </div>
        </div>

        {/* Action Bar: Quantity Controls & Add to Cart */}
        <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row items-center gap-3">
          {!product.inStock ? (
            <button
              disabled
              className="w-full min-h-[48px] rounded-xl bg-slate-100 text-slate-400 text-xs font-bold border border-slate-200 cursor-not-allowed flex items-center justify-center"
            >
              Unavailable — Out of Stock
            </button>
          ) : quantity === 0 ? (
            <button
              onClick={() => onAdd(product)}
              className="w-full min-h-[48px] px-6 rounded-xl bg-brand-orange text-brand-navy font-black text-sm uppercase tracking-wider hover:bg-brand-orange-hover active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-sm touch-target"
            >
              <Plus className="w-5 h-5 text-brand-navy stroke-[3]" />
              <span>Add to Cart</span>
            </button>
          ) : (
            <div className="w-full flex items-center gap-3">
              <div className="flex-1 min-h-[48px] bg-brand-navy rounded-xl p-1.5 flex items-center justify-between text-white shadow-sm">
                <button
                  onClick={() => onDecrement(product.id)}
                  className="w-11 min-h-[44px] rounded-lg bg-white/10 hover:bg-white/20 active:bg-white/30 flex items-center justify-center transition-colors touch-target"
                  aria-label="Decrease quantity"
                >
                  <Minus className="w-5 h-5 text-white stroke-[2.5]" />
                </button>
                <div className="flex flex-col items-center">
                  <span className="text-base font-black px-4 font-mono text-brand-orange">
                    {quantity}
                  </span>
                  <span className="text-[10px] text-slate-300 font-medium">in cart</span>
                </div>
                <button
                  onClick={() => onIncrement(product.id)}
                  className="w-11 min-h-[44px] rounded-lg bg-white/10 hover:bg-white/20 active:bg-white/30 flex items-center justify-center transition-colors touch-target"
                  aria-label="Increase quantity"
                >
                  <Plus className="w-5 h-5 text-white stroke-[2.5]" />
                </button>
              </div>

              {onOpenCart && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenCart();
                  }}
                  className="px-4 min-h-[48px] rounded-xl bg-brand-orange text-brand-navy font-bold text-xs hover:bg-brand-orange-hover transition-colors flex items-center gap-1.5 flex-shrink-0 touch-target"
                >
                  <ShoppingBag className="w-4 h-4 text-brand-navy" />
                  <span>View Cart</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
