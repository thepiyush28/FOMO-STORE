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
  const conn = storeConfig.connectionStatus || (storeConfig.isLiveData ? 'connected' : 'demo');
  const isConnecting = conn === 'connecting';
  const isError = conn === 'error';

  const bannerTone = isConnecting
    ? 'bg-slate-50 border-slate-200 text-slate-800'
    : isError
    ? 'bg-rose-50 border-rose-200 text-rose-950'
    : storeConfig.isOpen
    ? 'bg-emerald-50/70 border-emerald-200/60 text-emerald-950'
    : 'bg-rose-50 border-rose-200 text-rose-950';

  const primaryHeadline = isConnecting
    ? 'Checking live store status from Supabase…'
    : isError
    ? 'Store status unavailable (unable to reach Supabase)'
    : storeConfig.isOpen
    ? 'Store is OPEN for orders'
    : 'Store is CLOSED currently';

  const secondaryDetail =
    !isConnecting &&
    !isError &&
    storeConfig.statusNotice &&
    storeConfig.statusNotice.toLowerCase() !== primaryHeadline.toLowerCase()
      ? ` — ${storeConfig.statusNotice}`
      : '';

  return (
    <div className={`border-b transition-colors px-4 py-2.5 ${bannerTone}`}>
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          {isConnecting ? (
            <Settings className="w-4 h-4 text-slate-500 animate-spin flex-shrink-0" />
          ) : !isError && storeConfig.isOpen ? (
            <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
          )}
          <span className="font-medium">
            <strong>Store Status:</strong> {primaryHeadline}
            {secondaryDetail}
          </span>
          <Badge
            variant={
              isConnecting
                ? 'placeholder'
                : isError
                ? 'red'
                : conn === 'connected'
                ? storeConfig.isOpen
                  ? 'green'
                  : 'red'
                : 'placeholder'
            }
            size="sm"
          >
            {isConnecting
              ? 'Connecting…'
              : isError
              ? 'Connection Error'
              : conn === 'connected'
              ? 'Live Store Status'
              : 'Demo Mode Status'}
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
            <span>{conn === 'connected' ? 'Store Info & Details' : 'Store Status Details'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
