export type DeliveryMode = 'delivery' | 'pickup';

export interface Category {
  id: string;
  name: string;
  iconName?: string;
  badge?: string;
}

export interface DemoProduct {
  id: string;
  name: string;
  unit: string;
  pricePlaceholder: string; // e.g. "₹[Price]" - explicitly never invented
  mrpPlaceholder: string;   // e.g. "₹[MRP]"
  discountPercent?: string;
  category: string;
  imageUrl?: string;
  inStock: boolean;
  isPopular?: boolean;
  isNewArrival?: boolean;
  isDemoItem: true;
}

export interface StoreConfig {
  isOpen: boolean; // Configurable toggle
  statusNotice: string;
  addressPlaceholder: string;
  hoursPlaceholder: string;
  phonePlaceholder: string;
  deliveryFeePlaceholder: string;
  freeDeliveryThresholdPlaceholder: string;
  fssaiPlaceholder: string;
}
