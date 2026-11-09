/**
 * Pure checkout flow state machine for FOMO Store.
 *
 * Guarantees (unit-tested in tests/checkout-flow.test.mjs):
 *  - Browsing the cart, continuing to checkout, picking delivery/pickup, selecting an
 *    address, selecting a payment method and reviewing the order NEVER create an order.
 *  - An order may be submitted only from the final "review" step, after the customer has
 *    explicitly selected an available payment method, and never while another submission
 *    is already in flight or after the order has been confirmed.
 *  - Online payment cannot be selected until a verified payment gateway is enabled.
 *
 * This module intentionally has no imports so it can be unit-tested in plain Node.
 */

export type CheckoutStep = 'cart' | 'details' | 'payment' | 'review' | 'confirmed';
export type CheckoutPaymentMethod = 'cod' | 'upi';

/**
 * Online UPI / gateway payments stay disabled until a gateway (e.g. Razorpay/Cashfree)
 * has merchant credentials, server-side order creation and signature/webhook verification.
 */
export const ONLINE_PAYMENT_ENABLED = false;

export interface CheckoutState {
  step: CheckoutStep;
  paymentMethod: CheckoutPaymentMethod | null;
  submitting: boolean;
  orderNumber: string | null;
}

export type CheckoutAction =
  | { type: 'GO_DETAILS' }
  | { type: 'GO_PAYMENT' }
  | { type: 'SELECT_PAYMENT'; method: CheckoutPaymentMethod }
  | { type: 'GO_REVIEW' }
  | { type: 'BACK' }
  | { type: 'SUBMIT_START' }
  | { type: 'SUBMIT_SUCCESS'; orderNumber: string }
  | { type: 'SUBMIT_FAIL' }
  | { type: 'RESET' };

export const initialCheckoutState: CheckoutState = {
  step: 'cart',
  paymentMethod: null,
  submitting: false,
  orderNumber: null,
};

export function isPaymentMethodAvailable(method: CheckoutPaymentMethod): boolean {
  if (method === 'cod') return true;
  return ONLINE_PAYMENT_ENABLED;
}

/** The ONLY condition under which the UI may call the order-creation backend. */
export function canSubmitOrder(state: CheckoutState): boolean {
  return (
    state.step === 'review' &&
    state.paymentMethod !== null &&
    isPaymentMethodAvailable(state.paymentMethod) &&
    !state.submitting &&
    state.orderNumber === null
  );
}

export function checkoutReducer(state: CheckoutState, action: CheckoutAction): CheckoutState {
  switch (action.type) {
    case 'GO_DETAILS':
      return state.step === 'cart' ? { ...state, step: 'details' } : state;
    case 'GO_PAYMENT':
      return state.step === 'details' || state.step === 'review'
        ? { ...state, step: 'payment' }
        : state;
    case 'SELECT_PAYMENT':
      if (state.step !== 'payment' || !isPaymentMethodAvailable(action.method)) return state;
      return { ...state, paymentMethod: action.method };
    case 'GO_REVIEW':
      if (state.step !== 'payment' || state.paymentMethod === null) return state;
      if (!isPaymentMethodAvailable(state.paymentMethod)) return state;
      return { ...state, step: 'review' };
    case 'BACK':
      if (state.submitting) return state;
      if (state.step === 'review') return { ...state, step: 'payment' };
      if (state.step === 'payment') return { ...state, step: 'details' };
      if (state.step === 'details') return { ...state, step: 'cart' };
      return state;
    case 'SUBMIT_START':
      return canSubmitOrder(state) ? { ...state, submitting: true } : state;
    case 'SUBMIT_SUCCESS':
      if (!state.submitting) return state;
      return { ...state, submitting: false, step: 'confirmed', orderNumber: action.orderNumber };
    case 'SUBMIT_FAIL':
      return { ...state, submitting: false };
    case 'RESET':
      return initialCheckoutState;
    default:
      return state;
  }
}
