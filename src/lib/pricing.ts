import {
  AdminProductRow,
  CartCalculation,
  Category,
  CustomerAddress,
  DeliveryMode,
  DemoProduct,
  OrderStatus,
  StoreConfig,
  UserRole,
} from '../types';

export const ORDER_STATUS_SEQUENCE: OrderStatus[] = [
  'placed',
  'confirmed',
  'packing',
  'ready',
  'out_for_delivery',
  'delivered',
];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  placed: 'Order Placed',
  confirmed: 'Confirmed by Store',
  packing: 'Packing in Progress',
  ready: 'Ready for Dispatch / Pickup',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

/**
 * Format numeric INR currency or return explicit placeholder when unconfigured/null.
 * Strictly never invents prices.
 */
export function formatCurrencyOrPlaceholder(
  value: number | null | undefined,
  placeholder = '₹[Unconfigured]'
): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return placeholder;
  }
  const num = Number(value);
  return `₹${num % 1 === 0 ? num.toFixed(0) : num.toFixed(2)}`;
}

/**
 * Calculate cart subtotal, delivery fee, free-delivery threshold hint,
 * minimum-order check, and checkout eligibility using exact database rules.
 */
export function calculateCartTotals(
  products: DemoProduct[],
  cartQuantities: Record<string, number>,
  deliveryMode: DeliveryMode,
  storeConfig: StoreConfig
): CartCalculation {
  const activeItems = products.filter((p) => (cartQuantities[p.id] || 0) > 0);

  let subtotal = 0;
  let mrpTotal = 0;
  let hasUnconfiguredPrices = false;
  let hasDemoItems = false;
  let hasOutOfStockItems = false;

  for (const item of activeItems) {
    const qty = cartQuantities[item.id] || 0;
    if (qty <= 0) continue;

    if (!item.inStock) {
      hasOutOfStockItems = true;
    }

    if (item.isDemoItem) {
      hasDemoItems = true;
    }

    if (item.price === null || item.price === undefined || Number.isNaN(Number(item.price)) || Number(item.price) < 0) {
      hasUnconfiguredPrices = true;
    } else {
      const priceNum = Number(item.price);
      subtotal += priceNum * qty;
      const mrpNum =
        item.mrp !== null && item.mrp !== undefined && !Number.isNaN(Number(item.mrp)) && Number(item.mrp) >= priceNum
          ? Number(item.mrp)
          : priceNum;
      mrpTotal += mrpNum * qty;
    }
  }

  const productSavings = Math.max(0, mrpTotal - subtotal);

  // Minimum order check (only enforced when minOrderAmount is configured and > 0)
  const minOrder =
    storeConfig.minOrderAmount !== null &&
    storeConfig.minOrderAmount !== undefined &&
    Number(storeConfig.minOrderAmount) > 0
      ? Number(storeConfig.minOrderAmount)
      : null;

  const isMinOrderMet = minOrder === null || (!hasUnconfiguredPrices && subtotal >= minOrder);
  const amountNeededForMinOrder =
    minOrder !== null && !hasUnconfiguredPrices && subtotal < minOrder
      ? Math.max(0, minOrder - subtotal)
      : null;

  // Free delivery threshold check (only active when > 0, matching place_order SQL)
  const freeThreshold =
    storeConfig.freeDeliveryThreshold !== null &&
    storeConfig.freeDeliveryThreshold !== undefined &&
    Number(storeConfig.freeDeliveryThreshold) > 0
      ? Number(storeConfig.freeDeliveryThreshold)
      : null;

  const isFreeDeliveryUnlocked =
    deliveryMode === 'pickup' ||
    (freeThreshold !== null && !hasUnconfiguredPrices && subtotal >= freeThreshold);

  const amountNeededForFreeDelivery =
    deliveryMode === 'delivery' &&
    freeThreshold !== null &&
    !hasUnconfiguredPrices &&
    subtotal < freeThreshold
      ? Math.max(0, freeThreshold - subtotal)
      : null;

  // Delivery fee calculation
  let deliveryFee: number | null = 0;
  let isDeliveryFeeConfigured = true;

  if (deliveryMode === 'pickup') {
    deliveryFee = 0;
    isDeliveryFeeConfigured = true;
  } else {
    if (
      storeConfig.deliveryFee === null ||
      storeConfig.deliveryFee === undefined ||
      Number.isNaN(Number(storeConfig.deliveryFee))
    ) {
      deliveryFee = null;
      isDeliveryFeeConfigured = false;
    } else if (isFreeDeliveryUnlocked) {
      deliveryFee = 0;
    } else {
      deliveryFee = Number(storeConfig.deliveryFee);
    }
  }

  const discountAmount = 0;
  const totalAmount =
    hasUnconfiguredPrices || deliveryFee === null
      ? null
      : Math.max(0, subtotal + deliveryFee - discountAmount);

  let canCheckout = true;
  let checkoutBlockReason: string | null = null;

  if (activeItems.length === 0) {
    canCheckout = false;
    checkoutBlockReason = 'Your cart is empty.';
  } else if (!storeConfig.isOpen) {
    canCheckout = false;
    checkoutBlockReason = 'Store is currently closed. Checkout is blocked until the store opens.';
  } else if (hasOutOfStockItems) {
    canCheckout = false;
    checkoutBlockReason = 'One or more items in your cart are out of stock. Please remove them to continue.';
  } else if (hasDemoItems) {
    canCheckout = false;
    checkoutBlockReason = 'Demo catalog items cannot be ordered. Connect live Supabase catalog to place real orders.';
  } else if (hasUnconfiguredPrices) {
    canCheckout = false;
    checkoutBlockReason = 'Some items in your cart do not have configured prices yet.';
  } else if (
    deliveryMode === 'delivery' &&
    storeConfig.isLiveData &&
    (!storeConfig.serviceablePincodes || storeConfig.serviceablePincodes.length === 0)
  ) {
    canCheckout = false;
    checkoutBlockReason =
      'Delivery service area is not configured yet. Doorstep delivery is temporarily disabled. Please choose Store Pickup.';
  } else if (deliveryMode === 'delivery' && !isDeliveryFeeConfigured) {
    canCheckout = false;
    checkoutBlockReason = 'Delivery fee is not configured in store settings yet. Please choose Store Pickup or wait for owner configuration.';
  } else if (!isMinOrderMet && amountNeededForMinOrder !== null) {
    canCheckout = false;
    checkoutBlockReason = `Minimum order amount is ₹${minOrder}. Add ₹${amountNeededForMinOrder.toFixed(0)} more to checkout.`;
  }

  return {
    subtotal,
    mrpTotal,
    productSavings,
    deliveryFee,
    discountAmount,
    totalAmount,
    amountNeededForFreeDelivery,
    amountNeededForMinOrder,
    isFreeDeliveryUnlocked,
    isMinOrderMet,
    hasUnconfiguredPrices,
    hasDemoItems,
    hasOutOfStockItems,
    isDeliveryFeeConfigured,
    canCheckout,
    checkoutBlockReason,
  };
}

/**
 * Customer cancellation rule from FOMO Store specification:
 * Allowed ONLY before packing starts ('placed' or 'confirmed').
 */
export function canCustomerCancelOrder(status: OrderStatus): boolean {
  return status === 'placed' || status === 'confirmed';
}

/**
 * Rider status transition rule matching rider_update_order_status RPC:
 * - Only allowed on 'delivery' orders (never 'pickup')
 * - Only allows 'ready' -> 'out_for_delivery' and 'out_for_delivery' -> 'delivered'
 */
export function canRiderTransitionOrder(
  currentStatus: OrderStatus,
  targetStatus: OrderStatus,
  deliveryMode: DeliveryMode
): boolean {
  if (deliveryMode !== 'delivery') return false;
  if (currentStatus === 'ready' && targetStatus === 'out_for_delivery') return true;
  if (currentStatus === 'out_for_delivery' && targetStatus === 'delivered') return true;
  return false;
}

/**
 * Role guard check helper for UI routing (backed by database RLS/RPCs).
 */
export function isRoleAuthorized(userRole: UserRole | null | undefined, requiredRole: UserRole): boolean {
  if (!userRole) return false;
  return userRole === requiredRole;
}

/**
 * Validate delivery address fields and optional distance against configured delivery_radius_km.
 * Never invents a delivery radius when storeConfig.deliveryRadiusKm is null.
 */
export function validateDeliveryAddress(
  address: Pick<CustomerAddress, 'address_line' | 'pincode' | 'landmark'> | null,
  deliveryMode: DeliveryMode,
  storeConfig: StoreConfig,
  estimatedDistanceKm?: number | null
): { valid: boolean; error: string | null; radiusNotice: string } {
  const configuredRadius =
    storeConfig.deliveryRadiusKm !== null &&
    storeConfig.deliveryRadiusKm !== undefined &&
    Number(storeConfig.deliveryRadiusKm) > 0
      ? Number(storeConfig.deliveryRadiusKm)
      : null;

  const radiusNotice =
    configuredRadius !== null
      ? `Delivery available within ${configuredRadius} km of FOMO Store.`
      : 'Delivery radius: [Not configured in store settings yet — no distance restriction enforced until set by owner]';

  if (deliveryMode === 'pickup') {
    return { valid: true, error: null, radiusNotice };
  }

  if (!address) {
    return {
      valid: false,
      error: 'Please select or add a delivery address for doorstep delivery.',
      radiusNotice,
    };
  }

  if (!address.address_line || address.address_line.trim().length < 5) {
    return {
      valid: false,
      error: 'Address line must be at least 5 characters.',
      radiusNotice,
    };
  }

  if (!address.pincode || !/^\d{6}$/.test(address.pincode.trim())) {
    return {
      valid: false,
      error: 'Please enter a valid 6-digit pincode.',
      radiusNotice,
    };
  }

  // M-1: Fail-closed delivery service area enforcement
  if (
    storeConfig.isLiveData &&
    (!storeConfig.serviceablePincodes || storeConfig.serviceablePincodes.length === 0)
  ) {
    return {
      valid: false,
      error:
        'Delivery service area is not configured yet. Doorstep delivery is temporarily disabled. Please choose Store Pickup.',
      radiusNotice:
        'Delivery area: [Serviceable area not configured yet — doorstep delivery disabled]',
    };
  }

  if (
    storeConfig.serviceablePincodes &&
    storeConfig.serviceablePincodes.length > 0 &&
    !storeConfig.serviceablePincodes.includes(address.pincode.trim())
  ) {
    return {
      valid: false,
      error: `Delivery is not available to PIN code ${address.pincode.trim()}. Delivery is currently limited to: ${storeConfig.serviceablePincodes.join(', ')}.`,
      radiusNotice,
    };
  }

  if (
    configuredRadius !== null &&
    estimatedDistanceKm !== null &&
    estimatedDistanceKm !== undefined &&
    !Number.isNaN(Number(estimatedDistanceKm)) &&
    Number(estimatedDistanceKm) > configuredRadius
  ) {
    return {
      valid: false,
      error: `Address distance (${estimatedDistanceKm} km) exceeds our configured delivery radius of ${configuredRadius} km.`,
      radiusNotice,
    };
  }

  return { valid: true, error: null, radiusNotice };
}

/**
 * Export products & inventory to CSV for Owner Bulk Tools (/admin).
 */
export function generateCatalogCsv(
  products: AdminProductRow[],
  categories: Category[]
): string {
  const catMap = new Map(categories.map((c) => [c.id, c.name]));
  const headers = [
    'id',
    'name',
    'category_name',
    'unit',
    'price',
    'mrp',
    'discount_percent',
    'stock_quantity',
    'low_stock_threshold',
    'is_active',
    'is_popular',
    'is_new_arrival',
  ];

  const escapeCsv = (val: unknown): string => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = products.map((p) =>
    [
      p.id,
      p.name,
      p.category_id ? catMap.get(p.category_id) || '' : '',
      p.unit ?? '',
      p.price ?? '',
      p.mrp ?? '',
      p.discount_percent ?? '',
      p.stock_quantity ?? 0,
      p.low_stock_threshold ?? 5,
      p.is_active ? 'true' : 'false',
      p.is_popular ? 'true' : 'false',
      p.is_new_arrival ? 'true' : 'false',
    ]
      .map(escapeCsv)
      .join(',')
  );

  return [headers.join(','), ...rows].join('\n');
}

export interface ParsedCsvProductRow {
  id?: string | null;
  name: string;
  category_name: string;
  unit: string;
  price: number | null;
  mrp: number | null;
  discount_percent: string | null;
  stock_quantity: number;
  low_stock_threshold: number;
  is_active: boolean;
  is_popular: boolean;
  is_new_arrival: boolean;
}

/**
 * Parse CSV text safely for bulk catalog/stock import in /admin.
 * Enforces required columns, quote balance, numeric bounds, MRP >= price,
 * and duplicate detection within the CSV payload.
 */
export function parseCatalogCsv(csvText: string): {
  rows: ParsedCsvProductRow[];
  errors: string[];
} {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    return { rows: [], errors: ['CSV must contain a header row and at least one data row.'] };
  }

  const splitCsvLine = (line: string): { cols: string[]; unclosedQuote: boolean } => {
    const out: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        out.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    out.push(current.trim());
    return { cols: out, unclosedQuote: inQuotes };
  };

  const headerParsed = splitCsvLine(lines[0]);
  if (headerParsed.unclosedQuote) {
    return { rows: [], errors: ['Row 1 (Header): Malformed CSV header with unclosed quotation mark.'] };
  }

  const headers = headerParsed.cols.map((h) => h.toLowerCase());
  const nameIdx = headers.indexOf('name');
  if (nameIdx === -1) {
    return { rows: [], errors: ['Missing required "name" column in CSV header.'] };
  }

  const idIdx = headers.indexOf('id');
  const catIdx = headers.indexOf('category_name');
  const unitIdx = headers.indexOf('unit');
  const priceIdx = headers.indexOf('price');
  const mrpIdx = headers.indexOf('mrp');
  const discountIdx = headers.indexOf('discount_percent');
  const stockIdx = headers.indexOf('stock_quantity');
  const lowStockIdx = headers.indexOf('low_stock_threshold');
  const activeIdx = headers.indexOf('is_active');
  const popularIdx = headers.indexOf('is_popular');
  const newArrivalIdx = headers.indexOf('is_new_arrival');

  const rows: ParsedCsvProductRow[] = [];
  const errors: string[] = [];
  const seenKeys = new Map<string, number>();
  const seenIds = new Map<string, number>();

  for (let i = 1; i < lines.length; i++) {
    const rowNum = i + 1;
    const parsedLine = splitCsvLine(lines[i]);
    if (parsedLine.unclosedQuote) {
      errors.push(`Row ${rowNum}: Malformed CSV row (unclosed quotation mark).`);
      continue;
    }

    const cols = parsedLine.cols;
    const name = cols[nameIdx]?.trim();
    if (!name) {
      errors.push(`Row ${rowNum}: Product name cannot be empty.`);
      continue;
    }

    const rawId = idIdx >= 0 ? cols[idIdx]?.trim() : '';
    const unit = ((unitIdx >= 0 ? cols[unitIdx] : '') || '1 unit').trim() || '1 unit';

    // Duplicate detection within CSV batch
    const normKey = `${name.toLowerCase()}::${unit.toLowerCase()}`;
    if (seenKeys.has(normKey)) {
      errors.push(
        `Row ${rowNum} ("${name}" - ${unit}): Duplicate product in CSV (already listed on Row ${seenKeys.get(normKey)}).`
      );
      continue;
    }
    if (rawId) {
      if (seenIds.has(rawId.toLowerCase())) {
        errors.push(
          `Row ${rowNum} ("${name}"): Duplicate product ID "${rawId}" in CSV (already listed on Row ${seenIds.get(rawId.toLowerCase())}).`
        );
        continue;
      }
      seenIds.set(rawId.toLowerCase(), rowNum);
    }
    seenKeys.set(normKey, rowNum);

    const rawPrice = priceIdx >= 0 ? cols[priceIdx] : '';
    const price = rawPrice !== '' && rawPrice !== undefined ? Number(rawPrice) : null;
    if (price !== null && (!Number.isFinite(price) || price < 0)) {
      errors.push(`Row ${rowNum} ("${name}"): Invalid price "${rawPrice}".`);
      continue;
    }

    const rawMrp = mrpIdx >= 0 ? cols[mrpIdx] : '';
    const mrp = rawMrp !== '' && rawMrp !== undefined ? Number(rawMrp) : null;
    if (mrp !== null && (!Number.isFinite(mrp) || mrp < 0)) {
      errors.push(`Row ${rowNum} ("${name}"): Invalid MRP "${rawMrp}".`);
      continue;
    }

    if (price !== null && mrp !== null && mrp < price) {
      errors.push(
        `Row ${rowNum} ("${name}"): Selling price (₹${price}) cannot exceed MRP (₹${mrp}).`
      );
      continue;
    }

    const rawStock = stockIdx >= 0 ? cols[stockIdx] : '0';
    const stock =
      rawStock !== '' && rawStock !== undefined ? Number(rawStock) : 0;
    if (!Number.isFinite(stock) || stock < 0 || !Number.isInteger(stock)) {
      errors.push(`Row ${rowNum} ("${name}"): Stock quantity must be a non-negative integer.`);
      continue;
    }

    const rawLow = lowStockIdx >= 0 ? cols[lowStockIdx] : '5';
    const lowStock =
      rawLow !== '' && rawLow !== undefined ? Number(rawLow) : 5;
    if (!Number.isFinite(lowStock) || lowStock < 0 || !Number.isInteger(lowStock)) {
      errors.push(
        `Row ${rowNum} ("${name}"): Low-stock threshold must be a non-negative integer.`
      );
      continue;
    }

    rows.push({
      id: rawId || null,
      name,
      category_name: ((catIdx >= 0 ? cols[catIdx] : '') || '').trim(),
      unit,
      price,
      mrp,
      discount_percent: ((discountIdx >= 0 ? cols[discountIdx] : '') || '').trim() || null,
      stock_quantity: stock,
      low_stock_threshold: lowStock,
      is_active: activeIdx >= 0 ? cols[activeIdx]?.toLowerCase() !== 'false' : true,
      is_popular: popularIdx >= 0 ? cols[popularIdx]?.toLowerCase() === 'true' : false,
      is_new_arrival: newArrivalIdx >= 0 ? cols[newArrivalIdx]?.toLowerCase() === 'true' : false,
    });
  }

  return { rows, errors };
}
