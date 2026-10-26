import React from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '../ui/Input';

interface SearchBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onClear: () => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  searchQuery,
  onSearchChange,
  onClear,
}) => {
  return (
    <div className="w-full max-w-2xl mx-auto my-4">
      <div className="relative">
        <Input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search grocery staples, dairy, snacks, personal care, stationery..."
          icon={<Search className="w-5 h-5 text-brand-navy" />}
          endIcon={
            searchQuery ? (
              <button
                onClick={onClear}
                className="p-1.5 text-slate-400 hover:text-brand-navy rounded-full transition-colors touch-target flex items-center justify-center"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            ) : undefined
          }
          className="shadow-sm border-slate-200/90 text-sm focus:border-brand-navy"
        />
      </div>
      {searchQuery && (
        <div className="mt-2 text-xs text-slate-500 flex items-center justify-between px-1">
          <span>Filtering demo items for: <strong className="text-brand-navy font-semibold">"{searchQuery}"</strong></span>
          <button
            onClick={onClear}
            className="text-brand-orange hover:underline font-bold"
          >
            Clear filter
          </button>
        </div>
      )}
    </div>
  );
};
