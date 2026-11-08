import React, { useEffect, useState, useCallback } from 'react';
import { DemoProduct, OrderRecord, OrderStatus } from '../../types';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import {
  Receipt,
  RefreshCw,
  Phone,
  RotateCcw,
  XCircle,
  CheckCircle2,
  Clock,
  Truck,
  Store,
  AlertCircle,
  Bike,
  ArrowLeft,
} from 'lucide-react';
import {
  canCustomerCancelOrder,
  formatCurrencyOrPlaceholder,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_SEQUENCE,
} from '../../lib/pricing';
import {
  cancelCustomerOrderViaRpc,
  fetchCustomerOrders,
  supabase,
} from '../../lib/supabase';

interface CustomerOrdersSectionProps {
  userId: string | null;
  products: DemoProduct[];
  onRequireLogin: () => void;
  onReorderItems: (items: Array<{ productId: string; quantity: number }>) => void;
  onBackToShop: () => void;
}

export const CustomerOrdersSection: React.FC<CustomerOrdersSectionProps> = ({
  userId,
  products,
  onRequireLogin,
  onReorderItems,
  onBackToShop,
}) => {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [cancelReasonInput, setCancelReasonInput] = useState('');
  const [confirmCancelOrderId, setConfirmCancelOrderId] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    if (!userId) {
      setOrders([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await fetchCustomerOrders(userId);
      setOrders(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load orders.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // Real-time subscription for live order status updates
  useEffect(() => {
    const client = supabase;
    if (!client || !userId) return;

    const channel = client
      .channel(`customer-orders-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `customer_id=eq.${userId}`,
        },
        () => {
          loadOrders();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'order_status_history',
        },
        () => {
          loadOrders();
        }
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [userId, loadOrders]);

  const handleConfirmCancel = async (orderId: string) => {
    setCancellingOrderId(orderId);
    setError(null);
    try {
      await cancelCustomerOrderViaRpc(
        orderId,
        cancelReasonInput.trim() || 'Cancelled by customer before packing'
      );
      setConfirmCancelOrderId(null);
      setCancelReasonInput('');
      await loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to cancel order.');
    } finally {
      setCancellingOrderId(null);
    }
  };

  const handleReorder = (order: OrderRecord) => {
    const validItems = order.items
      .filter((i) => i.product_id && products.some((p) => p.id === i.product_id && p.inStock))
      .map((i) => ({
        productId: i.product_id!,
        quantity: i.quantity,
      }));

    if (validItems.length === 0) {
      setError('Items from this order are currently unavailable or out of stock.');
      return;
    }

    onReorderItems(validItems);
  };

  const getStatusBadgeVariant = (
    status: OrderStatus
  ): 'navy' | 'orange' | 'green' | 'red' | 'neutral' => {
    if (status === 'delivered') return 'green';
    if (status === 'cancelled') return 'red';
    if (status === 'out_for_delivery' || status === 'ready') return 'orange';
    return 'navy';
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToShop}
            className="p-2 rounded-xl border border-slate-200 hover:bg-brand-grey-blue text-brand-navy touch-target flex items-center justify-center"
            aria-label="Back to Storefront"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-brand-navy">My Orders</h1>
            <p className="text-xs text-slate-500">
              Live order tracking, status timeline, rider contact & reorder
            </p>
          </div>
        </div>

        {userId && (
          <Button variant="outline" size="sm" onClick={loadOrders} className="gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        )}
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 text-xs text-rose-800 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {!userId ? (
        <Card className="p-8 text-center space-y-4">
          <div className="w-16 h-16 bg-brand-grey-blue rounded-full flex items-center justify-center mx-auto text-brand-navy">
            <Receipt className="w-8 h-8 text-brand-orange" />
          </div>
          <div className="max-w-sm mx-auto space-y-1">
            <h2 className="text-base font-bold text-brand-navy">Sign in to view your orders</h2>
            <p className="text-xs text-slate-500">
              Track your live grocery orders, see your assigned delivery rider, or reorder past
              essentials with one tap.
            </p>
          </div>
          <div className="flex justify-center gap-3 pt-2">
            <Button variant="primary" onClick={onRequireLogin} className="gap-2">
              <Phone className="w-4 h-4" />
              <span>Sign In with Phone OTP</span>
            </Button>
            <Button variant="outline" onClick={onBackToShop}>
              Browse Catalog
            </Button>
          </div>
        </Card>
      ) : loading && orders.length === 0 ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-44 rounded-2xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <Card className="p-8 text-center space-y-4">
          <div className="w-16 h-16 bg-brand-grey-blue rounded-full flex items-center justify-center mx-auto text-slate-400">
            <Receipt className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-base font-bold text-brand-navy">No orders placed yet</h2>
            <p className="text-xs text-slate-500 mt-1">
              When you place an order, its live status timeline and items will appear here.
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={onBackToShop}>
            Start Shopping
          </Button>
        </Card>
      ) : (
        <div className="space-y-5">
          {orders.map((order) => {
            const canCancel = canCustomerCancelOrder(order.status);
            const currentStepIdx = ORDER_STATUS_SEQUENCE.indexOf(order.status);

            return (
              <Card key={order.id} className="p-4 sm:p-5 border border-slate-200 space-y-4">
                {/* Order Header */}
                <div className="flex flex-wrap items-start justify-between gap-2 pb-3 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-extrabold text-brand-navy">
                        {order.order_number}
                      </span>
                      <Badge variant={getStatusBadgeVariant(order.status)} size="sm">
                        {ORDER_STATUS_LABELS[order.status]}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{new Date(order.created_at).toLocaleString()}</span>
                      <span>•</span>
                      <span className="inline-flex items-center gap-1 font-semibold text-brand-navy uppercase">
                        {order.delivery_mode === 'delivery' ? (
                          <>
                            <Truck className="w-3.5 h-3.5 text-brand-orange" /> Doorstep Delivery
                          </>
                        ) : (
                          <>
                            <Store className="w-3.5 h-3.5 text-brand-navy" /> Store Pickup
                          </>
                        )}
                      </span>
                    </p>
                  </div>

                  <div className="text-right">
                    <span className="text-xs text-slate-400 block">Total (COD)</span>
                    <span className="text-base font-extrabold text-brand-orange font-mono">
                      {formatCurrencyOrPlaceholder(order.total_amount)}
                    </span>
                  </div>
                </div>

                {/* Live Tracking Progress Bar (for non-cancelled orders) */}
                {order.status !== 'cancelled' ? (
                  <div className="bg-brand-grey-blue/70 p-3.5 rounded-xl border border-slate-200/80">
                    <div className="text-[11px] font-bold text-brand-navy uppercase tracking-wider mb-2.5">
                      Live Order Tracking Timeline
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                      {ORDER_STATUS_SEQUENCE.map((st, idx) => {
                        const isCompleted = currentStepIdx >= idx;
                        const isCurrent = order.status === st;
                        return (
                          <div
                            key={st}
                            className={`p-2 rounded-lg border text-[11px] flex items-center gap-1.5 ${
                              isCurrent
                                ? 'border-brand-orange bg-brand-orange-tint font-bold text-brand-navy'
                                : isCompleted
                                ? 'border-emerald-200 bg-emerald-50/70 text-emerald-900 font-semibold'
                                : 'border-slate-200 bg-white text-slate-400'
                            }`}
                          >
                            <CheckCircle2
                              className={`w-3.5 h-3.5 flex-shrink-0 ${
                                isCurrent
                                  ? 'text-brand-orange'
                                  : isCompleted
                                  ? 'text-emerald-600'
                                  : 'text-slate-300'
                              }`}
                            />
                            <span className="truncate">{ORDER_STATUS_LABELS[st]}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-900">
                    <strong>Order Cancelled:</strong>{' '}
                    {order.cancel_reason || 'Cancelled before fulfillment'}
                  </div>
                )}

                {/* Assigned Rider Info & Call Button */}
                {order.rider_info && (
                  <div className="bg-brand-orange-tint/40 border border-brand-orange/30 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-brand-navy text-white flex items-center justify-center">
                        <Bike className="w-5 h-5 text-brand-orange" />
                      </div>
                      <div className="text-xs">
                        <span className="font-bold text-brand-navy block">
                          Assigned Rider: {order.rider_info.rider_name}
                        </span>
                        {order.rider_info.vehicle_details && (
                          <span className="text-slate-600 text-[11px]">
                            Vehicle: {order.rider_info.vehicle_details}
                          </span>
                        )}
                      </div>
                    </div>

                    {order.rider_info.rider_phone && (
                      <a
                        href={`tel:${order.rider_info.rider_phone}`}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-brand-navy text-white text-xs font-bold hover:bg-brand-navy-light touch-target"
                      >
                        <Phone className="w-3.5 h-3.5 text-brand-orange" />
                        <span>Call Rider ({order.rider_info.rider_phone})</span>
                      </a>
                    )}
                  </div>
                )}

                {/* Order Items */}
                <div className="space-y-1.5">
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Ordered Items ({order.items.length})
                  </div>
                  <div className="divide-y divide-slate-100 bg-slate-50 rounded-xl border border-slate-200/80 px-3 py-1">
                    {order.items.map((item) => (
                      <div
                        key={item.id}
                        className="py-2 flex items-center justify-between text-xs gap-2"
                      >
                        <div>
                          <span className="font-bold text-brand-navy">{item.product_name}</span>
                          <span className="text-slate-500 ml-1.5">
                            ({item.quantity} × {formatCurrencyOrPlaceholder(item.unit_price)}
                            {item.unit ? ` / ${item.unit}` : ''})
                          </span>
                        </div>
                        <span className="font-mono font-bold text-brand-navy">
                          {formatCurrencyOrPlaceholder(item.total_price)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Status History Log */}
                {order.history && order.history.length > 0 && (
                  <details className="text-xs text-slate-600 bg-slate-50/70 rounded-xl p-3 border border-slate-200/70">
                    <summary className="font-bold text-brand-navy cursor-pointer">
                      Status History ({order.history.length} updates)
                    </summary>
                    <ul className="mt-2 space-y-1.5 pl-2 border-l-2 border-brand-orange/40">
                      {order.history.map((h) => (
                        <li key={h.id} className="text-[11px] flex flex-wrap justify-between gap-2">
                          <span>
                            <strong className="uppercase text-brand-navy">{h.status}:</strong>{' '}
                            {h.note || 'Updated'}
                          </span>
                          <span className="text-slate-400 font-mono">
                            {new Date(h.created_at).toLocaleString()}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}

                {/* Actions: Reorder & Cancel Before Packing */}
                <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleReorder(order)}
                    className="gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reorder Items</span>
                  </Button>

                  {canCancel ? (
                    confirmCancelOrderId === order.id ? (
                      <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                        <input
                          type="text"
                          value={cancelReasonInput}
                          onChange={(e) => setCancelReasonInput(e.target.value)}
                          placeholder="Reason for cancellation (optional)"
                          className="px-3 py-2 text-xs border border-slate-300 rounded-xl min-h-[44px]"
                        />
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={cancellingOrderId === order.id}
                          onClick={() => handleConfirmCancel(order.id)}
                        >
                          {cancellingOrderId === order.id ? 'Cancelling...' : 'Confirm Cancel'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmCancelOrderId(null)}
                        >
                          Keep Order
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmCancelOrderId(order.id)}
                        className="text-rose-600 hover:bg-rose-50 gap-1.5"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Cancel Order (Before Packing)</span>
                      </Button>
                    )
                  ) : (
                    order.status !== 'cancelled' && (
                      <span className="text-[11px] text-slate-400 font-mono">
                        Cancellation locked once packing starts
                      </span>
                    )
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
