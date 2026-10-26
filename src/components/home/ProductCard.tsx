import React from 'react';
import { DemoProduct } from '../../types';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Plus, Minus, Package, Ban } from 'lucide-react';

interface ProductCardProps {
  product: DemoProduct;
  quantity: number;
  onAdd: (product: DemoProduct) => void;
  onIncrement: (productId: string) => void;
  onDecrement: (productId: string) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  quantity,
  onAdd,
  onIncrement,
  onDecrement,
}) => {
  return (
    <Card className="flex flex-col justify-between p-4 h-full border border-slate-200/80 hover:border-brand-navy/30 transition-all group">
      {/* Product Image / Visual Placeholder */}
      <div className="relative w-full aspect-square bg-brand-grey-blue rounded-xl flex flex-col items-center justify-center p-4 border border-slate-100 mb-3 overflow-hidden">
        <Package className="w-12 h-12 text-brand-navy/30 group-hover:scale-110 transition-transform duration-300" />
        
        {/* Placeholder Demo Watermark */}
        <span className="mt-2 text-[10px] font-mono font-semibold text-slate-400 uppercase tracking-wider text-center">
          [Image Placeholder]
        </span>

        {/* Demo Tag Pill */}
        <div className="absolute top-2 left-2 flex flex-col gap-1">
          <Badge variant="placeholder" size="sm" className="shadow-none">
            Demo Item
          </Badge>
          {product.discountPercent && (
            <Badge variant="orange" size="sm">
              {product.discountPercent}
            </Badge>
          )}
        </div>

        {/* Out of Stock Notice */}
        {!product.inStock && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-[2px] flex flex-col items-center justify-center p-2 text-center">
            <Ban className="w-7 h-7 text-rose-600 mb-1" />
            <span className="text-xs font-bold text-rose-700">Out of Stock</span>
            <span className="text-[10px] text-slate-500 font-mono mt-0.5">
              (Shown per business rules)
            </span>
          </div>
        )}
      </div>

      {/* Product Details */}
      <div className="flex-1 flex flex-col">
        <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-1">
          {product.category.replace('-', ' ')}
        </div>

        <h3 className="text-sm font-bold text-brand-navy leading-snug line-clamp-2 mb-1">
          {product.name}
        </h3>

        <div className="text-xs text-slate-500 font-medium mb-3">
          Pack: <span className="text-slate-700 font-semibold">{product.unit}</span>
        </div>

        {/* Pricing Placeholders (Strictly Never Invented) */}
        <div className="mt-auto pt-2 border-t border-slate-100 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 mb-3">
          <span className="text-sm sm:text-base font-extrabold text-brand-navy font-mono">
            {product.pricePlaceholder}
          </span>
          <span className="text-xs text-slate-400 line-through font-mono">
            {product.mrpPlaceholder}
          </span>
        </div>
      </div>

      {/* Action: Add Button morphing into Quantity Stepper */}
      <div className="w-full">
        {!product.inStock ? (
          <button
            disabled
            className="w-full min-h-[44px] rounded-xl bg-slate-100 text-slate-400 text-xs font-bold border border-slate-200 cursor-not-allowed flex items-center justify-center touch-target"
          >
            Unavailable
          </button>
        ) : quantity === 0 ? (
          /* Primary contrast rule: Navy text on Orange button */
          <button
            onClick={() => onAdd(product)}
            className="w-full min-h-[44px] px-4 rounded-xl bg-brand-orange text-brand-navy font-bold text-xs uppercase tracking-wider hover:bg-brand-orange-hover active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 shadow-sm touch-target"
            aria-label={`Add ${product.name} to demo cart`}
          >
            <Plus className="w-4 h-4 text-brand-navy stroke-[3]" />
            <span>Add to Cart</span>
          </button>
        ) : (
          /* Quantity Stepper (min 44px height & touch targets) */
          <div className="w-full min-h-[44px] bg-brand-navy rounded-xl p-1 flex items-center justify-between text-white shadow-sm">
            <button
              onClick={() => onDecrement(product.id)}
              className="w-10 min-h-[44px] rounded-lg bg-white/10 hover:bg-white/20 active:bg-white/30 flex items-center justify-center transition-colors touch-target"
              aria-label="Decrease quantity"
            >
              <Minus className="w-4 h-4 text-white stroke-[2.5]" />
            </button>
            <span className="text-sm font-extrabold px-3 font-mono text-brand-orange">
              {quantity}
            </span>
            <button
              onClick={() => onIncrement(product.id)}
              className="w-10 min-h-[44px] rounded-lg bg-white/10 hover:bg-white/20 active:bg-white/30 flex items-center justify-center transition-colors touch-target"
              aria-label="Increase quantity"
            >
              <Plus className="w-4 h-4 text-white stroke-[2.5]" />
            </button>
          </div>
        )}
      </div>
    </Card>
  );
};
