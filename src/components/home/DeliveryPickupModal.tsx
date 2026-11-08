import React from 'react';
import { DeliveryMode, StoreConfig } from '../../types';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Truck, Store, MapPin, Check } from 'lucide-react';

interface DeliveryPickupModalProps {
  isOpen: boolean;
  onClose: () => void;
  deliveryMode: DeliveryMode;
  onSelectMode: (mode: DeliveryMode) => void;
  storeConfig: StoreConfig;
}

export const DeliveryPickupModal: React.FC<DeliveryPickupModalProps> = ({
  isOpen,
  onClose,
  deliveryMode,
  onSelectMode,
  storeConfig,
}) => {
  const [selected, setSelected] = React.useState<DeliveryMode>(deliveryMode);

  React.useEffect(() => {
    setSelected(deliveryMode);
  }, [deliveryMode, isOpen]);

  const handleConfirm = () => {
    onSelectMode(selected);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Choose Delivery or Store Pickup">
      <div className="space-y-4 text-sm">
        <p className="text-xs text-slate-500">
          FOMO Store serves families and households in Rajauli and nearby areas. Choose your preferred fulfillment method.
        </p>

        {/* Mode Options */}
        <div className="space-y-3">
          {/* Option 1: Delivery */}
          <div
            onClick={() => setSelected('delivery')}
            className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
              selected === 'delivery'
                ? 'border-brand-orange bg-brand-orange-tint/40 shadow-sm'
                : 'border-slate-200 hover:border-slate-300 bg-white'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <Truck className={`w-5 h-5 ${selected === 'delivery' ? 'text-brand-orange' : 'text-slate-500'}`} />
                <span className="font-bold text-brand-navy">Doorstep Delivery</span>
              </div>
              {selected === 'delivery' && (
                <span className="w-5 h-5 rounded-full bg-brand-orange text-brand-navy flex items-center justify-center">
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                </span>
              )}
            </div>
            <p className="text-xs text-slate-600 mb-2">
              Brought to your house by dedicated FOMO Store riders.
            </p>
            <div className="flex flex-wrap gap-2 text-[11px] font-mono text-slate-500">
              <span className="bg-white/80 px-2 py-0.5 rounded border border-slate-200">
                Fee: {storeConfig.deliveryFeePlaceholder}
              </span>
              <span className="bg-white/80 px-2 py-0.5 rounded border border-slate-200">
                Radius:{' '}
                {storeConfig.deliveryRadiusKm !== null && storeConfig.deliveryRadiusKm !== undefined
                  ? `${storeConfig.deliveryRadiusKm} km around Rajauli`
                  : '[Configurable Delivery Radius]'}
              </span>
            </div>
          </div>

          {/* Option 2: Pickup */}
          <div
            onClick={() => setSelected('pickup')}
            className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
              selected === 'pickup'
                ? 'border-brand-navy bg-brand-grey-blue shadow-sm'
                : 'border-slate-200 hover:border-slate-300 bg-white'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <Store className={`w-5 h-5 ${selected === 'pickup' ? 'text-brand-navy' : 'text-slate-500'}`} />
                <span className="font-bold text-brand-navy">Store Self-Pickup</span>
              </div>
              {selected === 'pickup' && (
                <span className="w-5 h-5 rounded-full bg-brand-navy text-white flex items-center justify-center">
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                </span>
              )}
            </div>
            <p className="text-xs text-slate-600 mb-2">
              Collect directly from our physical supermarket counter in Rajauli. No delivery charges.
            </p>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <MapPin className="w-3.5 h-3.5 text-brand-orange flex-shrink-0" />
              <span className="font-mono truncate">{storeConfig.addressPlaceholder}</span>
            </div>
          </div>
        </div>

        <div className="pt-2">
          <Button variant="primary" fullWidth onClick={handleConfirm}>
            Confirm Selection
          </Button>
        </div>
      </div>
    </Modal>
  );
};
