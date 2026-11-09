export type DeliveryMode = 'delivery' | 'pickup';
export type UserRole = 'customer' | 'admin' | 'rider';
export type SupabaseConnectionState = 'demo' | 'connecting' | 'connected' | 'error';
export type OrderStatus =
  | 'placed'
  | 'confirmed'
  | 'packing'
  | 'ready'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';
export type PaymentMethod = 'cod' | 'upi';

export interface Category {
  id: string;
  name: string;
  iconName?: string;
  badge?: string;
  slug?: string | null;
  display_order?: number;
  is_active?: boolean;
}

export interface DemoProduct {
  id: string;
  name: string;
  unit: string;
  pricePlaceholder: string; // e.g. "₹[Price]" - explicitly never invented
  mrpPlaceholder: string;   // e.g. "₹[MRP]"
  discountPercent?: string;
  category: string;
  categoryId?: string | null;
  imageUrl?: string;
  inStock: boolean;
  isPopular?: boolean;
  isNewArrival?: boolean;
  isDemoItem: boolean;
  // Live database numeric values when connected to Supabase
  price?: number | null;
  mrp?: number | null;
  displayOrder?: number;
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
  // Live numeric & text fields from Supabase public_store_settings when configured
  deliveryFee?: number | null;
  freeDeliveryThreshold?: number | null;
  minOrderAmount?: number | null;
  deliveryRadiusKm?: number | null;
  serviceablePincodes?: string[] | null;
  bannerMessage?: string | null;
  isLiveData?: boolean;
  connectionStatus?: SupabaseConnectionState;
  connectionError?: string | null;
}

export interface UserProfile {
  id: string;
  phone: string | null;
  email?: string | null;
  full_name: string | null;
  role: UserRole;
  created_at?: string;
  updated_at?: string;
}

export interface CustomerAddress {
  id: string;
  user_id: string;
  address_line: string;
  landmark: string | null;
  pincode: string;
  is_default: boolean;
  created_at?: string;
}

export interface DeliveryPartner {
  id: string;
  user_id: string;
  is_online: boolean;
  vehicle_details: string | null;
  created_at?: string;
  profile?: UserProfile;
}

export interface OrderItemRecord {
  id: string;
  order_id?: string;
  product_id: string | null;
  product_name: string;
  unit_price: number;
  unit: string | null;
  quantity: number;
  total_price: number;
}

export interface OrderStatusHistoryRecord {
  id: string;
  order_id: string;
  status: OrderStatus;
  note: string | null;
  created_at: string;
}

export interface OrderRiderInfo {
  delivery_partner_id: string;
  rider_name: string;
  rider_phone: string | null;
  vehicle_details: string | null;
}

export interface OrderDeliveryAddressSnapshot {
  type?: 'store_pickup';
  address_line?: string;
  landmark?: string | null;
  pincode?: string;
  customer_name?: string | null;
  customer_phone?: string | null;
}

export interface OrderRecord {
  id: string;
  order_number: string;
  customer_id: string;
  delivery_partner_id: string | null;
  delivery_mode: DeliveryMode;
  status: OrderStatus;
  subtotal: number;
  delivery_fee: number;
  discount_amount: number;
  total_amount: number;
  delivery_address: OrderDeliveryAddressSnapshot;
  payment_method: PaymentMethod;
  /** unpaid = COD (collect on delivery) / not yet paid; paid only after gateway verification. */
  payment_status?: string;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
  items: OrderItemRecord[];
  history: OrderStatusHistoryRecord[];
  customer_name?: string | null;
  customer_phone?: string | null;
  rider_info?: OrderRiderInfo | null;
}

export interface AdminProductRow {
  id: string;
  category_id: string | null;
  name: string;
  unit: string | null;
  price: number | null;
  mrp: number | null;
  discount_percent: string | null;
  image_url: string | null;
  is_active: boolean;
  is_popular: boolean;
  is_new_arrival: boolean;
  display_order: number;
  created_at?: string;
  stock_quantity: number;
  low_stock_threshold: number;
  inventory_updated_at?: string;
}

export interface AdminStoreSettingsRow {
  config_id: 'primary';
  is_open: boolean;
  status_notice: string | null;
  store_address: string | null;
  opening_hours: string | null;
  support_phone: string | null;
  delivery_fee: number | null;
  free_delivery_threshold: number | null;
  min_order_amount: number | null;
  delivery_radius_km: number | null;
  serviceable_pincodes: string[] | null;
  fssai_license_number: string | null;
  banner_message: string | null;
  updated_at?: string;
}

export interface CartCalculation {
  subtotal: number;
  mrpTotal: number;
  productSavings: number;
  deliveryFee: number | null;
  discountAmount: number;
  totalAmount: number | null;
  amountNeededForFreeDelivery: number | null;
  amountNeededForMinOrder: number | null;
  isFreeDeliveryUnlocked: boolean;
  isMinOrderMet: boolean;
  hasUnconfiguredPrices: boolean;
  hasDemoItems: boolean;
  hasOutOfStockItems: boolean;
  isDeliveryFeeConfigured: boolean;
  canCheckout: boolean;
  checkoutBlockReason: string | null;
}
