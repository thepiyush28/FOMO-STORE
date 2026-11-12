import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { DeliveryPartner, OrderRecord } from '../types';
import { useAuth } from '../context/AuthContext';
import {
  fetchRiderData,
  getSupabaseEnvDiagnostic,
  riderToggleOnlineViaRpc,
  riderUpdateOrderStatusViaRpc,
  supabase,
} from '../lib/supabase';
import {
  canRiderTransitionOrder,
  formatCurrencyOrPlaceholder,
  isRoleAuthorized,
  ORDER_STATUS_LABELS,
} from '../lib/pricing';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { PhoneOtpModal } from '../components/auth/PhoneOtpModal';
import {
  Bike,
  ArrowLeft,
  Phone,
  MapPin,
  Navigation,
  CheckCircle2,
  PackageCheck,
  Banknote,
  RefreshCw,
  LogOut,
  Lock,
  AlertTriangle,
  Clock,
  History,
  Eye,
  EyeOff,
  Compass,
} from 'lucide-react';
import { buildNavigationUrls } from '../lib/maps';

export const RiderAppPage: React.FC = () => {
  const { userId, profile, isLoadingAuth, isSupabaseReady, refreshProfile, signOut } = useAuth();

  const [isOtpModalOpen, setIsOtpModalOpen] = useState(false);
  const [previewUnconfiguredUi, setPreviewUnconfiguredUi] = useState(false);

  const [partner, setPartner] = useState<DeliveryPartner | null>(null);
  const [assignedOrders, setAssignedOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [togglingOnline, setTogglingOnline] = useState(false);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'active' | 'history'>('active');
  const [showMapOrderId, setShowMapOrderId] = useState<string | null>(null);

  const isRiderAuthorized = isRoleAuthorized(profile?.role, 'rider');

  const loadRiderDashboard = useCallback(async () => {
    if (!isSupabaseReady) {
      setPartner({
        id: 'demo-rider-partner',
        user_id: 'demo-rider-user',
        is_online: true,
        vehicle_details: '[Demo Bike Details]',
      });
      setAssignedOrders([]);
      return;
    }

    if (!userId || !isRiderAuthorized) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetchRiderData(userId);
      setPartner(res.partner);
      setAssignedOrders(res.assignedOrders);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load assigned deliveries.');
    } finally {
      setLoading(false);
    }
  }, [isSupabaseReady, userId, isRiderAuthorized]);

  useEffect(() => {
    if ((isSupabaseReady && isRiderAuthorized) || (!isSupabaseReady && previewUnconfiguredUi)) {
      loadRiderDashboard();
    }
  }, [isSupabaseReady, isRiderAuthorized, previewUnconfiguredUi, loadRiderDashboard]);

  // Realtime subscription on assigned orders
  useEffect(() => {
    const client = supabase;
    if (!client || !partner?.id || !isRiderAuthorized) return;

    const channel = client
      .channel(`rider-orders-${partner.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `delivery_partner_id=eq.${partner.id}`,
        },
        () => {
          loadRiderDashboard();
        }
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [partner?.id, isRiderAuthorized, loadRiderDashboard]);

  const handleToggleOnline = async () => {
    setError(null);
    setNotice(null);
    setTogglingOnline(true);
    try {
      const nextState = !(partner?.is_online ?? false);
      const confirmedState = await riderToggleOnlineViaRpc(nextState);
      if (partner) {
        setPartner({ ...partner, is_online: confirmedState });
      } else {
        await loadRiderDashboard();
      }
      setNotice(`You are now ${confirmedState ? 'ONLINE and ready for deliveries' : 'OFFLINE'}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle online status.');
    } finally {
      setTogglingOnline(false);
    }
  };

  const handleStatusUpdate = async (
    orderId: string,
    targetStatus: 'out_for_delivery' | 'delivered'
  ) => {
    setError(null);
    setNotice(null);
    setUpdatingOrderId(orderId);
    try {
      await riderUpdateOrderStatusViaRpc(
        orderId,
        targetStatus,
        targetStatus === 'out_for_delivery'
          ? 'Order picked up from store by delivery rider'
          : 'Order delivered to customer and COD collected'
      );
      setNotice(
        targetStatus === 'out_for_delivery'
          ? 'Marked as Picked Up (Out for Delivery).'
          : 'Order marked as Delivered!'
      );
      await loadRiderDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update delivery status.');
    } finally {
      setUpdatingOrderId(null);
    }
  };

  if (isLoadingAuth) {
    return (
      <div className="min-h-screen bg-brand-grey-blue flex items-center justify-center p-6">
        <div className="text-sm font-bold text-brand-navy animate-pulse">
          Verifying delivery partner session...
        </div>
      </div>
    );
  }

  // ============================================================================
  // GUARD: RIDER LOGIN & ROLE CHECK
  // ============================================================================
  if (!isRiderAuthorized && !(previewUnconfiguredUi && !isSupabaseReady)) {
    return (
      <div className="min-h-screen bg-brand-grey-blue flex flex-col items-center justify-center p-4 sm:p-6">
        <Card className="w-full max-w-md p-6 sm:p-8 border border-slate-200 shadow-card space-y-5">
          <div className="flex items-center justify-between">
            <div className="w-12 h-12 bg-brand-navy rounded-2xl flex items-center justify-center text-white">
              <Bike className="w-6 h-6 text-brand-orange" />
            </div>
            <Badge variant={isSupabaseReady ? 'navy' : 'placeholder'} size="sm">
              {isSupabaseReady ? 'Rider Role Required' : 'Unconfigured .env'}
            </Badge>
          </div>

          <div>
            <h1 className="text-xl font-black text-brand-navy">FOMO Delivery Partner (/rider)</h1>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              Sign in with your registered rider account (Email & Password or Phone OTP). Riders
              can only view and update orders explicitly assigned to their account.
            </p>
          </div>

          {userId && (!profile || profile.role !== 'rider') && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 text-xs text-rose-900 space-y-2">
              <div className="flex items-center gap-2 font-bold">
                <Lock className="w-4 h-4 text-rose-600" />
                <span>Access Restricted: Current Role is "{profile?.role || 'customer'}"</span>
              </div>
              <p>
                Ask the FOMO Store owner to assign your account (<code>{profile?.phone || userId}</code>) the{' '}
                <code>rider</code> role in the Owner Dashboard (<code>/admin</code>).
              </p>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <Button variant="primary" size="sm" fullWidth onClick={() => refreshProfile()}>
                  Re-check Rider Role
                </Button>
                <Button variant="outline" size="sm" fullWidth onClick={signOut}>
                  Sign Out
                </Button>
              </div>
            </div>
          )}

          <Button
            variant="primary"
            fullWidth
            onClick={() => setIsOtpModalOpen(true)}
            className="gap-2"
          >
            <Phone className="w-4 h-4" />
            <span>Sign In as Delivery Partner</span>
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
                    <code>.env</code> yet. You can preview the Rider App interface below.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    fullWidth
                    onClick={() => setPreviewUnconfiguredUi(true)}
                  >
                    Preview Rider App UI (Demo Mode)
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
          title="Rider Account Login"
        />
      </div>
    );
  }

  const activeDeliveries = assignedOrders.filter(
    (o) => o.status !== 'delivered' && o.status !== 'cancelled'
  );
  const completedDeliveries = assignedOrders.filter((o) => o.status === 'delivered');

  const getNav = (ord: OrderRecord) => {
    return buildNavigationUrls(
      ord.delivery_address?.address_line,
      ord.delivery_address?.landmark,
      ord.delivery_address?.pincode,
      'Rajauli'
    );
  };

  return (
    <div className="min-h-screen bg-brand-grey-blue flex flex-col">
      {/* Rider Header */}
      <header className="bg-brand-navy text-white border-b-4 border-brand-orange sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Link
              to="/"
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white touch-target flex items-center justify-center"
              aria-label="Back to Storefront"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-black tracking-tight">
                  FOMO <span className="text-brand-orange">RIDER</span>
                </span>
                <Badge variant={partner?.is_online ? 'green' : 'neutral'} size="sm">
                  {partner?.is_online ? '● ONLINE' : '○ OFFLINE'}
                </Badge>
              </div>
              <p className="text-[11px] text-slate-300">
                {profile?.full_name || profile?.phone || 'Delivery Partner'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadRiderDashboard}
              className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 touch-target flex items-center justify-center"
              title="Refresh Assigned Deliveries"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            {userId && (
              <button
                onClick={signOut}
                className="p-2.5 rounded-xl bg-rose-600/80 hover:bg-rose-600 touch-target flex items-center justify-center"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-3xl w-full mx-auto px-4 py-5 flex-1 space-y-5">
        {!isSupabaseReady && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 text-xs text-amber-900 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <span>
              <strong>Demo UI Preview:</strong> Connect Supabase in <code>.env</code> and sign in
              with a rider account to receive live assigned orders.
            </span>
          </div>
        )}

        {error && (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3.5 text-xs text-rose-800">
            {error}
          </div>
        )}

        {notice && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 text-xs text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>{notice}</span>
          </div>
        )}

        {/* Online / Offline Duty Toggle Card */}
        <Card className="p-4 border border-slate-200 flex items-center justify-between gap-3">
          <div>
            <span className="text-sm font-black text-brand-navy block">
              Duty Status: {partner?.is_online ? 'Online & Available' : 'Offline'}
            </span>
            <span className="text-xs text-slate-500">
              Toggle your availability via <code>public.rider_toggle_online()</code>
            </span>
          </div>
          <Button
            variant={partner?.is_online ? 'outline' : 'primary'}
            size="sm"
            disabled={togglingOnline}
            onClick={handleToggleOnline}
          >
            {togglingOnline
              ? 'Updating...'
              : partner?.is_online
              ? 'Go Offline'
              : 'Go Online Now'}
          </Button>
        </Card>

        {/* View Switcher: Active Assigned Orders vs Completed History */}
        <div className="grid grid-cols-2 gap-2.5 bg-white p-1.5 rounded-2xl border border-slate-200">
          <button
            onClick={() => setActiveView('active')}
            className={`py-2.5 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 touch-target transition-all ${
              activeView === 'active'
                ? 'bg-brand-navy text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Bike className="w-4 h-4 text-brand-orange" />
            <span>Assigned Orders ({activeDeliveries.length})</span>
          </button>
          <button
            onClick={() => setActiveView('history')}
            className={`py-2.5 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 touch-target transition-all ${
              activeView === 'history'
                ? 'bg-brand-navy text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <History className="w-4 h-4 text-brand-orange" />
            <span>Completed ({completedDeliveries.length})</span>
          </button>
        </div>

        {/* ACTIVE ASSIGNED DELIVERIES */}
        {activeView === 'active' ? (
          activeDeliveries.length === 0 ? (
            <Card className="p-8 text-center space-y-3 border border-slate-200">
              <div className="w-14 h-14 bg-brand-grey-blue rounded-full flex items-center justify-center mx-auto">
                <Bike className="w-7 h-7 text-slate-400" />
              </div>
              <div>
                <h2 className="text-base font-bold text-brand-navy">
                  No active deliveries assigned right now
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Stay online—when the store owner assigns an order to you, it will appear here
                  automatically.
                </p>
              </div>
            </Card>
          ) : (
            <div className="space-y-4">
              {activeDeliveries.map((ord) => {
                const canPickUp = canRiderTransitionOrder(
                  ord.status,
                  'out_for_delivery',
                  ord.delivery_mode
                );
                const canDeliver = canRiderTransitionOrder(
                  ord.status,
                  'delivered',
                  ord.delivery_mode
                );

                return (
                  <Card key={ord.id} className="p-5 border border-slate-200 space-y-4">
                    {/* Top Row: Order Number & Status */}
                    <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-100">
                      <div>
                        <span className="font-mono text-sm font-black text-brand-navy block">
                          {ord.order_number}
                        </span>
                        <span className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3" />
                          {new Date(ord.created_at).toLocaleTimeString()}
                        </span>
                      </div>
                      <Badge variant="orange" size="md">
                        {ORDER_STATUS_LABELS[ord.status]}
                      </Badge>
                    </div>

                    {/* Customer Contact & Delivery Address */}
                    <div className="bg-brand-grey-blue p-3.5 rounded-xl border border-slate-200 space-y-2 text-xs">
                      <div className="font-bold text-brand-navy text-sm">
                        Customer: {ord.customer_name || 'Customer'}
                      </div>
                      <div className="flex items-start gap-1.5 text-slate-700">
                        <MapPin className="w-4 h-4 text-brand-orange flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold">
                            {ord.delivery_address?.address_line || 'Address not provided'}
                          </p>
                          {ord.delivery_address?.landmark && (
                            <p className="text-slate-500">
                              Landmark: {ord.delivery_address.landmark}
                            </p>
                          )}
                          {ord.delivery_address?.pincode && (
                            <p className="text-slate-500 font-mono">
                              Pincode: {ord.delivery_address.pincode}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Actions: Call, OpenStreetMap Route, Google Maps */}
                      {(() => {
                        const nav = getNav(ord);
                        const isMapOpen = showMapOrderId === ord.id;
                        return (
                          <div className="space-y-2 pt-2">
                            <div className="grid grid-cols-2 gap-2">
                              {ord.customer_phone ? (
                                <a
                                  href={`tel:${ord.customer_phone}`}
                                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-brand-navy text-white font-bold text-xs hover:bg-brand-navy-light touch-target"
                                >
                                  <Phone className="w-4 h-4 text-brand-orange" />
                                  <span>Call Customer</span>
                                </a>
                              ) : (
                                <span className="px-3 py-2.5 rounded-xl bg-slate-200 text-slate-500 font-semibold text-center text-xs flex items-center justify-center">
                                  No Phone Listed
                                </span>
                              )}

                              <button
                                type="button"
                                onClick={() => setShowMapOrderId(isMapOpen ? null : ord.id)}
                                className={`inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl font-bold text-xs touch-target border transition-all ${
                                  isMapOpen
                                    ? 'bg-brand-navy text-white border-brand-navy'
                                    : 'bg-white text-brand-navy border-slate-300 hover:bg-slate-50'
                                }`}
                              >
                                {isMapOpen ? (
                                  <>
                                    <EyeOff className="w-4 h-4 text-brand-orange" />
                                    <span>Hide Map</span>
                                  </>
                                ) : (
                                  <>
                                    <Eye className="w-4 h-4 text-brand-orange" />
                                    <span>View Map Preview</span>
                                  </>
                                )}
                              </button>
                            </div>

                            {/* Dual Navigation: OpenStreetMap (Primary) + Google Maps (Fallback) */}
                            <div className="grid grid-cols-2 gap-2">
                              <a
                                href={nav.osmDirectionsUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-brand-orange text-brand-navy font-black text-xs hover:bg-brand-orange/90 shadow-xs touch-target"
                              >
                                <Compass className="w-4 h-4" />
                                <span>OSM Directions</span>
                              </a>

                              <a
                                href={nav.googleMapsDirectionsUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-white border border-brand-navy text-brand-navy font-bold text-xs hover:bg-slate-50 touch-target"
                              >
                                <Navigation className="w-4 h-4 text-brand-orange" />
                                <span>Google Maps</span>
                              </a>
                            </div>

                            {/* Embedded OpenStreetMap Preview Widget */}
                            {isMapOpen && (
                              <div className="mt-2 rounded-xl overflow-hidden border border-slate-300 bg-slate-100 shadow-xs animate-fadeIn">
                                <div className="bg-brand-navy text-white px-3 py-1.5 text-[11px] font-bold flex items-center justify-between">
                                  <span className="flex items-center gap-1.5">
                                    <MapPin className="w-3.5 h-3.5 text-brand-orange" />
                                    <span>OpenStreetMap Location Preview</span>
                                  </span>
                                  <span className="text-[10px] text-emerald-400 font-mono">
                                    Open Share Map API
                                  </span>
                                </div>
                                <div className="relative w-full h-48 bg-slate-200">
                                  <iframe
                                    title={`Map-${ord.order_number}`}
                                    width="100%"
                                    height="100%"
                                    frameBorder="0"
                                    scrolling="no"
                                    src={nav.embedUrl}
                                    className="w-full h-full border-0"
                                  />
                                </div>
                                <div className="p-2 bg-white flex justify-between items-center text-[11px] text-slate-600 border-t border-slate-200">
                                  <span className="truncate pr-2">{nav.displayText}</span>
                                  <a
                                    href={nav.osmSearchUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-brand-orange font-bold hover:underline shrink-0"
                                  >
                                    Full OSM View ↗
                                  </a>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    {/* COD Collection Banner */}
                    <div className="bg-brand-orange-tint/60 border-2 border-brand-orange/40 rounded-xl p-3.5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Banknote className="w-5 h-5 text-brand-orange" />
                        <div>
                          <span className="text-xs font-extrabold text-brand-navy block">
                            Cash on Delivery (COD) to Collect
                          </span>
                          <span className="text-[11px] text-slate-600">
                            Collect exact amount upon doorstep handover
                          </span>
                        </div>
                      </div>
                      <span className="text-lg font-black text-brand-navy font-mono">
                        {formatCurrencyOrPlaceholder(ord.total_amount)}
                      </span>
                    </div>

                    {/* Order Item List */}
                    <div className="space-y-1 text-xs">
                      <span className="font-bold text-slate-500 uppercase tracking-wider text-[11px]">
                        Items in Package ({ord.items.length})
                      </span>
                      <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80 divide-y divide-slate-100">
                        {ord.items.map((item) => (
                          <div key={item.id} className="py-1.5 flex justify-between">
                            <span className="font-semibold text-brand-navy">
                              {item.quantity} × {item.product_name}{' '}
                              {item.unit ? `(${item.unit})` : ''}
                            </span>
                            <span className="font-mono text-slate-600">
                              {formatCurrencyOrPlaceholder(item.total_price)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Authorized Rider Action Buttons */}
                    <div className="pt-2">
                      {canPickUp ? (
                        <Button
                          variant="primary"
                          fullWidth
                          disabled={updatingOrderId === ord.id}
                          onClick={() => handleStatusUpdate(ord.id, 'out_for_delivery')}
                          className="gap-2"
                        >
                          <PackageCheck className="w-5 h-5" />
                          <span>
                            {updatingOrderId === ord.id
                              ? 'Updating...'
                              : 'Mark as Picked Up (Out for Delivery)'}
                          </span>
                        </Button>
                      ) : canDeliver ? (
                        <Button
                          variant="primary"
                          fullWidth
                          disabled={updatingOrderId === ord.id}
                          onClick={() => handleStatusUpdate(ord.id, 'delivered')}
                          className="gap-2"
                        >
                          <CheckCircle2 className="w-5 h-5" />
                          <span>
                            {updatingOrderId === ord.id
                              ? 'Completing Delivery...'
                              : `Mark as Delivered (Collected ${formatCurrencyOrPlaceholder(ord.total_amount)})`}
                          </span>
                        </Button>
                      ) : (
                        <div className="p-3 rounded-xl bg-slate-100 text-xs text-slate-600 text-center font-medium">
                          Waiting for store staff to mark order as <strong>Ready</strong> before
                          pickup. (Current status: <strong>{ORDER_STATUS_LABELS[ord.status]}</strong>)
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )
        ) : (
          /* COMPLETED DELIVERIES HISTORY */
          <div className="space-y-3">
            {completedDeliveries.length > 0 && (
              <Card className="p-4 border border-emerald-200 bg-emerald-50/60 flex items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-extrabold text-brand-navy uppercase tracking-wider block">
                    Total COD Collected ({completedDeliveries.length} Deliveries)
                  </span>
                  <span className="text-[11px] text-slate-600">
                    Hand over collected cash to the FOMO Store counter at shift end
                  </span>
                </div>
                <span className="font-mono text-lg font-black text-emerald-700">
                  {formatCurrencyOrPlaceholder(
                    completedDeliveries.reduce((sum, o) => sum + Number(o.total_amount || 0), 0)
                  )}
                </span>
              </Card>
            )}

            {completedDeliveries.length === 0 ? (
              <Card className="p-8 text-center text-xs text-slate-500 border border-slate-200">
                No completed deliveries in your history yet.
              </Card>
            ) : (
              completedDeliveries.map((ord) => (
                <Card
                  key={ord.id}
                  className="p-4 border border-slate-200 flex items-center justify-between gap-3"
                >
                  <div className="text-xs space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-brand-navy">
                        {ord.order_number}
                      </span>
                      <Badge variant="green" size="sm">
                        Delivered
                      </Badge>
                    </div>
                    <p className="text-slate-600">
                      Customer: {ord.customer_name} • {ord.delivery_address?.address_line}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Delivered on {new Date(ord.updated_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] text-slate-400 block">COD Collected</span>
                    <span className="font-mono text-sm font-black text-emerald-700">
                      {formatCurrencyOrPlaceholder(ord.total_amount)}
                    </span>
                  </div>
                </Card>
              ))
            )}
          </div>
        )}
      </main>
    </div>
  );
};
