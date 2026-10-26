import React from 'react';
import { Category } from '../../types';

interface CategoryChipsProps {
  categories: Category[];
  selectedCategory: string;
  onSelectCategory: (categoryId: string) => void;
}

export const CategoryChips: React.FC<CategoryChipsProps> = ({
  categories,
  selectedCategory,
  onSelectCategory,
}) => {
  return (
    <div className="w-full my-4">
      <div className="flex items-center justify-between mb-2 px-1">
        <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
          Shop by Category
        </h2>
        <span className="text-[11px] text-slate-400 font-mono">[8 Supermarket Aisles]</span>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0 scroll-smooth">
        {categories.map((cat) => {
          const isSelected = selectedCategory === cat.id;

          return (
            <button
              key={cat.id}
              onClick={() => onSelectCategory(cat.id)}
              className={`flex-shrink-0 px-4 py-2.5 rounded-xl text-xs font-bold transition-all touch-target border ${
                isSelected
                  ? 'bg-brand-navy text-white border-brand-navy shadow-sm'
                  : 'bg-white text-slate-700 border-slate-200/90 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <span>{cat.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
