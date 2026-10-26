import React from 'react';
import { StoreConfig } from '../../types';
import { AlertTriangle, CheckCircle, Settings } from 'lucide-react';
import { Badge } from '../ui/Badge';

interface StoreNoticeBannerProps {
  storeConfig: StoreConfig;
  onOpenSettings: () => void;
}

export const StoreNoticeBanner: React.FC<StoreNoticeBannerProps> = ({
  storeConfig,
  onOpenSettings,
}) => {
  return (
    <div
      className={`border-b transition-colors px-4 py-2.5 ${
        storeConfig.isOpen
          ? 'bg-emerald-50/70 border-emerald-200/60 text-emerald-950'
          : 'bg-rose-50 border-rose-200 text-rose-950'
      }`}
    >
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          {storeConfig.isOpen ? (
            <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
          )}
          <span className="font-medium">
            <strong>Store Status:</strong> {storeConfig.isOpen ? 'Store is OPEN for orders' : 'Store is CLOSED currently'}
          </span>
          <Badge variant="placeholder" size="sm">
            Configurable Placeholder
          </Badge>
        </div>

        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-slate-500 hidden md:inline">
            Rule: Closed store blocks checkout
          </span>
          <button
            onClick={onOpenSettings}
            className="inline-flex items-center gap-1 font-semibold text-brand-navy hover:text-brand-orange underline underline-offset-2 touch-target"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Configure Status</span>
          </button>
        </div>
      </div>
    </div>
  );
};
