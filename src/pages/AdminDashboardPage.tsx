import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  AdminProductRow,
  AdminStoreSettingsRow,
  Category,
  DeliveryPartner,
  OrderRecord,
  OrderStatus,
  UserProfile,
  UserRole,
} from '../types';
import { useAuth } from '../context/AuthContext';
import {
  adminAssignOrderRider,
  adminBulkImportCsvRows,
  adminCancelOrderViaRpc,
  adminDeleteCategory,
  adminDeleteProduct,
  adminSaveCategory,
  adminSaveProduct,
  adminSaveStoreSettings,
  adminSetUserRoleViaRpc,
  adminToggleStoreOpen,
  adminUpdateOrderStatus,
  adminUpdateProductStock,
  adminUpdateRiderDetails,
  adminUploadProductImage,
  fetchAdminAllData,
  getSupabaseEnvDiagnostic,
  signInWithEmailPassword,
  supabase,
} from '../lib/supabase';
import {
  formatCurrencyOrPlaceholder,
  generateCatalogCsv,
  isRoleAuthorized,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_SEQUENCE,
  parseCatalogCsv,
} from '../lib/pricing';
import { CATEGORIES, DEMO_PRODUCTS, STORE_INITIAL_CONFIG } from '../data/mockData';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { PhoneOtpModal } from '../components/auth/PhoneOtpModal';
import {
  ShieldCheck,
  ArrowLeft,
  LayoutDashboard,
  ShoppingBag,
  Package,
  Layers,
  Boxes,
  Users,
  Settings,
  FileSpreadsheet,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Trash2,
  Edit2,
  Upload,
  Download,
  Volume2,
  VolumeX,
  LogOut,
  Lock,
  Mail,
  KeyRound,
  Phone,
  XCircle,
} from 'lucide-react';

type AdminTab =
  | 'overview'
  | 'orders'
  | 'products'
  | 'categories'
  | 'inventory'
  | 'csv'
  | 'users'
  | 'settings';

export const AdminDashboardPage: React.FC = () => {
  const { userId, profile, isLoadingAuth, isSupabaseReady, refreshProfile, signOut } = useAuth();

  // Auth login state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isOtpModalOpen, setIsOtpModalOpen] = useState(false);

  // Explicit Demo Preview toggle ONLY when Supabase is not configured in .env
  const [previewUnconfiguredUi, setPreviewUnconfiguredUi] = useState(false);

  // Dashboard state
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [loadingData, setLoadingData] = useState(false);
  const [togglingStoreOpen, setTogglingStoreOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [soundAlertsEnabled, setSoundAlertsEnabled] = useState(true);
  const [newOrderBanner, setNewOrderBanner] = useState<string | null>(null);

  // Data bundles
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [products, setProducts] = useState<AdminProductRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [riders, setRiders] = useState<DeliveryPartner[]>([]);
  const [settings, setSettings] = useState<AdminStoreSettingsRow>({
    config_id: 'primary',
    is_open: false,
    status_notice: STORE_INITIAL_CONFIG.statusNotice,
    store_address: STORE_INITIAL_CONFIG.addressPlaceholder,
    opening_hours: STORE_INITIAL_CONFIG.hoursPlaceholder,
    support_phone: STORE_INITIAL_CONFIG.phonePlaceholder,
    delivery_fee: null,
    free_delivery_threshold: null,
    min_order_amount: null,
    delivery_radius_km: null,
    serviceable_pincodes: null,
    fssai_license_number: STORE_INITIAL_CONFIG.fssaiPlaceholder,
    banner_message: null,
  });

  // Report date range filter ('today' | '7d' | '30d' | 'all')
  const [reportRange, setReportRange] = useState<'today' | '7d' | '30d' | 'all'>('7d');

  // Order management state
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('all');
  const [cancelOrderTargetId, setCancelOrderTargetId] = useState<string | null>(null);
  const [cancelReasonText, setCancelReasonText] = useState('');

  // Product Form state
  const [editingProduct, setEditingProduct] = useState<Partial<AdminProductRow> | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Category Form state
  const [editingCategory, setEditingCategory] = useState<Partial<Category> | null>(null);

  // Inventory filter & inline draft state
  const [onlyLowStock, setOnlyLowStock] = useState(false);
  const [stockDrafts, setStockDrafts] = useState<
    Record<string, { stock_quantity: number; low_stock_threshold: number }>
  >({});

  // Rider vehicle details draft state
  const [riderVehicleDrafts, setRiderVehicleDrafts] = useState<Record<string, string>>({});

  // CSV Import state
  const [csvInputText, setCsvInputText] = useState('');
  const [csvImportResult, setCsvImportResult] = useState<string | null>(null);

  const isAdminAuthorized = isRoleAuthorized(profile?.role, 'admin');

  const playOrderNotificationBeep = useCallback(() => {
    if (!soundAlertsEnabled) return;
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch {
      // ignore audio context block
    }
  }, [soundAlertsEnabled]);

  const loadDashboardData = useCallback(async () => {
    if (!isSupabaseReady) {
      // Populate read-only demo preview rows when in unconfigured preview mode
      setCategories(CATEGORIES.filter((c) => c.id !== 'all'));
      setProducts(
        DEMO_PRODUCTS.map((p, idx) => ({
          id: p.id,
          category_id: p.category,
          name: p.name,
          unit: p.unit,
          price: null,
          mrp: null,
          discount_percent: p.discountPercent || null,
          image_url: null,
          is_active: true,
          is_popular: Boolean(p.isPopular),
          is_new_arrival: Boolean(p.isNewArrival),
          display_order: idx,
          stock_quantity: p.inStock ? 15 : 0,
          low_stock_threshold: 5,
        }))
      );
      return;
    }

    if (!isAdminAuthorized) return;

    setLoadingData(true);
    setActionError(null);
    try {
      const bundle = await fetchAdminAllData();
      setOrders(bundle.orders);
      setProducts(bundle.products);
      setCategories(bundle.categories);
      setSettings(bundle.settings);
      setProfiles(bundle.profiles);
      setRiders(bundle.riders);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to load admin data.');
    } finally {
      setLoadingData(false);
    }
  }, [isSupabaseReady, isAdminAuthorized]);

  useEffect(() => {
    if ((isSupabaseReady && isAdminAuthorized) || (!isSupabaseReady && previewUnconfiguredUi)) {
      loadDashboardData();
    }
  }, [isSupabaseReady, isAdminAuthorized, previewUnconfiguredUi, loadDashboardData]);

  // Realtime subscription for Live Orders
  useEffect(() => {
    const client = supabase;
    if (!client || !isAdminAuthorized) return;

    const channel = client
      .channel('admin-live-orders')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        (payload) => {
          const ordNum = (payload.new as Record<string, unknown>)?.order_number || 'New Order';
          setNewOrderBanner(`New order received: ${ordNum}`);
          playOrderNotificationBeep();
          loadDashboardData();
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders' },
        () => {
          loadDashboardData();
        }
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [isAdminAuthorized, loadDashboardData, playOrderNotificationBeep]);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoginLoading(true);
    try {
      await signInWithEmailPassword(loginEmail, loginPassword);
      await refreshProfile();
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Login failed.');
    } finally {
      setLoginLoading(false);
    }
  };

  // Analytics & Reports computation
  const analytics = useMemo(() => {
    const now = Date.now();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const rangeMs =
      reportRange === 'today'
        ? now - startOfToday.getTime()
        : reportRange === '7d'
        ? 7 * 24 * 60 * 60 * 1000
        : reportRange === '30d'
        ? 30 * 24 * 60 * 60 * 1000
        : Infinity;

    const inRangeOrders = orders.filter((o) => {
      const createdTs = new Date(o.created_at).getTime();
      if (reportRange === 'today') {
        return createdTs >= startOfToday.getTime();
      }
      const age = now - createdTs;
      return age <= rangeMs;
    });

    const validRevenueOrders = inRangeOrders.filter((o) => o.status !== 'cancelled');
    const totalRevenue = validRevenueOrders.reduce((acc, o) => acc + o.total_amount, 0);
    const todayOrders = orders.filter(
      (o) => new Date(o.created_at).getTime() >= startOfToday.getTime()
    );
    const todayRevenue = todayOrders
      .filter((o) => o.status !== 'cancelled')
      .reduce((acc, o) => acc + o.total_amount, 0);

    // Top Sellers (grouped by product_id or normalized name+unit so pack sizes stay distinct)
    const itemMap = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const ord of validRevenueOrders) {
      for (const it of ord.items) {
        const key =
          it.product_id ||
          `${it.product_name.toLowerCase()}::${(it.unit || '').toLowerCase()}`;
        const displayLabel = it.unit ? `${it.product_name} (${it.unit})` : it.product_name;
        const prev = itemMap.get(key) || {
          name: displayLabel,
          qty: 0,
          revenue: 0,
        };
        prev.qty += it.quantity;
        prev.revenue += it.total_price;
        itemMap.set(key, prev);
      }
    }
    const topSellers = Array.from(itemMap.values())
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    // Sales by Day
    const dayMap = new Map<string, { date: string; orders: number; revenue: number }>();
    for (const ord of validRevenueOrders) {
      const dayKey = new Date(ord.created_at).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
      });
      const prev = dayMap.get(dayKey) || { date: dayKey, orders: 0, revenue: 0 };
      prev.orders += 1;
      prev.revenue += ord.total_amount;
      dayMap.set(dayKey, prev);
    }

    const lowStockProducts = products.filter(
      (p) => p.stock_quantity <= p.low_stock_threshold
    );

    // Recent stock movements derived from orders & cancellations
    const stockMovements = orders.slice(0, 12).map((o) => ({
      orderId: o.id,
      orderNumber: o.order_number,
      status: o.status,
      isRestored: o.status === 'cancelled',
      timestamp: o.updated_at || o.created_at,
      summary: o.items.map((i) => `${i.quantity}× ${i.product_name}`).join(', '),
    }));

    return {
      totalOrdersInRange: inRangeOrders.length,
      validOrdersInRange: validRevenueOrders.length,
      totalRevenue,
      todayOrdersCount: todayOrders.length,
      todayRevenue,
      topSellers,
      salesByDay: Array.from(dayMap.values()),
      lowStockCount: lowStockProducts.length,
      activeOrdersCount: orders.filter(
        (o) => o.status !== 'delivered' && o.status !== 'cancelled'
      ).length,
      stockMovements,
    };
  }, [orders, products, reportRange]);

  // Handlers for Order Management
  const handleStatusChange = async (orderId: string, newStatus: OrderStatus) => {
    setActionError(null);
    setActionSuccess(null);
    if (newStatus === 'cancelled') {
      setCancelOrderTargetId(orderId);
      setCancelReasonText('');
      return;
    }
    try {
      await adminUpdateOrderStatus(orderId, newStatus);
      setActionSuccess(`Order status updated to "${ORDER_STATUS_LABELS[newStatus]}".`);
      await loadDashboardData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update status.');
    }
  };

  const handleConfirmAdminCancel = async (orderId: string) => {
    if (!cancelReasonText.trim()) {
      setActionError('Please enter a cancellation reason.');
      return;
    }
    setActionError(null);
    try {
      await adminCancelOrderViaRpc(orderId, cancelReasonText);
      setCancelOrderTargetId(null);
      setCancelReasonText('');
      setActionSuccess('Order cancelled and stock restored to inventory.');
      await loadDashboardData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to cancel order.');
    }
  };

  const handleAssignRider = async (
    orderId: string,
    partnerId: string,
    currentStatus: OrderStatus
  ) => {
    setActionError(null);
    try {
      await adminAssignOrderRider(orderId, partnerId || null, currentStatus);
      setActionSuccess('Delivery rider assignment updated.');
      await loadDashboardData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to assign rider.');
    }
  };

  // Handlers for Product CRUD
  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingProduct) return;
    setUploadingImage(true);
    setActionError(null);
    try {
      const publicUrl = await adminUploadProductImage(file);
      setEditingProduct({ ...editingProduct, image_url: publicUrl });
      setActionSuccess('Product image uploaded to Supabase Storage.');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Image upload failed.');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSaveProductForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    setActionError(null);
    setActionSuccess(null);
    const priceVal =
      editingProduct.price !== null && editingProduct.price !== undefined
        ? Number(editingProduct.price)
        : null;
    const mrpVal =
      editingProduct.mrp !== null && editingProduct.mrp !== undefined
        ? Number(editingProduct.mrp)
        : null;

    if (priceVal !== null && mrpVal !== null && mrpVal < priceVal) {
      setActionError('Selling price cannot exceed MRP.');
      return;
    }

    try {
      await adminSaveProduct({
        id: editingProduct.id,
        category_id: editingProduct.category_id || null,
        name: editingProduct.name || '',
        unit: editingProduct.unit || '1 unit',
        price: priceVal,
        mrp: mrpVal,
        discount_percent: editingProduct.discount_percent || null,
        image_url: editingProduct.image_url || null,
        is_active: editingProduct.is_active !== false,
        is_popular: Boolean(editingProduct.is_popular),
        is_new_arrival: Boolean(editingProduct.is_new_arrival),
        display_order: Number(editingProduct.display_order || 0),
        stock_quantity: Number(editingProduct.stock_quantity ?? 0),
        low_stock_threshold: Number(editingProduct.low_stock_threshold ?? 5),
      });
      setEditingProduct(null);
      setActionSuccess('Product and inventory saved.');
      await loadDashboardData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to save product.');
    }
  };

  const handleToggleProductActive = async (prod: AdminProductRow) => {
    setActionError(null);
    setActionSuccess(null);
    try {
      await adminSaveProduct({
        id: prod.id,
        category_id: prod.category_id,
        name: prod.name,
        unit: prod.unit || '1 unit',
        price: prod.price,
        mrp: prod.mrp,
        discount_percent: prod.discount_percent,
        image_url: prod.image_url,
        is_active: !prod.is_active,
        is_popular: prod.is_popular,
        is_new_arrival: prod.is_new_arrival,
        display_order: prod.display_order,
        stock_quantity: prod.stock_quantity,
        low_stock_threshold: prod.low_stock_threshold,
      });
      setActionSuccess(
        `Product "${prod.name}" is now ${!prod.is_active ? 'Active' : 'Hidden'}.`
      );
      await loadDashboardData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to toggle product status.');
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    if (!window.confirm('Are you sure you want to delete this product?')) return;
    setActionError(null);
    try {
      await adminDeleteProduct(productId);
      setActionSuccess('Product deleted.');
      await loadDashboardData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete product.');
    }
  };

  // Handlers for Category CRUD
  const handleSaveCategoryForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory) return;
    setActionError(null);
    try {
      await adminSaveCategory({
        id: editingCategory.id,
        name: editingCategory.name || '',
        slug: editingCategory.slug,
        display_order: Number(editingCategory.display_order || 0),
        is_active: editingCategory.is_active !== false,
      });
      setEditingCategory(null);
      setActionSuccess('Category saved.');
      await loadDashboardData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to save category.');
    }
  };

  const handleToggleCategoryActive = async (cat: Category) => {
    setActionError(null);
    try {
      await adminSaveCategory({
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        display_order: Number(cat.display_order || 0),
        is_active: cat.is_active === false,
      });
      setActionSuccess(
        `Category "${cat.name}" is now ${cat.is_active === false ? 'Active' : 'Hidden'}.`
      );
      await loadDashboardData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update category.');
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    if (!window.confirm('Delete this category? Products in it will become uncategorized.')) return;
    setActionError(null);
    try {
      await adminDeleteCategory(categoryId);
      setActionSuccess('Category deleted.');
      await loadDashboardData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete category.');
    }
  };

  // Handlers for CSV Export / Import
  const handleExportCsv = () => {
    const csv = generateCatalogCsv(products, categories);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `fomo-store-catalog-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCsvFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = typeof evt.target?.result === 'string' ? evt.target.result : '';
      setCsvInputText(content);
      setActionError(null);
      setCsvImportResult(null);
    };
    reader.readAsText(file);
  };

  const handleImportCsv = async () => {
    setActionError(null);
    setCsvImportResult(null);
    const parsed = parseCatalogCsv(csvInputText);
    if (parsed.errors.length > 0) {
      setActionError(parsed.errors.join(' | '));
      return;
    }
    try {
      const res = await adminBulkImportCsvRows(parsed.rows, categories, products);
      setCsvImportResult(
        `Successfully imported ${res.importedCount} rows (${res.createdCount} created, ${res.updatedCount} existing products updated).`
      );
      setCsvInputText('');
      await loadDashboardData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'CSV import failed.');
    }
  };

  // Handlers for Store Settings & Immediate Store Open/Closed Control
  const handleQuickToggleStoreOpen = async (nextIsOpen: boolean) => {
    setActionError(null);
    setActionSuccess(null);
    setTogglingStoreOpen(true);
    try {
      const updated = await adminToggleStoreOpen(nextIsOpen);
      setSettings((prev) => ({
        ...prev,
        is_open: updated.is_open,
        status_notice: updated.status_notice,
      }));
      setActionSuccess(
        updated.is_open
          ? 'Store is now OPEN for live customer orders.'
          : 'Store has been CLOSED immediately. New checkouts are blocked; all existing orders and customer data remain preserved.'
      );
      await loadDashboardData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to toggle store open status.');
    } finally {
      setTogglingStoreOpen(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setActionSuccess(null);
    try {
      await adminSaveStoreSettings(settings);
      setActionSuccess('Store configuration saved to Supabase.');
      await loadDashboardData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to save settings.');
    }
  };

  // Handlers for User Role Promotion/Demotion & Rider Vehicle Details
  const handleRoleChange = async (targetUserId: string, newRole: UserRole) => {
    setActionError(null);
    setActionSuccess(null);
    try {
      await adminSetUserRoleViaRpc(targetUserId, newRole);
      setActionSuccess(`User role updated to "${newRole}".`);
      await loadDashboardData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Role update failed.');
    }
  };

  const handleSaveRiderVehicle = async (partnerId: string, vehicleDetails: string) => {
    setActionError(null);
    setActionSuccess(null);
    try {
      await adminUpdateRiderDetails(partnerId, { vehicle_details: vehicleDetails });
      setActionSuccess('Rider vehicle details saved.');
      await loadDashboardData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update rider details.');
    }
  };

  // ============================================================================
  // GUARD: LOGIN & ROLE VERIFICATION SCREEN
  // ============================================================================
  if (isLoadingAuth) {
    return (
      <div className="min-h-screen bg-brand-grey-blue flex items-center justify-center p-6">
        <div className="text-sm font-bold text-brand-navy animate-pulse">
          Verifying administrator session...
        </div>
      </div>
    );
  }

  if (!isAdminAuthorized && !(previewUnconfiguredUi && !isSupabaseReady)) {
    return (
      <div className="min-h-screen bg-brand-grey-blue flex flex-col items-center justify-center p-4 sm:p-6">
        <Card className="w-full max-w-md p-6 sm:p-8 border border-slate-200 shadow-card space-y-5">
          <div className="flex items-center justify-between">
            <div className="w-12 h-12 bg-brand-navy rounded-2xl flex items-center justify-center text-white">
              <ShieldCheck className="w-6 h-6 text-brand-orange" />
            </div>
            <Badge variant={isSupabaseReady ? 'navy' : 'placeholder'} size="sm">
              {isSupabaseReady ? 'Admin Role Required' : 'Unconfigured .env'}
            </Badge>
          </div>

          <div>
            <h1 className="text-xl font-black text-brand-navy">Owner Dashboard (/admin)</h1>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              Sign in with your administrator account. All catalog, inventory, settings, and role
              operations are strictly enforced by Supabase Row-Level Security (
              <code>public.is_admin()</code>).
            </p>
          </div>

          {userId && (!profile || profile.role !== 'admin') && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 text-xs text-rose-900 space-y-2.5">
              <div className="flex items-center gap-2 font-bold">
                <Lock className="w-4 h-4 text-rose-600" />
                <span>
                  Access Denied: {profile ? `Role is "${profile.role}"` : 'No Admin Profile Found'}
                </span>
              </div>
              <p className="leading-relaxed">
                Signed in as user ID <code className="font-mono">{userId}</code>, which does not
                have the <code>admin</code> role yet. Run the following command in the{' '}
                <strong>Supabase SQL Editor</strong> (as database administrator) to provision this account:
              </p>
              <code className="block p-2 bg-white rounded border border-rose-200 font-mono text-[11px] break-all">
                SELECT public.bootstrap_admin_account('{profile?.phone || userId}');
              </code>
              <p className="text-[11px] text-rose-700">
                You can pass either your verified phone number, verified email, or the user UUID shown above.
              </p>
              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <Button variant="primary" size="sm" fullWidth onClick={() => refreshProfile()}>
                  Re-check Admin Role
                </Button>
                <Button variant="outline" size="sm" fullWidth onClick={signOut}>
                  Sign Out & Switch Account
                </Button>
              </div>
            </div>
          )}

          {loginError && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-800">
              {loginError}
            </div>
          )}

          <form onSubmit={handleEmailLogin} className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-brand-navy mb-1">
                Owner Email Address
              </label>
              <Input
                type="email"
                required
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="owner@fomostore.in"
                icon={<Mail className="w-4 h-4" />}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-brand-navy mb-1">Password</label>
              <Input
                type="password"
                required
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="Enter password"
                icon={<KeyRound className="w-4 h-4" />}
              />
            </div>
            <Button type="submit" variant="primary" fullWidth disabled={loginLoading}>
              {loginLoading ? 'Signing In...' : 'Sign In as Owner (Email)'}
            </Button>
          </form>

          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-slate-200" />
            <span className="flex-shrink mx-3 text-[11px] text-slate-400 uppercase font-bold">
              Or
            </span>
            <div className="flex-grow border-t border-slate-200" />
          </div>

          <Button
            variant="secondary"
            fullWidth
            onClick={() => setIsOtpModalOpen(true)}
            className="gap-2"
          >
            <Phone className="w-4 h-4 text-brand-orange" />
            <span>Sign In with Phone OTP</span>
          </Button>

          {!isSupabaseReady && (
            <div className="pt-2 border-t border-slate-100 space-y-2">
              {getSupabaseEnvDiagnostic().isBlocked ? (
                <p className="text-[11px] text-rose-900 bg-rose-50 p-3 rounded-xl border border-rose-200 leading-relaxed">
                  <strong>Environment Safety Guard:</strong>{' '}
                  {getSupabaseEnvDiagnostic().setupMessage}
                </p>
              ) : (
                <>
                  <p className="text-[11px] text-amber-800 bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                    <strong>Local Demo Mode:</strong> Supabase credentials are not configured in{' '}
                    <code>.env</code> yet. You can open the interactive UI preview below to inspect
                    all 8 admin modules locally.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    fullWidth
                    onClick={() => setPreviewUnconfiguredUi(true)}
                  >
                    Preview Admin Dashboard UI (Demo Mode)
                  </Button>
                </>
              )}
            </div>
          )}

          <div className="pt-2 text-center">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-navy hover:text-brand-orange"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Return to Customer Storefront</span>
            </Link>
          </div>
        </Card>

        <PhoneOtpModal
          isOpen={isOtpModalOpen}
          onClose={() => setIsOtpModalOpen(false)}
          onSuccess={() => refreshProfile()}
          title="Owner Phone OTP Login"
        />
      </div>
    );
  }

  // ============================================================================
  // MAIN ADMIN DASHBOARD INTERFACE
  // ============================================================================
  const navTabs: Array<{ id: AdminTab; label: string; icon: React.ElementType; badge?: number }> = [
    { id: 'overview', label: 'Overview & Reports', icon: LayoutDashboard },
    { id: 'orders', label: 'Live Orders', icon: ShoppingBag, badge: analytics.activeOrdersCount },
    { id: 'products', label: 'Catalog (Products)', icon: Package },
    { id: 'categories', label: 'Categories', icon: Layers },
    { id: 'inventory', label: 'Inventory & Stock', icon: Boxes, badge: analytics.lowStockCount },
    { id: 'csv', label: 'Bulk CSV Tools', icon: FileSpreadsheet },
    { id: 'users', label: 'Customers & Riders', icon: Users },
    { id: 'settings', label: 'Store Settings', icon: Settings },
  ];

  const filteredOrders = orders.filter(
    (o) => orderStatusFilter === 'all' || o.status === orderStatusFilter
  );

  const displayedInventory = onlyLowStock
    ? products.filter((p) => p.stock_quantity <= p.low_stock_threshold)
    : products;

  return (
    <div className="min-h-screen bg-brand-grey-blue flex flex-col">
      {/* Top Admin Navbar */}
      <header className="bg-brand-navy text-white border-b-4 border-brand-orange sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white touch-target flex items-center justify-center"
              title="Back to Customer App"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base sm:text-lg font-black tracking-tight">
                  FOMO <span className="text-brand-orange">ADMIN</span>
                </span>
                <Badge variant={isSupabaseReady ? 'green' : 'placeholder'} size="sm">
                  {isSupabaseReady ? 'Live RLS Protected' : 'Demo UI Preview'}
                </Badge>
              </div>
              <p className="text-[11px] text-slate-300">
                Owner Control Panel • Rajauli, Nawada, Bihar
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Quick Store Open/Closed Control in Header */}
            <button
              onClick={() => handleQuickToggleStoreOpen(!settings.is_open)}
              disabled={togglingStoreOpen}
              className={`px-3 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all touch-target shadow-sm ${
                settings.is_open
                  ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                  : 'bg-rose-600 hover:bg-rose-700 text-white'
              }`}
              title={
                settings.is_open
                  ? 'Store is OPEN — Click to close store immediately'
                  : 'Store is CLOSED — Click to open store for customer orders'
              }
            >
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              <span>
                {togglingStoreOpen
                  ? 'Updating…'
                  : settings.is_open
                  ? 'Store OPEN (Click to Close)'
                  : 'Store CLOSED (Click to Open)'}
              </span>
            </button>

            <button
              onClick={() => setSoundAlertsEnabled((v) => !v)}
              className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold flex items-center gap-1.5 touch-target"
              title="Toggle New Order Sound Alert"
            >
              {soundAlertsEnabled ? (
                <Volume2 className="w-4 h-4 text-brand-orange" />
              ) : (
                <VolumeX className="w-4 h-4 text-slate-400" />
              )}
              <span className="hidden sm:inline">
                {soundAlertsEnabled ? 'Sound On' : 'Muted'}
              </span>
            </button>

            <button
              onClick={loadDashboardData}
              className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold flex items-center gap-1.5 touch-target"
            >
              <RefreshCw className={`w-4 h-4 ${loadingData ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Sync</span>
            </button>

            {userId && (
              <button
                onClick={signOut}
                className="px-3 py-2 rounded-xl bg-rose-600/80 hover:bg-rose-600 text-xs font-bold flex items-center gap-1.5 touch-target"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            )}
          </div>
        </div>

        {/* Module Navigation Pills */}
        <div className="bg-brand-navy-dark/80 px-4 py-2 overflow-x-auto">
          <div className="max-w-7xl mx-auto flex items-center gap-2">
            {navTabs.map((t) => {
              const Icon = t.icon;
              const active = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    setActiveTab(t.id);
                    setActionError(null);
                    setActionSuccess(null);
                  }}
                  className={`flex-shrink-0 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all touch-target ${
                    active
                      ? 'bg-brand-orange text-brand-navy shadow-sm'
                      : 'text-slate-300 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{t.label}</span>
                  {t.badge !== undefined && t.badge > 0 && (
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                        active ? 'bg-brand-navy text-white' : 'bg-brand-orange text-brand-navy'
                      }`}
                    >
                      {t.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="max-w-7xl w-full mx-auto px-4 py-6 flex-1 space-y-5">
        {!isSupabaseReady && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-900 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <strong>Demo Preview Mode (Unconfigured .env):</strong> Database write actions will
              prompt for Supabase configuration. Connect <code>VITE_SUPABASE_URL</code> and{' '}
              <code>VITE_SUPABASE_ANON_KEY</code> to persist changes to your database.
            </div>
          </div>
        )}

        {newOrderBanner && (
          <div className="bg-brand-orange text-brand-navy rounded-2xl p-3.5 text-xs font-extrabold flex items-center justify-between shadow-sm">
            <span>🔔 {newOrderBanner}</span>
            <button onClick={() => setNewOrderBanner(null)} className="underline">
              Dismiss
            </button>
          </div>
        )}

        {actionError && (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3.5 text-xs text-rose-800 flex items-start justify-between gap-2">
            <span>{actionError}</span>
            <button onClick={() => setActionError(null)} className="font-bold">
              ✕
            </button>
          </div>
        )}

        {actionSuccess && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 text-xs text-emerald-800 flex items-start justify-between gap-2">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              {actionSuccess}
            </span>
            <button onClick={() => setActionSuccess(null)} className="font-bold">
              ✕
            </button>
          </div>
        )}

        {/* CRITICAL STORE OPEN / CLOSED CONTROL & OPERATIONAL READINESS PANEL */}
        <Card
          className={`p-4 sm:p-5 border-2 transition-colors ${
            settings.is_open
              ? 'border-emerald-300 bg-emerald-50/50'
              : 'border-rose-300 bg-rose-50/50'
          }`}
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={settings.is_open ? 'green' : 'red'} size="md">
                  {settings.is_open ? '● STORE OPEN FOR ORDERS' : '● STORE CLOSED (CHECKOUT LOCKED)'}
                </Badge>
                <span className="text-xs font-bold text-brand-navy">
                  {settings.status_notice ||
                    (settings.is_open
                      ? 'Accepting live customer orders'
                      : 'New customer checkouts are currently blocked')}
                </span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                {settings.is_open ? (
                  <>
                    Customers can browse and place orders. If any operational, inventory, or
                    fulfillment issue occurs, click{' '}
                    <strong>Emergency Close Store Immediately</strong> to block new checkouts while
                    preserving all existing orders and customer data.
                  </>
                ) : (
                  <>
                    New customer checkouts are blocked at both frontend and database (
                    <code>place_order</code> RPC) levels. All existing orders ({orders.length}) and
                    customer accounts remain preserved and manageable below.
                  </>
                )}
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] font-mono text-slate-600">
                <span>
                  Active Sellable Products:{' '}
                  <strong className="text-brand-navy">
                    {
                      products.filter(
                        (p) => p.is_active && p.price !== null && p.price >= 0 && p.stock_quantity > 0
                      ).length
                    }
                  </strong>
                </span>
                <span>•</span>
                <span>
                  Store Pickup:{' '}
                  <strong className="text-emerald-700">
                    {settings.is_open ? 'ACTIVE (₹0 Fee)' : 'Ready when Store Opens'}
                  </strong>
                </span>
                <span>•</span>
                <span>
                  Doorstep Delivery:{' '}
                  <strong
                    className={
                      settings.delivery_fee !== null &&
                      Array.isArray(settings.serviceable_pincodes) &&
                      settings.serviceable_pincodes.length > 0
                        ? 'text-emerald-700'
                        : 'text-amber-700'
                    }
                  >
                    {settings.delivery_fee !== null &&
                    Array.isArray(settings.serviceable_pincodes) &&
                    settings.serviceable_pincodes.length > 0
                      ? `ACTIVE (Fee ₹${settings.delivery_fee} • PINs: ${settings.serviceable_pincodes.join(', ')})`
                      : 'Disabled until Delivery Fee & PIN codes are set in Store Settings'}
                  </strong>
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
              {settings.is_open ? (
                <Button
                  variant="danger"
                  size="sm"
                  disabled={togglingStoreOpen}
                  onClick={() => handleQuickToggleStoreOpen(false)}
                >
                  {togglingStoreOpen ? 'Closing Store…' : 'Emergency Close Store Immediately'}
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  disabled={togglingStoreOpen}
                  onClick={() => handleQuickToggleStoreOpen(true)}
                >
                  {togglingStoreOpen ? 'Opening Store…' : 'Open Store for Customer Orders'}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveTab('settings')}
              >
                Configure Store Settings
              </Button>
            </div>
          </div>
        </Card>

        {/* TAB 1: OVERVIEW & REPORTS */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-brand-navy">Store Overview & Analytics</h2>
                <p className="text-xs text-slate-500">
                  Real-time sales metrics, order volume, and inventory health
                </p>
              </div>
              <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-slate-200">
                {(
                  [
                    { id: 'today', label: 'Today' },
                    { id: '7d', label: 'Last 7 Days' },
                    { id: '30d', label: 'Last 30 Days' },
                    { id: 'all', label: 'All Time' },
                  ] as const
                ).map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setReportRange(r.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                      reportRange === r.id
                        ? 'bg-brand-navy text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="p-4 border border-slate-200">
                <span className="text-xs text-slate-500 font-semibold">Today's Revenue</span>
                <p className="text-2xl font-black text-brand-navy font-mono mt-1">
                  ₹{analytics.todayRevenue.toFixed(0)}
                </p>
                <span className="text-[11px] text-slate-400">
                  {analytics.todayOrdersCount} orders today
                </span>
              </Card>

              <Card className="p-4 border border-slate-200">
                <span className="text-xs text-slate-500 font-semibold">
                  Period Revenue ({reportRange.toUpperCase()})
                </span>
                <p className="text-2xl font-black text-brand-orange font-mono mt-1">
                  ₹{analytics.totalRevenue.toFixed(0)}
                </p>
                <span className="text-[11px] text-slate-400">
                  {analytics.totalOrdersInRange} total orders
                </span>
              </Card>

              <Card className="p-4 border border-slate-200">
                <span className="text-xs text-slate-500 font-semibold">Active Live Orders</span>
                <p className="text-2xl font-black text-brand-navy font-mono mt-1">
                  {analytics.activeOrdersCount}
                </p>
                <span className="text-[11px] text-emerald-700 font-semibold">
                  Store is {settings.is_open ? 'OPEN' : 'CLOSED'}
                </span>
              </Card>

              <Card className="p-4 border border-slate-200">
                <span className="text-xs text-slate-500 font-semibold">Low-Stock Alerts</span>
                <p className="text-2xl font-black text-rose-600 font-mono mt-1">
                  {analytics.lowStockCount}
                </p>
                <span className="text-[11px] text-slate-400">
                  Out of {products.length} catalog items
                </span>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Top Selling Products */}
              <Card className="p-5 border border-slate-200 space-y-3">
                <h3 className="text-sm font-bold text-brand-navy uppercase tracking-wider">
                  Top Selling Products
                </h3>
                {analytics.topSellers.length === 0 ? (
                  <p className="text-xs text-slate-400 py-6 text-center">
                    No completed order sales in this date range yet.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 text-xs">
                    {analytics.topSellers.map((item, idx) => (
                      <div key={item.name} className="py-2.5 flex items-center justify-between">
                        <div>
                          <span className="font-bold text-brand-navy">
                            #{idx + 1} {item.name}
                          </span>
                          <span className="text-slate-400 ml-2">({item.qty} units sold)</span>
                        </div>
                        <span className="font-mono font-bold text-brand-navy">
                          ₹{item.revenue.toFixed(0)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* Sales by Day */}
              <Card className="p-5 border border-slate-200 space-y-3">
                <h3 className="text-sm font-bold text-brand-navy uppercase tracking-wider">
                  Sales Breakdown by Day (COD)
                </h3>
                {analytics.salesByDay.length === 0 ? (
                  <p className="text-xs text-slate-400 py-6 text-center">
                    No daily sales data recorded in this range yet.
                  </p>
                ) : (
                  <div className="space-y-2 text-xs">
                    {analytics.salesByDay.map((d) => (
                      <div
                        key={d.date}
                        className="flex items-center justify-between p-2 rounded-lg bg-slate-50"
                      >
                        <span className="font-bold text-brand-navy">{d.date}</span>
                        <span className="text-slate-500">{d.orders} orders</span>
                        <span className="font-mono font-bold text-brand-orange">
                          ₹{d.revenue.toFixed(0)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </div>
        )}

        {/* TAB 2: LIVE ORDERS & DISPATCH */}
        {activeTab === 'orders' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-brand-navy">Live Order Dispatch</h2>
                <p className="text-xs text-slate-500">
                  Confirm orders, pack items, assign delivery riders, or cancel with reason
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(['all', ...ORDER_STATUS_SEQUENCE, 'cancelled'] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => setOrderStatusFilter(st)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize ${
                      orderStatusFilter === st
                        ? 'bg-brand-navy text-white'
                        : 'bg-white text-slate-600 border border-slate-200'
                    }`}
                  >
                    {st.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>
            </div>

            {filteredOrders.length === 0 ? (
              <Card className="p-8 text-center text-xs text-slate-500">
                No orders match the selected status filter.
              </Card>
            ) : (
              <div className="space-y-4">
                {filteredOrders.map((ord) => {
                  const statusOptions =
                    ord.delivery_mode === 'pickup'
                      ? ORDER_STATUS_SEQUENCE.filter((st) => st !== 'out_for_delivery')
                      : ORDER_STATUS_SEQUENCE;
                  return (
                    <Card key={ord.id} className="p-5 border border-slate-200 space-y-4">
                      <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-slate-100">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-black text-brand-navy">
                              {ord.order_number}
                            </span>
                            <Badge variant={ord.status === 'cancelled' ? 'red' : 'orange'} size="sm">
                              {ORDER_STATUS_LABELS[ord.status]}
                            </Badge>
                            <Badge variant="neutral" size="sm" className="uppercase">
                              {ord.delivery_mode}
                            </Badge>
                          </div>
                          <p className="text-xs text-slate-600 mt-1">
                            <strong>Customer:</strong> {ord.customer_name || 'Customer'}{' '}
                            {ord.customer_phone ? `(${ord.customer_phone})` : ''} •{' '}
                            {new Date(ord.created_at).toLocaleString()}
                          </p>
                          {ord.delivery_mode === 'delivery' && ord.delivery_address && (
                            <p className="text-xs text-slate-500 mt-0.5 font-mono">
                              Address: {ord.delivery_address.address_line}
                              {ord.delivery_address.landmark
                                ? `, Landmark: ${ord.delivery_address.landmark}`
                                : ''}{' '}
                              (PIN: {ord.delivery_address.pincode})
                            </p>
                          )}
                          {ord.cancel_reason && (
                            <p className="text-xs text-rose-700 font-semibold mt-1 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200 inline-block">
                              Cancellation Reason: {ord.cancel_reason}
                            </p>
                          )}
                        </div>

                        <div className="text-right">
                          <span className="text-xs text-slate-400 block">COD Total</span>
                          <span className="text-lg font-black text-brand-navy font-mono">
                            ₹{ord.total_amount.toFixed(0)}
                          </span>
                        </div>
                      </div>

                      {/* Items list */}
                      <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80 space-y-1 text-xs">
                        {ord.items.map((item) => (
                          <div key={item.id} className="flex justify-between">
                            <span>
                              <strong>{item.quantity}×</strong> {item.product_name}{' '}
                              {item.unit ? `(${item.unit})` : ''}
                            </span>
                            <span className="font-mono font-semibold">
                              ₹{item.total_price.toFixed(0)}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Order Status History Timeline */}
                      {ord.history && ord.history.length > 0 && (
                        <div className="bg-white rounded-xl p-3 border border-slate-200 space-y-1.5 text-[11px]">
                          <span className="font-bold text-brand-navy uppercase tracking-wider block">
                            Order Status History ({ord.history.length})
                          </span>
                          <div className="space-y-1">
                            {ord.history.map((h) => (
                              <div
                                key={h.id}
                                className="flex flex-wrap items-center justify-between gap-2 text-slate-600 border-b border-slate-100 last:border-0 pb-1 last:pb-0"
                              >
                                <div>
                                  <span className="font-bold text-brand-navy">
                                    {ORDER_STATUS_LABELS[h.status] || h.status}
                                  </span>
                                  {h.note && <span className="text-slate-500"> — {h.note}</span>}
                                </div>
                                <span className="font-mono text-slate-400">
                                  {new Date(h.created_at).toLocaleString()}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Controls: Status Progression, Rider Assignment, Cancel */}
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="text-xs font-bold text-brand-navy">Status:</label>
                          <select
                            value={ord.status}
                            disabled={ord.status === 'cancelled' || ord.status === 'delivered'}
                            onChange={(e) =>
                              handleStatusChange(ord.id, e.target.value as OrderStatus)
                            }
                            className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-brand-navy bg-white min-h-[44px]"
                          >
                            {statusOptions.map((st) => (
                              <option key={st} value={st}>
                                {ORDER_STATUS_LABELS[st]}
                              </option>
                            ))}
                            <option value="cancelled">Cancelled</option>
                          </select>

                          {ord.delivery_mode === 'delivery' && (
                            <>
                              <label className="text-xs font-bold text-brand-navy ml-2">
                                Assign Rider:
                              </label>
                              <select
                                value={ord.delivery_partner_id || ''}
                                disabled={ord.status === 'cancelled' || ord.status === 'delivered'}
                                onChange={(e) =>
                                  handleAssignRider(ord.id, e.target.value, ord.status)
                                }
                                className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-brand-navy bg-white min-h-[44px]"
                              >
                                <option value="">-- Unassigned --</option>
                                {riders.map((r) => (
                                  <option key={r.id} value={r.id}>
                                    {r.profile?.full_name || r.profile?.phone || r.id.slice(0, 8)} (
                                    {r.is_online ? 'Online' : 'Offline'})
                                  </option>
                                ))}
                              </select>
                            </>
                          )}
                        </div>

                        {ord.status !== 'cancelled' && ord.status !== 'delivered' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setCancelOrderTargetId(ord.id);
                              setCancelReasonText('');
                            }}
                            className="text-rose-600 gap-1"
                          >
                            <XCircle className="w-4 h-4" />
                            <span>Cancel with Reason</span>
                          </Button>
                        )}
                      </div>

                      {cancelOrderTargetId === ord.id && (
                        <div className="bg-rose-50 p-3.5 rounded-xl border border-rose-200 flex flex-wrap items-center gap-2">
                          <Input
                            value={cancelReasonText}
                            onChange={(e) => setCancelReasonText(e.target.value)}
                            placeholder="Enter mandatory cancellation reason..."
                            className="flex-1 bg-white"
                          />
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => handleConfirmAdminCancel(ord.id)}
                          >
                            Confirm Cancellation
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setCancelOrderTargetId(null)}
                          >
                            Close
                          </Button>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: PRODUCTS CATALOG CRUD */}
        {activeTab === 'products' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-brand-navy">Product Catalog</h2>
                <p className="text-xs text-slate-500">
                  Add, edit, upload images, set prices/MRP, or deactivate products
                </p>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={() =>
                  setEditingProduct({
                    name: '',
                    unit: '1 kg',
                    price: null,
                    mrp: null,
                    discount_percent: '',
                    category_id: categories[0]?.id || null,
                    is_active: true,
                    is_popular: false,
                    is_new_arrival: true,
                    display_order: products.length,
                    stock_quantity: 10,
                    low_stock_threshold: 5,
                  })
                }
                className="gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Add New Product</span>
              </Button>
            </div>

            {editingProduct && (
              <Card className="p-5 border-2 border-brand-orange/40 space-y-4">
                <h3 className="text-sm font-black text-brand-navy uppercase">
                  {editingProduct.id ? 'Edit Product' : 'New Product'}
                </h3>
                <form
                  onSubmit={handleSaveProductForm}
                  className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs"
                >
                  <div>
                    <label className="block font-bold text-slate-600 mb-1">Product Name *</label>
                    <Input
                      required
                      value={editingProduct.name || ''}
                      onChange={(e) =>
                        setEditingProduct({ ...editingProduct, name: e.target.value })
                      }
                      placeholder="e.g. Aashirvaad Atta"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-600 mb-1">Category</label>
                    <select
                      value={editingProduct.category_id || ''}
                      onChange={(e) =>
                        setEditingProduct({
                          ...editingProduct,
                          category_id: e.target.value || null,
                        })
                      }
                      className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 bg-slate-50 text-brand-navy font-medium"
                    >
                      <option value="">-- Uncategorized --</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-600 mb-1">Pack / Unit *</label>
                    <Input
                      required
                      value={editingProduct.unit || ''}
                      onChange={(e) =>
                        setEditingProduct({ ...editingProduct, unit: e.target.value })
                      }
                      placeholder="e.g. 5 kg bag, 500 ml"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-600 mb-1">
                      Selling Price (₹)
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editingProduct.price ?? ''}
                      onChange={(e) =>
                        setEditingProduct({
                          ...editingProduct,
                          price: e.target.value === '' ? null : Number(e.target.value),
                        })
                      }
                      placeholder="Leave empty if unconfigured"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-600 mb-1">
                      MRP (₹) [Must be ≥ Price]
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editingProduct.mrp ?? ''}
                      onChange={(e) =>
                        setEditingProduct({
                          ...editingProduct,
                          mrp: e.target.value === '' ? null : Number(e.target.value),
                        })
                      }
                      placeholder="Optional MRP"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-600 mb-1">
                      Discount Label (Optional)
                    </label>
                    <Input
                      value={editingProduct.discount_percent || ''}
                      onChange={(e) =>
                        setEditingProduct({
                          ...editingProduct,
                          discount_percent: e.target.value,
                        })
                      }
                      placeholder="e.g. 10% OFF"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-600 mb-1">
                      Stock Quantity *
                    </label>
                    <Input
                      type="number"
                      min="0"
                      required
                      value={editingProduct.stock_quantity ?? 0}
                      onChange={(e) =>
                        setEditingProduct({
                          ...editingProduct,
                          stock_quantity: Math.max(0, parseInt(e.target.value || '0', 10)),
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-600 mb-1">
                      Low-Stock Warning Threshold
                    </label>
                    <Input
                      type="number"
                      min="0"
                      value={editingProduct.low_stock_threshold ?? 5}
                      onChange={(e) =>
                        setEditingProduct({
                          ...editingProduct,
                          low_stock_threshold: Math.max(0, parseInt(e.target.value || '5', 10)),
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-600 mb-1">
                      Product Image (URL or Upload ≤ 5MB)
                    </label>
                    <div className="flex gap-2">
                      <Input
                        value={editingProduct.image_url || ''}
                        onChange={(e) =>
                          setEditingProduct({ ...editingProduct, image_url: e.target.value })
                        }
                        placeholder="https://..."
                      />
                      <label className="px-3 py-2 rounded-xl bg-brand-navy text-white font-bold cursor-pointer flex items-center justify-center touch-target">
                        <Upload className="w-4 h-4" />
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          onChange={handleImageFileChange}
                          className="hidden"
                          disabled={uploadingImage}
                        />
                      </label>
                    </div>
                  </div>

                  <div className="sm:col-span-3 flex flex-wrap gap-4 pt-1">
                    <label className="flex items-center gap-2 font-bold text-brand-navy cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editingProduct.is_active !== false}
                        onChange={(e) =>
                          setEditingProduct({ ...editingProduct, is_active: e.target.checked })
                        }
                      />
                      <span>Active in Storefront</span>
                    </label>
                    <label className="flex items-center gap-2 font-bold text-brand-navy cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(editingProduct.is_popular)}
                        onChange={(e) =>
                          setEditingProduct({ ...editingProduct, is_popular: e.target.checked })
                        }
                      />
                      <span>Popular Item</span>
                    </label>
                    <label className="flex items-center gap-2 font-bold text-brand-navy cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(editingProduct.is_new_arrival)}
                        onChange={(e) =>
                          setEditingProduct({
                            ...editingProduct,
                            is_new_arrival: e.target.checked,
                          })
                        }
                      />
                      <span>New Arrival</span>
                    </label>
                  </div>

                  <div className="sm:col-span-3 flex gap-2 pt-2">
                    <Button type="submit" size="sm" variant="primary">
                      Save Product
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingProduct(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {products.map((p) => {
                const catName =
                  categories.find((c) => c.id === p.category_id)?.name || 'Uncategorized';
                return (
                  <Card
                    key={p.id}
                    className="p-4 border border-slate-200 flex flex-col justify-between gap-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="text-sm font-bold text-brand-navy">{p.name}</h4>
                        <p className="text-xs text-slate-500">
                          {catName} • Unit: {p.unit || 'N/A'} • Stock:{' '}
                          <strong>{p.stock_quantity}</strong>
                        </p>
                        <p className="text-xs font-mono font-bold text-brand-orange mt-1">
                          Price: {formatCurrencyOrPlaceholder(p.price, '₹[Unset]')}{' '}
                          {p.mrp !== null && p.mrp !== undefined ? `| MRP: ₹${p.mrp}` : ''}
                        </p>
                      </div>
                      <Badge variant={p.is_active ? 'green' : 'neutral'} size="sm">
                        {p.is_active ? 'Active' : 'Hidden'}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-slate-100">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleToggleProductActive(p)}
                        className="text-xs"
                      >
                        {p.is_active ? 'Deactivate' : 'Activate'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingProduct(p)}
                        className="gap-1"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteProduct(p.id)}
                        className="text-rose-600 gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 4: CATEGORIES CRUD */}
        {activeTab === 'categories' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-brand-navy">Store Categories</h2>
                <p className="text-xs text-slate-500">
                  Add, rename, reorder, or deactivate product categories (duplicate names/slugs are
                  blocked)
                </p>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={() =>
                  setEditingCategory({
                    name: '',
                    display_order: categories.length,
                    is_active: true,
                  })
                }
                className="gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Add Category</span>
              </Button>
            </div>

            {editingCategory && (
              <Card className="p-5 border-2 border-brand-orange/40">
                <form
                  onSubmit={handleSaveCategoryForm}
                  className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs items-end"
                >
                  <div>
                    <label className="block font-bold text-slate-600 mb-1">Category Name *</label>
                    <Input
                      required
                      value={editingCategory.name || ''}
                      onChange={(e) => {
                        const newName = e.target.value;
                        const autoSlug = newName
                          .toLowerCase()
                          .replace(/[^a-z0-9]+/g, '-')
                          .replace(/(^-|-$)/g, '');
                        setEditingCategory({
                          ...editingCategory,
                          name: newName,
                          slug: autoSlug,
                        });
                      }}
                      placeholder="e.g. Dairy & Bakery"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-600 mb-1">Display Order</label>
                    <Input
                      type="number"
                      value={editingCategory.display_order ?? 0}
                      onChange={(e) =>
                        setEditingCategory({
                          ...editingCategory,
                          display_order: parseInt(e.target.value || '0', 10),
                        })
                      }
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 font-bold text-brand-navy cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editingCategory.is_active !== false}
                        onChange={(e) =>
                          setEditingCategory({
                            ...editingCategory,
                            is_active: e.target.checked,
                          })
                        }
                      />
                      <span>Active</span>
                    </label>
                    <Button type="submit" size="sm" variant="primary">
                      Save
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingCategory(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </Card>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {categories.map((c) => (
                <Card
                  key={c.id}
                  className="p-4 border border-slate-200 flex items-center justify-between gap-2"
                >
                  <div>
                    <h4 className="text-sm font-bold text-brand-navy">{c.name}</h4>
                    <span className="text-[11px] text-slate-400 font-mono">
                      Order: {c.display_order ?? 0} • {c.is_active !== false ? 'Active' : 'Hidden'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleToggleCategoryActive(c)}
                      className="text-xs"
                    >
                      {c.is_active !== false ? 'Hide' : 'Activate'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingCategory(c)}>
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDeleteCategory(c.id)}
                      className="text-rose-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* TAB 5: INVENTORY & LOW STOCK */}
        {activeTab === 'inventory' && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-brand-navy">Inventory & Stock Control</h2>
                <p className="text-xs text-slate-500">
                  Update live stock counts and low-stock warning thresholds. Stock automatically
                  decrements on order placement and restores on cancellation.
                </p>
              </div>
              <Button
                variant={onlyLowStock ? 'primary' : 'outline'}
                size="sm"
                onClick={() => setOnlyLowStock((v) => !v)}
              >
                {onlyLowStock
                  ? 'Showing Low-Stock Only (Click for All)'
                  : `Filter Low-Stock (${analytics.lowStockCount})`}
              </Button>
            </div>

            <div className="space-y-2.5">
              {displayedInventory.map((p) => {
                const isLow = p.stock_quantity <= p.low_stock_threshold;
                const draft = stockDrafts[p.id] || {
                  stock_quantity: p.stock_quantity,
                  low_stock_threshold: p.low_stock_threshold,
                };
                return (
                  <Card
                    key={p.id}
                    className={`p-4 border flex flex-wrap items-center justify-between gap-3 ${
                      p.stock_quantity === 0
                        ? 'border-rose-300 bg-rose-50/40'
                        : isLow
                        ? 'border-amber-300 bg-amber-50/40'
                        : 'border-slate-200'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-brand-navy">{p.name}</span>
                        {p.stock_quantity === 0 ? (
                          <Badge variant="red" size="sm">
                            Out of Stock
                          </Badge>
                        ) : isLow ? (
                          <Badge variant="orange" size="sm">
                            Low Stock (≤ {p.low_stock_threshold})
                          </Badge>
                        ) : (
                          <Badge variant="green" size="sm">
                            In Stock
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-slate-500">
                        Pack: {p.unit}
                        {p.inventory_updated_at
                          ? ` • Updated: ${new Date(p.inventory_updated_at).toLocaleString()}`
                          : ''}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={p.stock_quantity <= 0}
                        onClick={async () => {
                          const next = Math.max(0, p.stock_quantity - 1);
                          try {
                            await adminUpdateProductStock(p.id, next, p.low_stock_threshold);
                            await loadDashboardData();
                          } catch (err) {
                            setActionError(err instanceof Error ? err.message : 'Update failed.');
                          }
                        }}
                      >
                        -1
                      </Button>
                      <span className="px-3 py-2 rounded-xl bg-white border border-slate-200 font-mono text-sm font-black text-brand-navy min-w-[56px] text-center">
                        {p.stock_quantity}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          const next = p.stock_quantity + 1;
                          try {
                            await adminUpdateProductStock(p.id, next, p.low_stock_threshold);
                            await loadDashboardData();
                          } catch (err) {
                            setActionError(err instanceof Error ? err.message : 'Update failed.');
                          }
                        }}
                      >
                        +1
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={async () => {
                          const next = p.stock_quantity + 10;
                          try {
                            await adminUpdateProductStock(p.id, next, p.low_stock_threshold);
                            await loadDashboardData();
                          } catch (err) {
                            setActionError(err instanceof Error ? err.message : 'Update failed.');
                          }
                        }}
                      >
                        +10
                      </Button>

                      {/* Direct Exact Stock & Threshold Setter */}
                      <div className="flex items-center gap-1.5 pl-2 border-l border-slate-200 text-xs">
                        <label className="text-slate-500 font-semibold">Qty:</label>
                        <input
                          type="number"
                          min="0"
                          value={draft.stock_quantity}
                          onChange={(e) =>
                            setStockDrafts({
                              ...stockDrafts,
                              [p.id]: {
                                ...draft,
                                stock_quantity: Math.max(0, parseInt(e.target.value || '0', 10)),
                              },
                            })
                          }
                          className="w-16 px-2 py-1.5 rounded-lg border border-slate-300 bg-white font-mono text-center"
                        />
                        <label className="text-slate-500 font-semibold">Min:</label>
                        <input
                          type="number"
                          min="0"
                          value={draft.low_stock_threshold}
                          onChange={(e) =>
                            setStockDrafts({
                              ...stockDrafts,
                              [p.id]: {
                                ...draft,
                                low_stock_threshold: Math.max(
                                  0,
                                  parseInt(e.target.value || '0', 10)
                                ),
                              },
                            })
                          }
                          className="w-14 px-2 py-1.5 rounded-lg border border-slate-300 bg-white font-mono text-center"
                        />
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={async () => {
                            setActionError(null);
                            try {
                              await adminUpdateProductStock(
                                p.id,
                                draft.stock_quantity,
                                draft.low_stock_threshold
                              );
                              setActionSuccess(`Updated stock & threshold for "${p.name}".`);
                              await loadDashboardData();
                            } catch (err) {
                              setActionError(
                                err instanceof Error ? err.message : 'Update failed.'
                              );
                            }
                          }}
                        >
                          Save
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>

            {/* Stock Movement & Order Deduction Log */}
            <Card className="p-5 border border-slate-200 space-y-3">
              <h3 className="text-sm font-black text-brand-navy uppercase tracking-wider">
                Recent Order Stock Movements (Deductions & Restorations)
              </h3>
              {analytics.stockMovements.length === 0 ? (
                <p className="text-xs text-slate-400 py-3">
                  No order-triggered stock movements recorded yet.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 text-xs">
                  {analytics.stockMovements.map((m) => (
                    <div
                      key={m.orderId}
                      className="py-2 flex flex-wrap items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant={m.isRestored ? 'green' : 'orange'} size="sm">
                          {m.isRestored ? 'Stock Restored (Cancelled)' : 'Stock Deducted (Order)'}
                        </Badge>
                        <span className="font-mono font-bold text-brand-navy">
                          {m.orderNumber}
                        </span>
                        <span className="text-slate-600">{m.summary}</span>
                      </div>
                      <span className="font-mono text-slate-400">
                        {new Date(m.timestamp).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}

        {/* TAB 6: BULK CSV TOOLS */}
        {activeTab === 'csv' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="p-5 border border-slate-200 space-y-4">
              <h3 className="text-base font-black text-brand-navy">Export Catalog & Stock (CSV)</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Download your complete FOMO Store product catalog, prices, MRPs, categories, and
                current stock quantities as a standard CSV spreadsheet.
              </p>
              <Button variant="primary" onClick={handleExportCsv} className="gap-2">
                <Download className="w-4 h-4" />
                <span>Download Catalog CSV ({products.length} rows)</span>
              </Button>
            </Card>

            <Card className="p-5 border border-slate-200 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-black text-brand-navy">
                  Bulk Import Products & Stock
                </h3>
                <label className="px-3 py-1.5 rounded-xl bg-brand-navy text-white text-xs font-bold cursor-pointer flex items-center gap-1.5">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Load .CSV File</span>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={handleCsvFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
              <p className="text-xs text-slate-600">
                Paste or upload CSV rows with header:{' '}
                <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">
                  name,category_name,unit,price,mrp,discount_percent,stock_quantity,low_stock_threshold,is_active
                </code>
                . Matching products (by ID or Name + Unit) are updated in place without creating
                duplicates.
              </p>
              {csvImportResult && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-800">
                  {csvImportResult}
                </div>
              )}
              <textarea
                rows={5}
                value={csvInputText}
                onChange={(e) => setCsvInputText(e.target.value)}
                placeholder={`name,category_name,unit,price,mrp,stock_quantity\nBasmati Rice,Grocery Staples,5 kg,450,500,25`}
                className="w-full p-3 rounded-xl border border-slate-200 font-mono text-xs bg-slate-50 focus:bg-white focus:outline-none"
              />
              <Button
                variant="secondary"
                onClick={handleImportCsv}
                disabled={!csvInputText.trim()}
              >
                Validate & Import CSV Rows
              </Button>
            </Card>
          </div>
        )}

        {/* TAB 7: CUSTOMERS & RIDERS MANAGEMENT */}
        {activeTab === 'users' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-black text-brand-navy">Customers, Riders & Roles</h2>
              <p className="text-xs text-slate-500">
                Role changes are executed via <code>public.admin_set_user_role()</code> RPC.
                Promoting a user to <code>rider</code> automatically provisions their delivery
                partner record.
              </p>
            </div>

            {profiles.length === 0 ? (
              <Card className="p-6 text-center text-xs text-slate-500">
                No registered user profiles loaded yet.
              </Card>
            ) : (
              <div className="space-y-2.5">
                {profiles.map((u) => {
                  const riderRec = riders.find((r) => r.user_id === u.id);
                  const vehicleVal =
                    riderRec && riderVehicleDrafts[riderRec.id] !== undefined
                      ? riderVehicleDrafts[riderRec.id]
                      : riderRec?.vehicle_details || '';
                  return (
                    <Card
                      key={u.id}
                      className="p-4 border border-slate-200 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="text-xs space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-brand-navy text-sm">
                            {u.full_name || 'Unnamed User'}
                          </span>
                          <Badge
                            variant={
                              u.role === 'admin'
                                ? 'orange'
                                : u.role === 'rider'
                                ? 'navy'
                                : 'neutral'
                            }
                            size="sm"
                            className="uppercase"
                          >
                            {u.role}
                          </Badge>
                          {riderRec && (
                            <Badge variant={riderRec.is_online ? 'green' : 'neutral'} size="sm">
                              Rider {riderRec.is_online ? 'ONLINE' : 'Offline'}
                            </Badge>
                          )}
                        </div>
                        <p className="text-slate-500 font-mono">
                          Phone: {u.phone || 'N/A'} • ID: {u.id.slice(0, 8)}...
                        </p>
                        {riderRec && (
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <input
                              type="text"
                              value={vehicleVal}
                              onChange={(e) =>
                                setRiderVehicleDrafts({
                                  ...riderVehicleDrafts,
                                  [riderRec.id]: e.target.value,
                                })
                              }
                              placeholder="Vehicle details (e.g. Bike BR-27-XXXX)"
                              className="px-2.5 py-1 rounded-lg border border-slate-300 text-xs bg-white min-w-[210px]"
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleSaveRiderVehicle(riderRec.id, vehicleVal)}
                            >
                              Save Vehicle
                            </Button>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <label className="text-xs font-bold text-slate-500">Role:</label>
                        <select
                          value={u.role}
                          disabled={u.id === userId}
                          onChange={(e) => handleRoleChange(u.id, e.target.value as UserRole)}
                          className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-brand-navy bg-white min-h-[44px]"
                        >
                          <option value="customer">customer</option>
                          <option value="rider">rider</option>
                          <option value="admin">admin</option>
                        </select>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 8: STORE SETTINGS */}
        {activeTab === 'settings' && (
          <Card className="p-6 border border-slate-200 max-w-3xl space-y-5">
            <div>
              <h2 className="text-xl font-black text-brand-navy">Store Configuration & Rules</h2>
              <p className="text-xs text-slate-500">
                Owner-controlled settings (`public.store_settings`). Never hard-coded.
              </p>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-4 text-xs">
              <div className="p-4 rounded-xl bg-brand-grey-blue border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="font-bold text-brand-navy text-sm block">
                    Store Open for Orders
                  </span>
                  <span className="text-slate-600">
                    When turned OFF, customer checkout is automatically blocked with a friendly
                    message.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.is_open}
                  onChange={(e) => setSettings({ ...settings, is_open: e.target.checked })}
                  className="w-6 h-6 accent-brand-orange cursor-pointer"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-600 mb-1">
                    Delivery Fee (₹) [NULL = Unconfigured]
                  </label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={settings.delivery_fee ?? ''}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        delivery_fee: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                    placeholder="e.g. 20 (Leave blank if undecided)"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">
                    Free-Delivery Threshold (₹)
                  </label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={settings.free_delivery_threshold ?? ''}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        free_delivery_threshold:
                          e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                    placeholder="e.g. 499"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">
                    Minimum Order Amount (₹)
                  </label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={settings.min_order_amount ?? ''}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        min_order_amount: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                    placeholder="e.g. 100"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">
                    Delivery Radius (km) [Must be &gt; 0 if set]
                  </label>
                  <Input
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={settings.delivery_radius_km ?? ''}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        delivery_radius_km:
                          e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                    placeholder="e.g. 5 (Leave blank if undecided)"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-600 mb-1">
                  Serviceable Delivery PIN Codes (Comma-separated)
                </label>
                <Input
                  value={
                    Array.isArray(settings.serviceable_pincodes)
                      ? settings.serviceable_pincodes.join(', ')
                      : ''
                  }
                  onChange={(e) => {
                    const raw = e.target.value;
                    const pins = raw
                      ? raw
                          .split(',')
                          .map((p) => p.trim())
                          .filter(Boolean)
                      : null;
                    setSettings({
                      ...settings,
                      serviceable_pincodes: pins && pins.length > 0 ? pins : null,
                    });
                  }}
                  placeholder="e.g. 805125, 805126 (Leave blank to disable doorstep delivery until configured)"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  When unconfigured (blank), doorstep delivery is fail-closed while Store Pickup remains available.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Opening Hours</label>
                  <Input
                    value={settings.opening_hours || ''}
                    onChange={(e) =>
                      setSettings({ ...settings, opening_hours: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">
                    Support Phone / WhatsApp
                  </label>
                  <Input
                    value={settings.support_phone || ''}
                    onChange={(e) =>
                      setSettings({ ...settings, support_phone: e.target.value })
                    }
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-600 mb-1">
                  Physical Store Address (Rajauli)
                </label>
                <Input
                  value={settings.store_address || ''}
                  onChange={(e) =>
                    setSettings({ ...settings, store_address: e.target.value })
                  }
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-600 mb-1">
                    FSSAI License / Registration Number
                  </label>
                  <Input
                    value={settings.fssai_license_number || ''}
                    onChange={(e) =>
                      setSettings({ ...settings, fssai_license_number: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">
                    Store Status Notice Banner
                  </label>
                  <Input
                    value={settings.status_notice || ''}
                    onChange={(e) =>
                      setSettings({ ...settings, status_notice: e.target.value })
                    }
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-600 mb-1">
                  Promotional Banner Message (Optional)
                </label>
                <Input
                  value={settings.banner_message || ''}
                  onChange={(e) =>
                    setSettings({ ...settings, banner_message: e.target.value })
                  }
                  placeholder="Optional storefront promo message (Leave blank if none)"
                />
              </div>

              <div className="pt-2">
                <Button type="submit" variant="primary">
                  Save Store Settings
                </Button>
              </div>
            </form>
          </Card>
        )}
      </main>
    </div>
  );
};
