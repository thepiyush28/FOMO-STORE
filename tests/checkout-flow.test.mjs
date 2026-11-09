/**
 * Unit tests for src/lib/checkoutFlow.ts (the real module used by CartPreviewModal).
 * Run: node tests/checkout-flow.test.mjs   (Node >= 22.18 strips TypeScript types natively)
 */
import assert from 'node:assert';
import {
  canSubmitOrder,
  checkoutReducer,
  initialCheckoutState,
  isPaymentMethodAvailable,
  ONLINE_PAYMENT_ENABLED,
} from '../src/lib/checkoutFlow.ts';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗  FAILED: ${name}`);
    console.error(err);
    process.exit(1);
  }
}

const run = (actions, start = initialCheckoutState) =>
  actions.reduce((s, a) => checkoutReducer(s, a), start);

console.log('\n── CHECKOUT FLOW STATE MACHINE ───────────────────────────────');

test('online payment is disabled until a verified gateway exists', () => {
  assert.strictEqual(ONLINE_PAYMENT_ENABLED, false);
  assert.strictEqual(isPaymentMethodAvailable('upi'), false);
  assert.strictEqual(isPaymentMethodAvailable('cod'), true);
});

test('cart → details → payment → review never allows submission before final step', () => {
  let s = initialCheckoutState;
  assert.strictEqual(canSubmitOrder(s), false, 'cart step');
  s = run([{ type: 'GO_DETAILS' }], s);
  assert.strictEqual(s.step, 'details');
  assert.strictEqual(canSubmitOrder(s), false, 'details step');
  s = run([{ type: 'GO_PAYMENT' }], s);
  assert.strictEqual(s.step, 'payment');
  assert.strictEqual(canSubmitOrder(s), false, 'payment step, nothing selected');
  s = run([{ type: 'SELECT_PAYMENT', method: 'cod' }], s);
  assert.strictEqual(s.paymentMethod, 'cod');
  assert.strictEqual(canSubmitOrder(s), false, 'selecting payment method must NOT allow order creation');
});

test('SUBMIT_START is ignored on every step except review', () => {
  for (const actions of [
    [],
    [{ type: 'GO_DETAILS' }],
    [{ type: 'GO_DETAILS' }, { type: 'GO_PAYMENT' }],
    [{ type: 'GO_DETAILS' }, { type: 'GO_PAYMENT' }, { type: 'SELECT_PAYMENT', method: 'cod' }],
  ]) {
    const s = run([...actions, { type: 'SUBMIT_START' }]);
    assert.strictEqual(s.submitting, false);
  }
});

test('cannot reach review without selecting a payment method', () => {
  const s = run([{ type: 'GO_DETAILS' }, { type: 'GO_PAYMENT' }, { type: 'GO_REVIEW' }]);
  assert.strictEqual(s.step, 'payment');
});

test('online (upi) payment cannot be selected or reviewed while gateway is disabled', () => {
  const s = run([
    { type: 'GO_DETAILS' },
    { type: 'GO_PAYMENT' },
    { type: 'SELECT_PAYMENT', method: 'upi' },
    { type: 'GO_REVIEW' },
  ]);
  assert.strictEqual(s.paymentMethod, null);
  assert.strictEqual(s.step, 'payment');
});

test('payment cannot be selected outside the payment step', () => {
  const s = run([{ type: 'SELECT_PAYMENT', method: 'cod' }]);
  assert.strictEqual(s.paymentMethod, null);
});

const atReview = run([
  { type: 'GO_DETAILS' },
  { type: 'GO_PAYMENT' },
  { type: 'SELECT_PAYMENT', method: 'cod' },
  { type: 'GO_REVIEW' },
]);

test('review step with COD selected is the only submittable state', () => {
  assert.strictEqual(atReview.step, 'review');
  assert.strictEqual(canSubmitOrder(atReview), true);
});

test('double submission is blocked while a submission is in flight', () => {
  const first = run([{ type: 'SUBMIT_START' }], atReview);
  assert.strictEqual(first.submitting, true);
  assert.strictEqual(canSubmitOrder(first), false);
  const second = run([{ type: 'SUBMIT_START' }], first);
  assert.deepStrictEqual(second, first);
});

test('back navigation is blocked while submitting', () => {
  const inflight = run([{ type: 'SUBMIT_START' }], atReview);
  assert.strictEqual(run([{ type: 'BACK' }], inflight).step, 'review');
});

test('failed submission returns to a retryable review state', () => {
  const failed = run([{ type: 'SUBMIT_START' }, { type: 'SUBMIT_FAIL' }], atReview);
  assert.strictEqual(failed.submitting, false);
  assert.strictEqual(failed.step, 'review');
  assert.strictEqual(canSubmitOrder(failed), true);
});

test('successful submission confirms and blocks any further submission', () => {
  const done = run(
    [{ type: 'SUBMIT_START' }, { type: 'SUBMIT_SUCCESS', orderNumber: 'FOMO-1' }],
    atReview
  );
  assert.strictEqual(done.step, 'confirmed');
  assert.strictEqual(done.orderNumber, 'FOMO-1');
  assert.strictEqual(canSubmitOrder(done), false);
  assert.strictEqual(run([{ type: 'SUBMIT_START' }], done).submitting, false);
});

test('SUBMIT_SUCCESS without a started submission is ignored', () => {
  const s = run([{ type: 'SUBMIT_SUCCESS', orderNumber: 'X' }], atReview);
  assert.strictEqual(s.step, 'review');
  assert.strictEqual(s.orderNumber, null);
});

test('back navigation walks review → payment → details → cart', () => {
  const s1 = run([{ type: 'BACK' }], atReview);
  assert.strictEqual(s1.step, 'payment');
  const s2 = run([{ type: 'BACK' }], s1);
  assert.strictEqual(s2.step, 'details');
  const s3 = run([{ type: 'BACK' }], s2);
  assert.strictEqual(s3.step, 'cart');
});

test('RESET returns to a clean cart state', () => {
  assert.deepStrictEqual(run([{ type: 'RESET' }], atReview), initialCheckoutState);
});

console.log(`\n  RESULTS: ${passed} passed, 0 failed\n`);
