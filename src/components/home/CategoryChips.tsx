import React from 'react';
import { Category } from '../../types';

interface CategoryChipsProps {
  categories: Category[];
  selectedCategory: string;
  onSelectCategory: (categoryId: string) => void;
  isLoading?: boolean;
  isLiveData?: boolean;
}

export const CategoryChips: React.FC<CategoryChipsProps> = ({
  categories,
  selectedCategory,
  onSelectCategory,
  isLoading = false,
  isLiveData = false,
}) => {
  const aisleCount = Math.max(0, categories.filter((c) => c.id !== 'all').length);

  return (
    <div className="w-full my-4">
      <div className="flex items-center justify-between mb-2 px-1">
        <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
          Shop by Category
        </h2>
        <span className="text-[11px] text-slate-400 font-mono">
          {isLoading
            ? 'Loading categories…'
            : isLiveData
            ? `${aisleCount} ${aisleCount === 1 ? 'Active Category' : 'Active Categories'}`
            : `[${aisleCount} Supermarket Aisles]`}
        </span>
      </div>

      {isLoading ? (
        <div
          className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0"
          aria-busy="true"
          aria-label="Loading categories"
        >
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="h-9 w-28 flex-shrink-0 rounded-xl bg-slate-100 animate-pulse border border-slate-200/60"
            />
          ))}
        </div>
      ) : (
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
          {isLiveData && aisleCount === 0 && (
            <span className="text-xs text-slate-400 italic px-2 py-1">
              No active categories published yet
            </span>
          )}
        </div>
      )}
    </div>
  );
};
