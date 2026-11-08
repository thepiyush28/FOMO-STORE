import React from 'react';
import { StoreConfig } from '../../types';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { AlertCircle, Sliders, CheckCircle2, XCircle } from 'lucide-react';

interface StoreConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: StoreConfig;
  onToggleStatus: () => void;
}

export const StoreConfigModal: React.FC<StoreConfigModalProps> = ({
  isOpen,
  onClose,
  config,
  onToggleStatus,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={config.isLiveData ? 'Store Information & Operating Rules' : 'Store Settings & Placeholders'}
    >
      <div className="space-y-5 text-sm">
        {/* Banner about configuration */}
        <div className="bg-brand-grey-blue p-3.5 rounded-xl border border-slate-200 text-xs text-slate-600 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-brand-orange flex-shrink-0 mt-0.5" />
          <span>
            {config.isLiveData ? (
              <>
                Live store settings loaded from Supabase (<code>public_store_settings</code>). Store
                owners can update operating status, fees, and contact details in the{' '}
                <code>/admin</code> dashboard.
              </>
            ) : (
              <>
                These settings will be maintained by the owner in the <code>/admin</code> dashboard.
                In Demo Mode, placeholders remain explicit and can be previewed here.
              </>
            )}
          </span>
        </div>

        {/* Store Open/Closed Status */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <div>
              <span className="font-bold text-brand-navy block">Store Status</span>
              <span className="text-xs text-slate-500">
                {config.statusNotice ||
                  (config.isOpen ? 'Store is accepting orders' : 'Store is closed (checkout blocked)')}
              </span>
            </div>
            {config.isOpen ? (
              <Badge variant="green" size="md" className="gap-1 font-bold">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>OPEN</span>
              </Badge>
            ) : (
              <Badge variant="red" size="md" className="gap-1 font-bold">
                <XCircle className="w-3.5 h-3.5 text-rose-600" />
                <span>CLOSED</span>
              </Badge>
            )}
          </div>

          {!config.isLiveData && (
            <div className="pt-2">
              <Button
                variant={config.isOpen ? 'outline' : 'primary'}
                size="sm"
                onClick={onToggleStatus}
                fullWidth
                className="text-xs"
              >
                <Sliders className="w-3.5 h-3.5 mr-1.5" />
                <span>Toggle Status to {config.isOpen ? 'CLOSED' : 'OPEN'} (Demo Test)</span>
              </Button>
            </div>
          )}
        </div>

        {/* Store Parameters Table */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            {config.isLiveData ? 'Store Details & Operating Parameters' : 'Unconfigured Business Parameters'}
          </h4>

          <div className="space-y-2 text-xs">
            <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200/80">
              <span className="text-slate-400 block font-medium">Physical Address:</span>
              <span className="font-mono text-amber-900 font-semibold">{config.addressPlaceholder}</span>
            </div>

            <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200/80">
              <span className="text-slate-400 block font-medium">Operating Hours:</span>
              <span className="font-mono text-amber-900 font-semibold">{config.hoursPlaceholder}</span>
            </div>

            <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200/80">
              <span className="text-slate-400 block font-medium">Delivery Fee / Threshold:</span>
              <span className="font-mono text-amber-900 font-semibold">
                Fee: {config.deliveryFeePlaceholder} | Free over: {config.freeDeliveryThresholdPlaceholder}
              </span>
            </div>

            <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200/80">
              <span className="text-slate-400 block font-medium">Customer Support Phone / WhatsApp:</span>
              <span className="font-mono text-amber-900 font-semibold">{config.phonePlaceholder}</span>
            </div>

            <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200/80">
              <span className="text-slate-400 block font-medium">FSSAI License / Registration:</span>
              <span className="font-mono text-amber-900 font-semibold">{config.fssaiPlaceholder}</span>
            </div>
          </div>
        </div>

        <div className="pt-2">
          <Button variant="secondary" fullWidth onClick={onClose}>
            {config.isLiveData ? 'Close' : 'Close Preview'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
