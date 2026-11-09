/**
 * FOMO Store — isolated database test-harness for migration 005 + checkout/payment rules.
 *
 * Runs the REAL SQL migrations (001 → 005) inside an in-process PGlite Postgres.
 * It never connects to Supabase / production.
 *
 * Run:  node tests/db-checkout-payment.test.mjs
 * Optional: PGLITE_PATH=<path to @electric-sql/pglite/dist/index.js>
 *
 * Limitation (honest): PGlite is single-connection, so true parallel-transaction races
 * cannot be exercised here. Concurrency safety relies on the FOR UPDATE row locks already
 * in place_order() and the advisory lock + unique index added by migration 005.
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pglitePath =
  process.env.PGLITE_PATH ||
  'C:/Users/Piyush/.gemini/antigravity/brain/03d1a692-a7d2-4dbc-b1e5-c19bc65c64d8/scratch/node_modules/@electric-sql/pglite/dist/index.js';
const { PGlite } = await import(pathToFileURL(pglitePath).href);

const mig = (f) => fs.readFileSync(path.join(here, '../supabase/migrations', f), 'utf8');
const m1 = mig('20261106_001_preflight_archive.sql');
const m2 = mig('20261106_002_initial_schema_alignment.sql');
const m3 = mig('20261106_003_security_hardening_f1_f2_f3.sql');
const m4 = mig('20261106_004_revoke_trigger_execute.sql');
const m5 = mig('20261109_005_order_payment_status_and_idempotency.sql');

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗  FAILED: ${name}`);
    console.error(err);
    process.exit(1);
  }
}

const db = new PGlite();
const as = async (uid, sql, role = 'authenticated') => {
  const res = await db.exec(
    `SET LOCAL role = ${role}; SET LOCAL "request.jwt.claim.sub" = '${uid}'; ${sql}`
  );
  return res[res.length - 1];
};
const rejects = async (fn, pattern) => {
  let err = null;
  try {
    await fn();
  } catch (e) {
    err = e;
  }
  assert.ok(err, 'expected the operation to be rejected');
  if (pattern) assert.match(String(err.message), pattern);
  return err;
};

const EGG = 'caf933f1-7e8e-46de-94ef-310c579dc4ad';
const MILK = 'd1111111-1111-1111-1111-111111111111';
const A = 'a1111111-1111-1111-1111-111111111111';
const B = 'b2222222-2222-2222-2222-222222222222';
const ADMIN = 'ad111111-1111-1111-1111-111111111111';
const RIDER = 'e1111111-1111-1111-1111-111111111111';
const RIDER2 = 'e2222222-2222-2222-2222-222222222222';
const ADDR_OK = 'c3333333-3333-3333-3333-333333333333';
const ADDR_BAD = 'c4444444-4444-4444-4444-444444444444';
const ADDR_B = 'c5555555-5555-5555-5555-555555555555';

const stock = async (id = EGG) =>
  (await db.query(`SELECT stock_quantity FROM public.inventory WHERE product_id='${id}'`)).rows[0]
    .stock_quantity;
const orderCount = async () =>
  Number((await db.query(`SELECT count(*) AS c FROM public.orders`)).rows[0].c);
const place = (uid, items, mode = 'pickup', addr = null, method = 'cod', key = null) =>
  as(
    uid,
    `SELECT public.place_order(
       p_items := '${JSON.stringify(items)}'::jsonb,
       p_delivery_mode := '${mode}',
       p_address_id := ${addr ? `'${addr}'` : 'NULL'},
       p_payment_method := '${method}'
       ${key ? `, p_idempotency_key := '${key}'` : ''}
     ) AS r;`
  ).then((r) => r.rows[0].r);

console.log('\n══════════════════════════════════════════════════════════════');
console.log('  FOMO STORE — CHECKOUT / PAYMENT DB TEST HARNESS (PGlite)');
console.log('══════════════════════════════════════════════════════════════\n');

await db.exec(`
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
  END $$;
`);
await db.exec(m1);
await db.exec(m2);
await db.exec(m3);
await db.exec(m4);

// ── Seed isolated test data (mirrors production: real "egg" product) ─────────
await db.exec(`
  INSERT INTO public.products (id, name, unit, price, mrp, is_active, is_new_arrival, display_order)
  VALUES ('${EGG}', 'egg', '6 pic', 40, 65, true, true, 0),
         ('${MILK}', 'Milk', '500 ml', 30, 32, true, false, 1);
  INSERT INTO public.inventory (product_id, stock_quantity) VALUES ('${EGG}', 25), ('${MILK}', 2);
  UPDATE public.store_settings SET is_open = true, delivery_fee = 30, free_delivery_threshold = 200,
         min_order_amount = NULL, serviceable_pincodes = ARRAY['805125'] WHERE config_id='primary';
  INSERT INTO auth.users (id, phone, raw_user_meta_data) VALUES
    ('${A}', '+919876543210', '{"full_name":"Rahul Sharma"}'),
    ('${B}', '+919123456789', '{"full_name":"Priya Kumari"}'),
    ('${ADMIN}', '+919000000001', '{"full_name":"Owner"}'),
    ('${RIDER}', '+919000000002', '{"full_name":"Rider One"}'),
    ('${RIDER2}', '+919000000003', '{"full_name":"Rider Two"}');
  UPDATE public.profiles SET role='admin' WHERE id='${ADMIN}';
  INSERT INTO public.addresses (id, user_id, address_line, landmark, pincode, is_default) VALUES
    ('${ADDR_OK}', '${A}', 'Ward 5, Rajauli', 'Near SBI', '805125', true),
    ('${ADDR_BAD}', '${A}', 'Far away', NULL, '999999', false),
    ('${ADDR_B}', '${B}', 'Ward 9, Rajauli', NULL, '805125', true);
`);
await as(ADMIN, `SELECT public.admin_set_user_role('${RIDER}', 'rider'), public.admin_set_user_role('${RIDER2}', 'rider');`);

const eggBefore = (await db.query(`SELECT name, unit, price, mrp, is_active FROM public.products WHERE id='${EGG}'`)).rows[0];
const adminBefore = (await db.query(`SELECT role FROM public.profiles WHERE id='${ADMIN}'`)).rows[0];

// An order placed BEFORE migration 005 (old 4-arg function) to prove backfill/preservation.
const preOrder = await place(A, [{ product_id: EGG, quantity: 1 }]);
const stockAfterPre = await stock();

console.log('── MIGRATION 005 ─────────────────────────────────────────────');
await db.exec(m5);

await test('migration 005 applies cleanly on top of 001-004 with existing orders', async () => {
  const r = await db.query(`SELECT payment_status, idempotency_key, payment_method, total_amount FROM public.orders WHERE id='${preOrder.order_id}'`);
  assert.strictEqual(r.rows[0].payment_status, 'unpaid');
  assert.strictEqual(r.rows[0].idempotency_key, null);
  assert.strictEqual(r.rows[0].payment_method, 'cod');
  assert.strictEqual(Number(r.rows[0].total_amount), 40);
});

await test('migration 005 is re-runnable (idempotent)', async () => {
  await db.exec(m5);
  const fns = await db.query(`SELECT count(*) AS c FROM pg_proc WHERE proname='place_order'`);
  assert.strictEqual(Number(fns.rows[0].c), 1, 'exactly one place_order() must exist (no competing overload)');
});

await test('payment_status CHECK constraint rejects invalid values', async () => {
  await rejects(() => db.exec(`UPDATE public.orders SET payment_status='bogus' WHERE id='${preOrder.order_id}'`), /orders_payment_status_check|check/i);
});

await test('legacy 4-argument place_order call (deployed frontend) still works', async () => {
  const before = await stock();
  const r = await place(A, [{ product_id: EGG, quantity: 1 }]);
  assert.strictEqual(r.success, true);
  assert.strictEqual(r.payment_status, 'unpaid');
  assert.strictEqual(await stock(), before - 1);
});

console.log('\n── ORDER CREATION RULES ──────────────────────────────────────');

await test('COD order saves payment_method=cod and is NEVER marked paid automatically', async () => {
  const r = await place(A, [{ product_id: EGG, quantity: 2 }], 'delivery', ADDR_OK, 'cod', 'key-cod-1');
  assert.strictEqual(r.payment_method, 'cod');
  assert.strictEqual(r.payment_status, 'unpaid');
  assert.strictEqual(r.status, 'placed');
  assert.strictEqual(Number(r.subtotal), 80);
  assert.strictEqual(Number(r.delivery_fee), 30);
  assert.strictEqual(Number(r.total_amount), 110);
  const row = (await db.query(`SELECT payment_status FROM public.orders WHERE id='${r.order_id}'`)).rows[0];
  assert.strictEqual(row.payment_status, 'unpaid');
});

await test('online payment (upi) is rejected server-side and creates no order / stock change', async () => {
  const cnt = await orderCount();
  const st = await stock();
  await rejects(() => place(A, [{ product_id: EGG, quantity: 1 }], 'pickup', null, 'upi'), /payment method/i);
  assert.strictEqual(await orderCount(), cnt);
  assert.strictEqual(await stock(), st);
});

await test('a client cannot request a paid/other payment method', async () => {
  await rejects(() => place(A, [{ product_id: EGG, quantity: 1 }], 'pickup', null, 'paid'), /payment method/i);
});

await test('customer cannot mark an order paid (direct UPDATE blocked)', async () => {
  const id = preOrder.order_id;
  try {
    await as(A, `UPDATE public.orders SET payment_status='paid' WHERE id='${id}';`);
  } catch {
    /* rejected by RLS/trigger — expected */
  }
  const row = (await db.query(`SELECT payment_status FROM public.orders WHERE id='${id}'`)).rows[0];
  assert.strictEqual(row.payment_status, 'unpaid');
});

await test('duplicate submission with same idempotency key returns the same order, stock decremented once', async () => {
  const cnt = await orderCount();
  const st = await stock();
  const first = await place(A, [{ product_id: EGG, quantity: 1 }], 'pickup', null, 'cod', 'key-dup-1');
  const second = await place(A, [{ product_id: EGG, quantity: 1 }], 'pickup', null, 'cod', 'key-dup-1');
  assert.strictEqual(first.duplicate, false);
  assert.strictEqual(second.duplicate, true);
  assert.strictEqual(second.order_id, first.order_id);
  assert.strictEqual(second.order_number, first.order_number);
  assert.strictEqual(await orderCount(), cnt + 1);
  assert.strictEqual(await stock(), st - 1);
});

await test('idempotency keys are scoped per customer and distinct keys create distinct orders', async () => {
  const a = await place(A, [{ product_id: EGG, quantity: 1 }], 'pickup', null, 'cod', 'key-shared');
  const b = await place(B, [{ product_id: EGG, quantity: 1 }], 'pickup', null, 'cod', 'key-shared');
  const a2 = await place(A, [{ product_id: EGG, quantity: 1 }], 'pickup', null, 'cod', 'key-other');
  assert.notStrictEqual(a.order_id, b.order_id);
  assert.notStrictEqual(a.order_id, a2.order_id);
  assert.strictEqual(b.duplicate, false);
});

await test('invalid quantities / empty cart / null product are rejected', async () => {
  const st = await stock();
  await rejects(() => place(A, [], 'pickup'), /empty/i);
  await rejects(() => place(A, [{ product_id: EGG, quantity: 0 }], 'pickup'), /quantity/i);
  await rejects(() => place(A, [{ product_id: EGG, quantity: -3 }], 'pickup'), /quantity/i);
  await rejects(() => place(A, [{ quantity: 1 }], 'pickup'), /null/i);
  assert.strictEqual(await stock(), st);
});

await test('price/total tampering is ignored: totals come from database prices', async () => {
  const r = await place(
    A,
    [{ product_id: EGG, quantity: 1, unit_price: 1, price: 1, total_price: 1 }],
    'pickup', null, 'cod', 'key-tamper'
  );
  assert.strictEqual(Number(r.subtotal), 40);
  assert.strictEqual(Number(r.total_amount), 40);
  const it = (await db.query(`SELECT product_name, unit_price, total_price FROM public.order_items WHERE order_id='${r.order_id}'`)).rows[0];
  assert.strictEqual(it.product_name, 'egg');
  assert.strictEqual(Number(it.unit_price), 40);
});

await test('free delivery threshold applies server-side (5 eggs = Rs 200 → fee 0)', async () => {
  const r = await place(A, [{ product_id: EGG, quantity: 5 }], 'delivery', ADDR_OK, 'cod', 'key-free');
  assert.strictEqual(Number(r.delivery_fee), 0);
  assert.strictEqual(Number(r.total_amount), 200);
});

await test('minimum order amount is enforced server-side', async () => {
  await db.exec(`UPDATE public.store_settings SET min_order_amount = 100 WHERE config_id='primary'`);
  try {
    await rejects(() => place(A, [{ product_id: EGG, quantity: 1 }], 'pickup'), /minimum order/i);
  } finally {
    await db.exec(`UPDATE public.store_settings SET min_order_amount = NULL WHERE config_id='primary'`);
  }
});

await test('invalid / unserviceable / foreign addresses are rejected', async () => {
  await rejects(() => place(A, [{ product_id: EGG, quantity: 1 }], 'delivery', ADDR_BAD), /not available to PIN/i);
  await rejects(() => place(A, [{ product_id: EGG, quantity: 1 }], 'delivery', null), /address is required/i);
  await rejects(() => place(A, [{ product_id: EGG, quantity: 1 }], 'delivery', ADDR_B), /not found/i);
});

await test('closed store blocks order creation', async () => {
  await db.exec(`UPDATE public.store_settings SET is_open = false WHERE config_id='primary'`);
  const cnt = await orderCount();
  try {
    await rejects(() => place(A, [{ product_id: EGG, quantity: 1 }], 'pickup'), /unavailable/i);
    assert.strictEqual(await orderCount(), cnt);
  } finally {
    await db.exec(`UPDATE public.store_settings SET is_open = true WHERE config_id='primary'`);
  }
});

await test('out-of-stock product cannot be ordered and stock never goes negative', async () => {
  const milkStock = await stock(MILK); // 2
  await rejects(() => place(A, [{ product_id: MILK, quantity: milkStock + 1 }], 'pickup'), /out of stock/i);
  assert.strictEqual(await stock(MILK), milkStock);
  const ok = await place(A, [{ product_id: MILK, quantity: milkStock }], 'pickup', null, 'cod', 'key-milk-all');
  assert.strictEqual(ok.success, true);
  assert.strictEqual(await stock(MILK), 0);
  await rejects(() => place(B, [{ product_id: MILK, quantity: 1 }], 'pickup'), /out of stock/i);
  assert.strictEqual(await stock(MILK), 0);
  const neg = await db.query(`SELECT count(*) AS c FROM public.inventory WHERE stock_quantity < 0`);
  assert.strictEqual(Number(neg.rows[0].c), 0);
});

await test('anonymous users cannot create orders', async () => {
  await rejects(() => as('00000000-0000-0000-0000-000000000000',
    `SELECT public.place_order('[{"product_id":"${EGG}","quantity":1}]'::jsonb,'pickup',NULL,'cod',NULL);`, 'anon'));
});

console.log('\n── ORDER PRIVACY, ADMIN, RIDER & CANCELLATION ────────────────');

const aOrder = await place(A, [{ product_id: EGG, quantity: 2 }], 'delivery', ADDR_OK, 'cod', 'key-flow');

await test('customers see only their own orders', async () => {
  const rb = await as(B, `SELECT id FROM public.orders WHERE id='${aOrder.order_id}';`);
  assert.strictEqual(rb.rows.length, 0);
  const ra = await as(A, `SELECT id FROM public.orders WHERE id='${aOrder.order_id}';`);
  assert.strictEqual(ra.rows.length, 1);
  const rAll = await as(B, `SELECT id FROM public.orders WHERE customer_id='${A}';`);
  assert.strictEqual(rAll.rows.length, 0);
});

await test('customer cannot change order status directly', async () => {
  try {
    await as(A, `UPDATE public.orders SET status='delivered' WHERE id='${aOrder.order_id}';`);
  } catch { /* rejected */ }
  const row = (await db.query(`SELECT status FROM public.orders WHERE id='${aOrder.order_id}'`)).rows[0];
  assert.strictEqual(row.status, 'placed');
});

await test('admin can view and process the customer order (confirm → packing → ready) and assign a rider', async () => {
  const seen = await as(ADMIN, `SELECT id FROM public.orders WHERE id='${aOrder.order_id}';`);
  assert.strictEqual(seen.rows.length, 1);
  const partner = (await db.query(`SELECT id FROM public.delivery_partners WHERE user_id='${RIDER}'`)).rows[0].id;
  await as(ADMIN, `UPDATE public.orders SET status='confirmed' WHERE id='${aOrder.order_id}';`);
  await as(ADMIN, `UPDATE public.orders SET status='packing' WHERE id='${aOrder.order_id}';`);
  await as(ADMIN, `UPDATE public.orders SET status='ready', delivery_partner_id='${partner}' WHERE id='${aOrder.order_id}';`);
  const row = (await db.query(`SELECT status, delivery_partner_id FROM public.orders WHERE id='${aOrder.order_id}'`)).rows[0];
  assert.strictEqual(row.status, 'ready');
  assert.strictEqual(row.delivery_partner_id, partner);
});

await test('rider can update only assigned orders, with valid transitions only', async () => {
  await rejects(() => as(RIDER2, `SELECT public.rider_update_order_status('${aOrder.order_id}','out_for_delivery');`), /not assigned/i);
  await rejects(() => as(RIDER, `SELECT public.rider_update_order_status('${aOrder.order_id}','delivered');`), /Invalid status transition/i);
  await as(RIDER, `SELECT public.rider_update_order_status('${aOrder.order_id}','out_for_delivery');`);
  await as(RIDER, `SELECT public.rider_update_order_status('${aOrder.order_id}','delivered');`);
  const row = (await db.query(`SELECT status FROM public.orders WHERE id='${aOrder.order_id}'`)).rows[0];
  assert.strictEqual(row.status, 'delivered');
  const hist = (await db.query(`SELECT status FROM public.order_status_history WHERE order_id='${aOrder.order_id}' ORDER BY created_at, status`)).rows.map((x) => x.status);
  assert.ok(hist.includes('placed') && hist.includes('out_for_delivery') && hist.includes('delivered'));
});

await test('delivered order cannot be cancelled by the customer', async () => {
  await rejects(() => as(A, `SELECT public.customer_cancel_order('${aOrder.order_id}','changed my mind');`), /cannot be cancelled/i);
});

await test('cancellation restores stock exactly once and only while allowed', async () => {
  const st = await stock();
  const o = await place(A, [{ product_id: EGG, quantity: 3 }], 'pickup', null, 'cod', 'key-cancel');
  assert.strictEqual(await stock(), st - 3);
  await as(A, `SELECT public.customer_cancel_order('${o.order_id}','test');`);
  assert.strictEqual(await stock(), st, 'stock restored once');
  await rejects(() => as(A, `SELECT public.customer_cancel_order('${o.order_id}','again');`), /cannot be cancelled/i);
  assert.strictEqual(await stock(), st, 'second cancel must not restore stock again');
  await rejects(() => as(B, `SELECT public.customer_cancel_order('${o.order_id}','not mine');`), /not found/i);
});

await test('cancellation is blocked once packing has started', async () => {
  const o = await place(A, [{ product_id: EGG, quantity: 1 }], 'pickup', null, 'cod', 'key-pack');
  await as(ADMIN, `UPDATE public.orders SET status='confirmed' WHERE id='${o.order_id}';`);
  await as(ADMIN, `UPDATE public.orders SET status='packing' WHERE id='${o.order_id}';`);
  await rejects(() => as(A, `SELECT public.customer_cancel_order('${o.order_id}','late');`), /cannot be cancelled/i);
});

console.log('\n── PRESERVATION CHECKS ───────────────────────────────────────');

await test('existing egg product is unchanged (name, unit, price, MRP, active)', async () => {
  const now = (await db.query(`SELECT name, unit, price, mrp, is_active FROM public.products WHERE id='${EGG}'`)).rows[0];
  assert.deepStrictEqual(now, eggBefore);
});

await test('existing admin profile and role are unchanged', async () => {
  const now = (await db.query(`SELECT role FROM public.profiles WHERE id='${ADMIN}'`)).rows[0];
  assert.deepStrictEqual(now, adminBefore);
});

await test('customers cannot escalate their role and RLS remains enabled on all public tables', async () => {
  await rejects(() => as(A, `UPDATE public.profiles SET role='admin' WHERE id='${A}';`));
  const off = await db.query(`SELECT count(*) AS c FROM pg_tables t JOIN pg_class c ON c.relname=t.tablename
    JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname=t.schemaname
    WHERE t.schemaname='public' AND NOT c.relrowsecurity`);
  assert.strictEqual(Number(off.rows[0].c), 0);
});

await test('place_order is not executable by anon; executable by authenticated', async () => {
  const r = await db.query(`SELECT has_function_privilege('anon','public.place_order(jsonb,text,uuid,text,text)','EXECUTE') AS anon_ok,
    has_function_privilege('authenticated','public.place_order(jsonb,text,uuid,text,text)','EXECUTE') AS auth_ok`);
  assert.strictEqual(r.rows[0].anon_ok, false);
  assert.strictEqual(r.rows[0].auth_ok, true);
});

console.log(`\n  RESULTS: ${passed} passed, 0 failed\n`);
