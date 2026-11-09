import React, { useEffect, useReducer, useRef, useState } from 'react';
import {
  CustomerAddress,
  DeliveryMode,
  DemoProduct,
  StoreConfig,
} from '../../types';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Badge } from '../ui/Badge';
import {
  ShoppingBag,
  Plus,
  Minus,
  Trash2,
  AlertCircle,
  ShieldAlert,
  MapPin,
  Truck,
  Store,
  CheckCircle2,
  Phone,
  Edit2,
  Banknote,
  CreditCard,
} from 'lucide-react';
import {
  calculateCartTotals,
  formatCurrencyOrPlaceholder,
  validateDeliveryAddress,
} from '../../lib/pricing';
import {
  deleteCustomerAddress,
  fetchCustomerAddresses,
  newIdempotencyKey,
  placeOrderViaRpc,
  PlaceOrderRpcResult,
  saveCustomerAddress,
} from '../../lib/supabase';
import {
  canSubmitOrder,
  checkoutReducer,
  initialCheckoutState,
  isPaymentMethodAvailable,
} from '../../lib/checkoutFlow';

interface CartPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: DemoProduct[];
  cartQuantities: Record<string, number>;
  onIncrement: (id: string) => void;
  onDecrement: (id: string) => void;
  onClearCart: () => void;
  storeConfig: StoreConfig;
  deliveryMode?: DeliveryMode;
  onSelectDeliveryMode?: (mode: DeliveryMode) => void;
  userId?: string | null;
  onRequireLogin?: () => void;
  onOrderPlaced?: (result: PlaceOrderRpcResult) => void;
  onViewOrders?: () => void;
}

export const CartPreviewModal: React.FC<CartPreviewModalProps> = ({
  isOpen,
  onClose,
  products,
  cartQuantities,
  onIncrement,
  onDecrement,
  onClearCart,
  storeConfig,
  deliveryMode = 'delivery',
  onSelectDeliveryMode,
  userId = null,
  onRequireLogin,
  onOrderPlaced,
  onViewOrders,
}) => {
  const [flow, dispatch] = useReducer(checkoutReducer, initialCheckoutState);
  const step = flow.step;
  const paymentMethod = flow.paymentMethod;
  // Synchronous single-flight lock: React state updates are async, so a fast double-click
  // could otherwise fire two submissions before `flow.submitting` becomes true.
  const submitLock = useRef(false);
  // One idempotency key per checkout attempt; reused on retry so the backend can de-duplicate.
  const idempotencyKeyRef = useRef<string | null>(null);
  const [pendingCheckout, setPendingCheckout] = useState(false);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [loadingAddresses, setLoadingAddresses] = useState(false);

  // Address Form State
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<string | undefined>(undefined);
  const [addressLine, setAddressLine] = useState('');
  const [landmark, setLandmark] = useState('');
  const [pincode, setPincode] = useState('');
  const [isDefaultAddr, setIsDefaultAddr] = useState(true);
  const [savingAddress, setSavingAddress] = useState(false);

  // Order Placement State
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [confirmedOrder, setConfirmedOrder] = useState<PlaceOrderRpcResult | null>(null);
  const [confirmedSnapshot, setConfirmedSnapshot] = useState<{
    items: Array<{ name: string; qty: number; lineTotal: number | null }>;
    fulfillment: string;
  } | null>(null);

  const cartItems = products.filter((p) => (cartQuantities[p.id] || 0) > 0);
  const totalItemsCount = Object.values(cartQuantities).reduce((acc, qty) => acc + qty, 0);

  const calc = calculateCartTotals(products, cartQuantities, deliveryMode, storeConfig);

  useEffect(() => {
    if (!isOpen) {
      dispatch({ type: 'RESET' });
      submitLock.current = false;
      idempotencyKeyRef.current = null;
      setPendingCheckout(false);
      setCheckoutError(null);
      setShowAddressForm(false);
    }
  }, [isOpen]);

  // Auto-advance to checkout step if customer just logged in following a checkout click
  useEffect(() => {
    if (userId && pendingCheckout) {
      setPendingCheckout(false);
      dispatch({ type: 'GO_DETAILS' });
    }
  }, [userId, pendingCheckout]);

  useEffect(() => {
    if (isOpen && userId) {
      setLoadingAddresses(true);
      fetchCustomerAddresses(userId)
        .then((list) => {
          setAddresses(list);
          if (list.length > 0 && !selectedAddressId) {
            const def = list.find((a) => a.is_default) || list[0];
            setSelectedAddressId(def.id);
          }
        })
        .catch(() => {})
        .finally(() => setLoadingAddresses(false));
    }
  }, [isOpen, userId, selectedAddressId]);

  const selectedAddress = addresses.find((a) => a.id === selectedAddressId) || null;
  const addrValidation = validateDeliveryAddress(selectedAddress, deliveryMode, storeConfig);

  const handleOpenAddAddress = () => {
    setEditingAddressId(undefined);
    setAddressLine('');
    setLandmark('');
    setPincode('');
    setIsDefaultAddr(addresses.length === 0);
    setShowAddressForm(true);
    setCheckoutError(null);
  };

  const handleOpenEditAddress = (addr: CustomerAddress) => {
    setEditingAddressId(addr.id);
    setAddressLine(addr.address_line);
    setLandmark(addr.landmark || '');
    setPincode(addr.pincode);
    setIsDefaultAddr(addr.is_default);
    setShowAddressForm(true);
    setCheckoutError(null);
  };

  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    setCheckoutError(null);
    setSavingAddress(true);
    try {
      const saved = await saveCustomerAddress(userId, {
        id: editingAddressId,
        address_line: addressLine,
        landmark,
        pincode,
        is_default: isDefaultAddr,
      });
      const updated = await fetchCustomerAddresses(userId);
      setAddresses(updated);
      setSelectedAddressId(saved.id);
      setShowAddressForm(false);
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'Failed to save address.');
    } finally {
      setSavingAddress(false);
    }
  };

  const handleDeleteAddress = async (addrId: string) => {
    if (!userId) return;
    try {
      await deleteCustomerAddress(userId, addrId);
      const updated = await fetchCustomerAddresses(userId);
      setAddresses(updated);
      if (selectedAddressId === addrId) {
        setSelectedAddressId(updated[0]?.id || null);
      }
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'Failed to delete address.');
    }
  };

  const handleProceedToCheckout = () => {
    setCheckoutError(null);
    if (!userId) {
      setPendingCheckout(true);
      if (onRequireLogin) {
        onRequireLogin();
      }
      return;
    }
    // Navigation only: this never creates an order.
    dispatch({ type: 'GO_DETAILS' });
  };

  const handleContinueToPayment = () => {
    setCheckoutError(null);
    if (!calc.canCheckout) {
      setCheckoutError(calc.checkoutBlockReason || 'Cannot continue to payment right now.');
      return;
    }
    if (deliveryMode === 'delivery' && !addrValidation.valid) {
      setCheckoutError(addrValidation.error || 'Please select a valid delivery address.');
      return;
    }
    dispatch({ type: 'GO_PAYMENT' });
  };

  const handleReviewOrder = () => {
    setCheckoutError(null);
    if (paymentMethod === null) {
      setCheckoutError('Please select a payment method to continue.');
      return;
    }
    dispatch({ type: 'GO_REVIEW' });
  };

  /** FINAL confirmation. This is the only code path that creates an order. */
  const handleConfirmOrder = async () => {
    setCheckoutError(null);
    if (!userId) {
      if (onRequireLogin) onRequireLogin();
      return;
    }
    if (submitLock.current || !canSubmitOrder(flow)) {
      return;
    }
    if (!calc.canCheckout) {
      setCheckoutError(calc.checkoutBlockReason || 'Cannot place order right now.');
      return;
    }
    if (deliveryMode === 'delivery' && !addrValidation.valid) {
      setCheckoutError(addrValidation.error || 'Please select a valid delivery address.');
      return;
    }
    if (paymentMethod !== 'cod') {
      setCheckoutError('Online payment is not available yet. Please choose Cash on Delivery.');
      return;
    }

    submitLock.current = true;
    dispatch({ type: 'SUBMIT_START' });
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = newIdempotencyKey();
    }
    try {
      const payloadItems = cartItems.map((item) => ({
        product_id: item.id,
        quantity: cartQuantities[item.id],
      }));

      // Prices/totals are NOT sent: the database recalculates everything from trusted data.
      const result = await placeOrderViaRpc({
        items: payloadItems,
        deliveryMode,
        addressId: deliveryMode === 'delivery' ? selectedAddressId : null,
        paymentMethod: 'cod',
        idempotencyKey: idempotencyKeyRef.current,
      });

      setConfirmedOrder(result);
      setConfirmedSnapshot({
        items: cartItems.map((item) => ({
          name: item.name,
          qty: cartQuantities[item.id],
          lineTotal:
            item.price !== null && item.price !== undefined
              ? item.price * cartQuantities[item.id]
              : null,
        })),
        fulfillment:
          deliveryMode === 'pickup'
            ? `Store pickup — ${storeConfig.addressPlaceholder}`
            : selectedAddress
            ? `${selectedAddress.address_line}${
                selectedAddress.landmark ? `, near ${selectedAddress.landmark}` : ''
              } — PIN ${selectedAddress.pincode}`
            : 'Home delivery',
      });
      onClearCart();
      dispatch({ type: 'SUBMIT_SUCCESS', orderNumber: result.order_number });
      idempotencyKeyRef.current = null;
      if (onOrderPlaced) {
        onOrderPlaced(result);
      }
    } catch (err) {
      dispatch({ type: 'SUBMIT_FAIL' });
      setCheckoutError(err instanceof Error ? err.message : 'Order placement failed.');
    } finally {
      submitLock.current = false;
    }
  };

  const placingOrder = flow.submitting;
  const checkoutTitle: Record<string, string> = {
    details: 'Step 1 of 3 — Delivery Details',
    payment: 'Step 2 of 3 — Select Payment Method',
    review: 'Step 3 of 3 — Review & Confirm Order',
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        step === 'confirmed'
          ? 'Order Confirmed!'
          : step === 'details' || step === 'payment' || step === 'review'
          ? checkoutTitle[step]
          : storeConfig.isLiveData
          ? 'Your Shopping Cart'
          : 'Demo Cart & Breakdown'
      }
    >
      <div className="space-y-4 text-sm">
        {/* STEP 3: ORDER CONFIRMATION SCREEN */}
        {step === 'confirmed' && confirmedOrder ? (
          <div className="text-center py-4 space-y-4">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            <div>
              <Badge variant="green" size="md">
                Order #{confirmedOrder.order_number}
              </Badge>
              <h4 className="text-lg font-extrabold text-brand-navy mt-2">
                Thank you for ordering from FOMO Store!
              </h4>
              <p className="text-xs text-slate-600 mt-1">
                Your order has been received and stock has been reserved. You can track live status
                updates in the <strong>My Orders</strong> tab.
              </p>
            </div>

            <div className="bg-brand-grey-blue rounded-xl p-4 text-left text-xs space-y-2 border border-slate-200">
              <div className="flex justify-between">
                <span className="text-slate-500">Order Number:</span>
                <span className="font-mono font-bold text-brand-navy">
                  {confirmedOrder.order_number}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Placed On:</span>
                <span className="font-semibold text-brand-navy">
                  {new Date(confirmedOrder.created_at || Date.now()).toLocaleString('en-IN', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </span>
              </div>
              {confirmedSnapshot && (
                <div className="pt-1 border-t border-slate-200 space-y-1">
                  {confirmedSnapshot.items.map((it, idx) => (
                    <div key={idx} className="flex justify-between text-slate-700">
                      <span className="truncate pr-2">
                        {it.name} × {it.qty}
                      </span>
                      <span className="font-mono">
                        {it.lineTotal !== null ? formatCurrencyOrPlaceholder(it.lineTotal) : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex justify-between pt-1 border-t border-slate-200">
                <span className="text-slate-500">Item Subtotal:</span>
                <span className="font-mono">{formatCurrencyOrPlaceholder(confirmedOrder.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Delivery Fee:</span>
                <span className="font-mono">
                  {formatCurrencyOrPlaceholder(confirmedOrder.delivery_fee)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Fulfillment:</span>
                <span className="font-bold uppercase text-brand-navy">{deliveryMode}</span>
              </div>
              {confirmedSnapshot && (
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500 flex-shrink-0">
                    {deliveryMode === 'pickup' ? 'Pickup:' : 'Address:'}
                  </span>
                  <span className="text-right text-slate-700">{confirmedSnapshot.fulfillment}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">Payment Method:</span>
                <span className="font-bold text-brand-navy">Cash on Delivery (COD)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Payment Status:</span>
                <span className="font-bold text-amber-700">
                  {confirmedOrder.payment_status === 'paid' ? 'Paid' : 'Unpaid — pay on delivery'}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-200 text-sm font-extrabold text-brand-navy">
                <span>Total Payable:</span>
                <span className="text-brand-orange font-mono">
                  {formatCurrencyOrPlaceholder(confirmedOrder.total_amount)}
                </span>
              </div>
            </div>

            <Button
              variant="primary"
              fullWidth
              onClick={() => {
                onClose();
                if (onViewOrders) {
                  onViewOrders();
                }
              }}
            >
              Done & Track Order
            </Button>
          </div>
        ) : step === 'details' || step === 'payment' || step === 'review' ? (
          /* STEPS 2-4: DELIVERY DETAILS → PAYMENT METHOD → REVIEW & CONFIRM */
          <div className="space-y-4">
            {checkoutError && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-800 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                <span>{checkoutError}</span>
              </div>
            )}

            {/* Fulfillment Mode Toggle */}
            {step === 'details' && onSelectDeliveryMode && (
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => onSelectDeliveryMode('delivery')}
                  className={`p-3 rounded-xl border text-left transition-all touch-target flex items-center gap-2 ${
                    deliveryMode === 'delivery'
                      ? 'border-brand-orange bg-brand-orange-tint/40 font-bold text-brand-navy'
                      : 'border-slate-200 text-slate-600'
                  }`}
                >
                  <Truck className="w-4 h-4 text-brand-orange flex-shrink-0" />
                  <span className="text-xs">Doorstep Delivery</span>
                </button>
                <button
                  type="button"
                  onClick={() => onSelectDeliveryMode('pickup')}
                  className={`p-3 rounded-xl border text-left transition-all touch-target flex items-center gap-2 ${
                    deliveryMode === 'pickup'
                      ? 'border-brand-navy bg-brand-grey-blue font-bold text-brand-navy'
                      : 'border-slate-200 text-slate-600'
                  }`}
                >
                  <Store className="w-4 h-4 text-brand-navy flex-shrink-0" />
                  <span className="text-xs">Store Pickup</span>
                </button>
              </div>
            )}

            {/* Delivery Address or Pickup Info (editable only on the details step) */}
            {step === 'details' && (deliveryMode === 'pickup' ? (
              <div className="bg-brand-grey-blue p-3.5 rounded-xl border border-slate-200 text-xs space-y-1">
                <p className="font-bold text-brand-navy flex items-center gap-1.5">
                  <Store className="w-4 h-4 text-brand-orange" />
                  <span>Store Self-Pickup Address</span>
                </p>
                <p className="text-slate-600 font-mono">{storeConfig.addressPlaceholder}</p>
                <p className="text-emerald-700 font-semibold">No delivery fee on store pickup.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-brand-navy uppercase tracking-wider">
                    Delivery Address (Rajauli)
                  </span>
                  {!showAddressForm && (
                    <button
                      type="button"
                      onClick={handleOpenAddAddress}
                      className="text-xs font-bold text-brand-orange hover:underline"
                    >
                      + Add New Address
                    </button>
                  )}
                </div>

                <div className="text-[11px] text-slate-500 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 font-mono">
                  {addrValidation.radiusNotice}
                </div>

                {showAddressForm ? (
                  <form
                    onSubmit={handleSaveAddress}
                    className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-3"
                  >
                    <h5 className="text-xs font-bold text-brand-navy">
                      {editingAddressId ? 'Edit Address' : 'New Delivery Address'}
                    </h5>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        House / Street / Village *
                      </label>
                      <Input
                        required
                        value={addressLine}
                        onChange={(e) => setAddressLine(e.target.value)}
                        placeholder="e.g. Ward 7, Near Main Market, Rajauli"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">
                          Landmark
                        </label>
                        <Input
                          value={landmark}
                          onChange={(e) => setLandmark(e.target.value)}
                          placeholder="e.g. Near SBI Bank"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">
                          Pincode (6 digits) *
                        </label>
                        <Input
                          required
                          maxLength={6}
                          value={pincode}
                          onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))}
                          placeholder="805125"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button type="submit" size="sm" variant="primary" disabled={savingAddress}>
                        {savingAddress ? 'Saving...' : 'Save Address'}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setShowAddressForm(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                ) : loadingAddresses ? (
                  <div className="p-4 text-center text-xs text-slate-500">Loading saved addresses...</div>
                ) : addresses.length === 0 ? (
                  <div className="p-4 rounded-xl border border-dashed border-slate-300 text-center space-y-2">
                    <p className="text-xs text-slate-600">No saved delivery addresses yet.</p>
                    <Button size="sm" variant="outline" onClick={handleOpenAddAddress}>
                      + Add Delivery Address
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-44 overflow-y-auto">
                    {addresses.map((addr) => {
                      const isSel = selectedAddressId === addr.id;
                      return (
                        <div
                          key={addr.id}
                          onClick={() => setSelectedAddressId(addr.id)}
                          className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start justify-between gap-2 ${
                            isSel
                              ? 'border-brand-orange bg-brand-orange-tint/30'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          <div className="text-xs space-y-0.5">
                            <div className="font-bold text-brand-navy flex items-center gap-1.5">
                              <MapPin className="w-3.5 h-3.5 text-brand-orange flex-shrink-0" />
                              <span>{addr.address_line}</span>
                            </div>
                            {addr.landmark && (
                              <p className="text-slate-500 text-[11px]">Landmark: {addr.landmark}</p>
                            )}
                            <p className="text-slate-500 font-mono text-[11px]">PIN: {addr.pincode}</p>
                          </div>
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => handleOpenEditAddress(addr)}
                              className="p-1.5 text-slate-400 hover:text-brand-navy rounded-lg"
                              aria-label="Edit address"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteAddress(addr.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg"
                              aria-label="Delete address"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}

            {/* STEP: PAYMENT METHOD SELECTION (selecting a method never creates an order) */}
            {step === 'payment' && (
              <div className="space-y-2">
                <span className="text-xs font-bold text-brand-navy uppercase tracking-wider block">
                  Select Payment Method
                </span>

                <button
                  type="button"
                  onClick={() => dispatch({ type: 'SELECT_PAYMENT', method: 'cod' })}
                  aria-pressed={paymentMethod === 'cod'}
                  className={`w-full p-3 rounded-xl border-2 flex items-center justify-between text-left transition-all ${
                    paymentMethod === 'cod'
                      ? 'border-brand-orange bg-brand-orange-tint/30'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Banknote className="w-5 h-5 text-brand-orange" />
                    <div>
                      <span className="text-xs font-bold text-brand-navy block">
                        Cash on Delivery (COD)
                      </span>
                      <span className="text-[11px] text-slate-600">
                        Pay{' '}
                        {calc.totalAmount !== null
                          ? formatCurrencyOrPlaceholder(calc.totalAmount)
                          : 'the total'}{' '}
                        in cash when you {deliveryMode === 'pickup' ? 'collect' : 'receive'} your
                        order
                      </span>
                    </div>
                  </div>
                  {paymentMethod === 'cod' && (
                    <Badge variant="orange" size="sm">
                      Selected
                    </Badge>
                  )}
                </button>

                <button
                  type="button"
                  disabled={!isPaymentMethodAvailable('upi')}
                  className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 opacity-70 flex items-center justify-between text-left cursor-not-allowed"
                >
                  <div className="flex items-center gap-2.5">
                    <CreditCard className="w-5 h-5 text-slate-400" />
                    <div>
                      <span className="text-xs font-bold text-slate-600 block">
                        UPI &amp; Online Payment
                      </span>
                      <span className="text-[11px] text-slate-500">
                        Online payment setup is pending. Please use Cash on Delivery for now.
                      </span>
                    </div>
                  </div>
                  <Badge variant="placeholder" size="sm">
                    Setup Pending
                  </Badge>
                </button>
              </div>
            )}

            {/* STEP: FINAL REVIEW */}
            {step === 'review' && (
              <div className="space-y-2.5 text-xs">
                <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-[11px] font-bold text-brand-navy uppercase tracking-wider block">
                    Items
                  </span>
                  {cartItems.map((item) => (
                    <div key={item.id} className="flex justify-between text-slate-700">
                      <span className="truncate pr-2">
                        {item.name} × {cartQuantities[item.id]}
                      </span>
                      <span className="font-mono font-semibold">
                        {item.price !== null && item.price !== undefined
                          ? formatCurrencyOrPlaceholder(item.price * cartQuantities[item.id])
                          : item.pricePlaceholder}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-[11px] font-bold text-brand-navy uppercase tracking-wider block">
                    {deliveryMode === 'pickup' ? 'Store Pickup' : 'Delivering To'}
                  </span>
                  {deliveryMode === 'pickup' ? (
                    <p className="text-slate-600">{storeConfig.addressPlaceholder}</p>
                  ) : selectedAddress ? (
                    <p className="text-slate-600">
                      {selectedAddress.address_line}
                      {selectedAddress.landmark ? `, near ${selectedAddress.landmark}` : ''} — PIN{' '}
                      {selectedAddress.pincode}
                    </p>
                  ) : null}
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-200 flex justify-between">
                  <span className="text-slate-600">Payment method</span>
                  <span className="font-bold text-brand-navy">
                    {paymentMethod === 'cod' ? 'Cash on Delivery (COD)' : 'Not selected'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  No order has been placed yet. Your order is created only when you press the
                  confirm button below.
                </p>
              </div>
            )}

            {/* Final Bill Summary */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal ({totalItemsCount} items):</span>
                <span className="font-mono font-semibold">
                  {calc.hasUnconfiguredPrices
                    ? '[Unconfigured Price]'
                    : formatCurrencyOrPlaceholder(calc.subtotal)}
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Delivery Fee ({deliveryMode}):</span>
                <span className="font-mono font-semibold">
                  {deliveryMode === 'pickup'
                    ? '₹0 (Store Pickup)'
                    : calc.isFreeDeliveryUnlocked && calc.deliveryFee === 0
                    ? '₹0 (Free Delivery)'
                    : formatCurrencyOrPlaceholder(
                        calc.deliveryFee,
                        storeConfig.deliveryFeePlaceholder
                      )}
                </span>
              </div>
              <div className="flex justify-between text-sm font-extrabold text-brand-navy pt-2 border-t border-slate-200">
                <span>Total Amount Payable:</span>
                <span className="font-mono text-brand-orange">
                  {formatCurrencyOrPlaceholder(calc.totalAmount, '[Calculated at Checkout]')}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-1">
              {step === 'details' && (
                <Button
                  variant="primary"
                  fullWidth
                  disabled={!calc.canCheckout}
                  onClick={handleContinueToPayment}
                >
                  Continue to Payment
                </Button>
              )}
              {step === 'payment' && (
                <Button
                  variant="primary"
                  fullWidth
                  disabled={paymentMethod === null}
                  onClick={handleReviewOrder}
                >
                  {paymentMethod === null ? 'Select a Payment Method' : 'Review Order'}
                </Button>
              )}
              {step === 'review' && (
                <Button
                  variant="primary"
                  fullWidth
                  disabled={placingOrder || !calc.canCheckout || !canSubmitOrder(flow)}
                  onClick={handleConfirmOrder}
                >
                  {placingOrder
                    ? 'Placing Order...'
                    : `Confirm Order — Pay ${
                        calc.totalAmount !== null
                          ? formatCurrencyOrPlaceholder(calc.totalAmount)
                          : ''
                      } on ${deliveryMode === 'pickup' ? 'Pickup' : 'Delivery'}`}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                fullWidth
                disabled={placingOrder}
                onClick={() => dispatch({ type: 'BACK' })}
              >
                {step === 'details' ? 'Back to Cart' : 'Back'}
              </Button>
            </div>
          </div>
        ) : (
          /* STEP 1: CART VIEW & PRICE BREAKDOWN */
          <>
            {!storeConfig.isLiveData && (
              <div className="bg-amber-50 p-3 rounded-xl border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>Demo Mode Notice:</strong> Connect Supabase in <code>.env</code> and
                  configure product prices in <code>/admin</code> to enable live order placement.
                </span>
              </div>
            )}

            {/* Closed store warning rule */}
            {!storeConfig.isOpen && (
              <div className="bg-rose-50 p-3 rounded-xl border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>Store Currently Closed:</strong> In accordance with FOMO Store business
                  rules, checkout is locked while the store is closed.
                </span>
              </div>
            )}

            {/* Free Delivery Threshold Hint */}
            <div className="bg-brand-grey-blue p-3 rounded-xl border border-brand-grey-blue-border text-xs flex items-center justify-between">
              <span className="text-brand-navy font-semibold">Free Delivery Status:</span>
              <span className="font-mono text-slate-700 font-semibold">
                {deliveryMode === 'pickup'
                  ? 'Free (Store Pickup)'
                  : calc.isFreeDeliveryUnlocked
                  ? 'Unlocked! Free Delivery Applied'
                  : calc.amountNeededForFreeDelivery !== null
                  ? `Add ₹${calc.amountNeededForFreeDelivery.toFixed(0)} more for free delivery`
                  : `[Add ${storeConfig.freeDeliveryThresholdPlaceholder} for free delivery]`}
              </span>
            </div>

            {/* Minimum Order Hint */}
            {calc.amountNeededForMinOrder !== null && (
              <div className="bg-amber-50 p-2.5 rounded-xl border border-amber-200 text-xs text-amber-900 flex items-center justify-between">
                <span className="font-semibold">Minimum Order Requirement:</span>
                <span className="font-mono font-bold">
                  Add ₹{calc.amountNeededForMinOrder.toFixed(0)} more to checkout
                </span>
              </div>
            )}

            {/* Cart Items List */}
            {cartItems.length === 0 ? (
              <div className="text-center py-8 text-slate-500 space-y-3">
                <div className="w-16 h-16 bg-brand-grey-blue rounded-full flex items-center justify-center mx-auto text-slate-400">
                  <ShoppingBag className="w-8 h-8 text-slate-400" />
                </div>
                <div>
                  <p className="font-bold text-brand-navy text-base">Your cart is empty</p>
                  <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                    Add items from the store catalog to see your bill breakdown and proceed to
                    checkout.
                  </p>
                </div>
                <div className="pt-2">
                  <Button variant="primary" size="sm" onClick={onClose}>
                    <span>Explore Products</span>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                {cartItems.map((item) => {
                  const qty = cartQuantities[item.id];
                  const unitPriceStr =
                    item.price !== null && item.price !== undefined
                      ? formatCurrencyOrPlaceholder(item.price, item.pricePlaceholder)
                      : item.pricePlaceholder;

                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200/80 gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <h5 className="font-bold text-brand-navy truncate text-xs">{item.name}</h5>
                        <span className="text-[11px] text-slate-500 block font-mono">
                          {unitPriceStr} / {item.unit}
                        </span>
                        {!item.inStock && (
                          <span className="text-[10px] font-bold text-rose-600">
                            Out of Stock — Please remove
                          </span>
                        )}
                      </div>

                      {/* Quantity Stepper */}
                      <div className="flex items-center bg-white rounded-lg border border-slate-200 shadow-xs">
                        <button
                          onClick={() => onDecrement(item.id)}
                          className="p-1.5 hover:bg-slate-100 rounded-l-lg touch-target flex items-center justify-center text-brand-navy"
                          aria-label={`Decrease ${item.name}`}
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="px-2 text-xs font-bold font-mono text-brand-navy min-w-[24px] text-center">
                          {qty}
                        </span>
                        <button
                          onClick={() => onIncrement(item.id)}
                          className="p-1.5 hover:bg-slate-100 rounded-r-lg touch-target flex items-center justify-center text-brand-navy"
                          aria-label={`Increase ${item.name}`}
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Bill Breakdown */}
            {cartItems.length > 0 && (
              <div className="pt-3 border-t border-slate-200 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Items Subtotal ({totalItemsCount} items):</span>
                  <span className="font-mono font-semibold">
                    {calc.hasUnconfiguredPrices
                      ? '[Demo / Unconfigured Price]'
                      : formatCurrencyOrPlaceholder(calc.subtotal)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Delivery Fee ({deliveryMode}):</span>
                  <span className="font-mono font-semibold">
                    {deliveryMode === 'pickup'
                      ? '₹0 (Store Pickup)'
                      : calc.deliveryFee !== null
                      ? formatCurrencyOrPlaceholder(calc.deliveryFee)
                      : storeConfig.deliveryFeePlaceholder}
                  </span>
                </div>
                {calc.productSavings > 0 && (
                  <div className="flex justify-between text-emerald-700 font-semibold">
                    <span>Savings on MRP:</span>
                    <span className="font-mono">-₹{calc.productSavings.toFixed(0)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-extrabold text-brand-navy pt-2 border-t border-slate-200">
                  <span>Total Payable:</span>
                  <span className="font-mono text-brand-orange">
                    {calc.totalAmount !== null
                      ? formatCurrencyOrPlaceholder(calc.totalAmount)
                      : '[Demo Total Placeholder]'}
                  </span>
                </div>
              </div>
            )}

            {/* Checkout Block Reason Notice */}
            {cartItems.length > 0 && !calc.canCheckout && calc.checkoutBlockReason && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 space-y-2">
                <p>{calc.checkoutBlockReason}</p>
                {deliveryMode === 'delivery' &&
                  onSelectDeliveryMode &&
                  (!calc.isDeliveryFeeConfigured ||
                    (storeConfig.isLiveData &&
                      (!storeConfig.serviceablePincodes ||
                        storeConfig.serviceablePincodes.length === 0))) && (
                    <Button
                      size="sm"
                      variant="secondary"
                      fullWidth
                      onClick={() => onSelectDeliveryMode('pickup')}
                      className="gap-1.5"
                    >
                      <Store className="w-3.5 h-3.5 text-brand-orange" />
                      <span>Switch to Store Pickup (₹0 Fee)</span>
                    </Button>
                  )}
              </div>
            )}

            {/* Actions */}
            {cartItems.length > 0 && (
              <div className="pt-2 space-y-2">
                {!userId ? (
                  <Button
                    variant="primary"
                    fullWidth
                    disabled={!storeConfig.isOpen}
                    onClick={handleProceedToCheckout}
                    className="gap-2"
                  >
                    <Phone className="w-4 h-4" />
                    <span>Sign In / Register to Checkout</span>
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    fullWidth
                    disabled={!calc.canCheckout}
                    onClick={handleProceedToCheckout}
                  >
                    <span>Continue to Checkout</span>
                  </Button>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  fullWidth
                  onClick={() => {
                    if (window.confirm('Remove all items from your cart?')) {
                      onClearCart();
                    }
                  }}
                  className="text-slate-500 hover:text-rose-600 gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear Cart</span>
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
};
