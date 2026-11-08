import React from 'react';
import { Sparkles, Info } from 'lucide-react';
import { Badge } from '../ui/Badge';

interface PromoBannerProps {
  bannerMessage?: string | null;
  isLiveData?: boolean;
}

export const PromoBanner: React.FC<PromoBannerProps> = ({
  bannerMessage = null,
  isLiveData = false,
}) => {
  const hasCustomBanner = Boolean(bannerMessage && bannerMessage.trim().length > 0);

  // In live mode, hide the promo banner completely unless the owner has configured a real banner message
  if (isLiveData && !hasCustomBanner) {
    return null;
  }

  return (
    <div className="w-full my-6">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-brand-orange-tint via-orange-50/50 to-brand-grey-blue border-2 border-brand-orange/30 p-5 sm:p-6 shadow-soft">
        {/* Top pill */}
        <div className="flex items-center justify-between mb-3">
          <Badge variant="orange" size="sm" className="gap-1.5 uppercase font-bold text-[10px]">
            <Sparkles className="w-3.5 h-3.5 text-brand-orange" />
            <span>{hasCustomBanner ? 'Store Announcement' : 'Store Launch Promotion'}</span>
          </Badge>
          <Badge variant={hasCustomBanner ? 'green' : 'placeholder'} size="sm">
            {hasCustomBanner ? 'Live Store Notice' : 'Placeholder Copy Only'}
          </Badge>
        </div>

        <div className="max-w-xl">
          <h3 className="text-lg sm:text-xl font-black text-brand-navy tracking-tight font-sans">
            {hasCustomBanner
              ? bannerMessage
              : '[Grand Opening Offer - Terms To Be Configured]'}
          </h3>
          <p className="text-xs sm:text-sm text-slate-600 mt-1.5 leading-relaxed">
            {hasCustomBanner
              ? 'Shop online or visit our physical supermarket in Rajauli, Nawada, Bihar with one catalogue and one fair price.'
              : 'Special opening celebration perks for Rajauli families. Final discount percentages, free delivery threshold rules, and eligible categories will be configured in owner settings before store launch.'}
          </p>
        </div>

        {!hasCustomBanner && (
          <div className="mt-4 pt-3 border-t border-brand-orange/20 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-500 font-medium">Promo Code Placeholder:</span>
              <span className="font-mono bg-white px-2.5 py-1 rounded-md border border-brand-orange/40 text-brand-navy font-bold">
                [LAUNCH-OFFER-CODE]
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-slate-500 text-[11px]">
              <Info className="w-3.5 h-3.5 text-slate-400" />
              <span>Terms subject to owner configuration in /admin</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
