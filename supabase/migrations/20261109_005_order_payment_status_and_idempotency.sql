-- ============================================================================
-- FOMO STORE — MIGRATION 005: ORDER PAYMENT STATUS & IDEMPOTENT ORDER PLACEMENT
-- ============================================================================
-- ADDITIVE ONLY. Safe for existing production data.
--
-- What this changes
--   1. public.orders gains two nullable/defaulted columns:
--        payment_status   text NOT NULL DEFAULT 'unpaid'
--                         CHECK IN ('unpaid','pending','paid','failed','refunded')
--        idempotency_key  text NULL
--      Every existing row is backfilled automatically with payment_status='unpaid'
--      (all existing orders are Cash on Delivery, so 'unpaid' = "collect on delivery").
--      No existing column, row, policy, trigger or product/inventory data is modified.
--   2. A partial UNIQUE index on (customer_id, idempotency_key) prevents duplicate
--      orders from repeated submissions of the same checkout.
--   3. public.place_order() gets a 5th OPTIONAL parameter p_idempotency_key.
--      The 4-argument call form used by the currently deployed frontend keeps working
--      (the new parameter defaults to NULL). All existing validation, locking,
--      pricing, stock decrement and cart-clearing logic is unchanged.
--      Online payment ('upi') remains REJECTED server-side until a payment gateway
--      with server-side verification is configured; no order can be marked paid here.
--   4. enforce_order_immutability() additionally protects payment_status and
--      idempotency_key from non-admin modification.
--
-- Rollback
--   DROP FUNCTION public.place_order(jsonb, text, uuid, text, text);
--   then re-run the place_order() definition from 20261106_002 (4-arg form);
--   optionally: DROP INDEX orders_customer_idempotency_uidx;
--               ALTER TABLE public.orders DROP COLUMN payment_status, DROP COLUMN idempotency_key;
--   (dropping columns only discards the new, additive data).
-- ============================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS idempotency_key text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_payment_status_check') THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_payment_status_check
      CHECK (payment_status IN ('unpaid', 'pending', 'paid', 'failed', 'refunded'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS orders_customer_idempotency_uidx
  ON public.orders (customer_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_order_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (current_user NOT IN ('anon', 'authenticated') AND auth.uid() IS NULL) OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.customer_id IS DISTINCT FROM OLD.customer_id OR
     NEW.delivery_partner_id IS DISTINCT FROM OLD.delivery_partner_id OR
     NEW.delivery_mode IS DISTINCT FROM OLD.delivery_mode OR
     NEW.subtotal IS DISTINCT FROM OLD.subtotal OR
     NEW.delivery_fee IS DISTINCT FROM OLD.delivery_fee OR
     NEW.discount_amount IS DISTINCT FROM OLD.discount_amount OR
     NEW.total_amount IS DISTINCT FROM OLD.total_amount OR
     NEW.delivery_address IS DISTINCT FROM OLD.delivery_address OR
     NEW.payment_method IS DISTINCT FROM OLD.payment_method OR
     NEW.payment_status IS DISTINCT FROM OLD.payment_status OR
     NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key OR
     NEW.order_number IS DISTINCT FROM OLD.order_number THEN
    RAISE EXCEPTION 'Forbidden: Direct modification of sensitive order fields is prohibited.';
  END IF;

  RETURN NEW;
END;
$$;

DROP FUNCTION IF EXISTS public.place_order(jsonb, text, uuid, text);

CREATE OR REPLACE FUNCTION public.place_order(
  p_items jsonb,
  p_delivery_mode text,
  p_address_id uuid DEFAULT NULL,
  p_payment_method text DEFAULT 'cod',
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_is_open boolean;
  v_delivery_fee numeric;
  v_free_threshold numeric;
  v_min_order numeric;
  v_serviceable_pincodes text[];
  v_subtotal numeric := 0;
  v_discount_amount numeric := 0;
  v_total_amount numeric := 0;
  v_order_id uuid;
  v_order_number text;
  v_created_at timestamptz;
  v_address_json jsonb := '{}'::jsonb;
  v_cust_name text;
  v_cust_phone text;
  v_cust_address_line text;
  v_cust_landmark text;
  v_cust_pincode text;
  v_item record;
  v_prod record;
  v_stock integer;
  v_existing record;
  v_key text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to place an order.';
  END IF;

  v_key := nullif(btrim(p_idempotency_key), '');
  IF v_key IS NOT NULL THEN
    IF length(v_key) > 100 THEN
      RAISE EXCEPTION 'Invalid idempotency key.';
    END IF;
    -- Serialise concurrent submissions of the same checkout for this customer.
    PERFORM pg_advisory_xact_lock(hashtext('place_order:' || v_user_id::text || ':' || v_key));

    SELECT id, order_number, subtotal, delivery_fee, discount_amount, total_amount,
           status, payment_method, payment_status, created_at
    INTO v_existing
    FROM public.orders
    WHERE customer_id = v_user_id AND idempotency_key = v_key;

    IF v_existing.id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', true,
        'duplicate', true,
        'order_id', v_existing.id,
        'order_number', v_existing.order_number,
        'subtotal', v_existing.subtotal,
        'delivery_fee', v_existing.delivery_fee,
        'discount_amount', v_existing.discount_amount,
        'total_amount', v_existing.total_amount,
        'status', v_existing.status,
        'payment_method', v_existing.payment_method,
        'payment_status', v_existing.payment_status,
        'created_at', v_existing.created_at
      );
    END IF;
  END IF;

  SELECT full_name, phone INTO v_cust_name, v_cust_phone
  FROM public.profiles
  WHERE id = v_user_id;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Order items list cannot be empty.';
  END IF;

  IF p_payment_method IS DISTINCT FROM 'cod' THEN
    RAISE EXCEPTION 'Invalid payment method. Only Cash on Delivery is available until online payment is enabled.';
  END IF;

  IF p_delivery_mode NOT IN ('delivery', 'pickup') THEN
    RAISE EXCEPTION 'Invalid delivery mode: %', p_delivery_mode;
  END IF;

  SELECT is_open, delivery_fee, free_delivery_threshold, min_order_amount, serviceable_pincodes
  INTO v_is_open, v_delivery_fee, v_free_threshold, v_min_order, v_serviceable_pincodes
  FROM public.store_settings
  WHERE config_id = 'primary';

  IF v_is_open IS NOT TRUE THEN
    RAISE EXCEPTION 'Store is currently unavailable for new orders.';
  END IF;

  IF p_delivery_mode = 'delivery' AND v_delivery_fee IS NULL THEN
    RAISE EXCEPTION 'Delivery fee is not configured yet. Doorstep delivery is temporarily disabled.';
  END IF;

  IF p_delivery_mode = 'delivery' THEN
    IF v_serviceable_pincodes IS NULL OR array_length(v_serviceable_pincodes, 1) IS NULL OR array_length(v_serviceable_pincodes, 1) = 0 THEN
      RAISE EXCEPTION 'Delivery service area is not configured yet. Doorstep delivery is temporarily disabled. Please choose Store Pickup.';
    END IF;

    IF p_address_id IS NULL THEN
      RAISE EXCEPTION 'Delivery address is required for doorstep delivery.';
    END IF;

    SELECT address_line, landmark, pincode
    INTO v_cust_address_line, v_cust_landmark, v_cust_pincode
    FROM public.addresses
    WHERE id = p_address_id AND user_id = v_user_id;

    IF v_cust_address_line IS NULL THEN
      RAISE EXCEPTION 'Selected delivery address not found.';
    END IF;

    IF v_cust_pincode IS NULL OR btrim(v_cust_pincode) = '' THEN
      RAISE EXCEPTION 'Selected delivery address must have a valid PIN code.';
    END IF;

    IF NOT (btrim(v_cust_pincode) = ANY(v_serviceable_pincodes)) THEN
      RAISE EXCEPTION 'Delivery is not available to PIN code %. Delivery is currently limited to: %.', btrim(v_cust_pincode), array_to_string(v_serviceable_pincodes, ', ');
    END IF;

    v_address_json := jsonb_build_object(
      'address_line', v_cust_address_line,
      'landmark', v_cust_landmark,
      'pincode', v_cust_pincode,
      'customer_name', v_cust_name,
      'customer_phone', v_cust_phone
    );
  ELSE
    v_address_json := jsonb_build_object(
      'type', 'store_pickup',
      'customer_name', v_cust_name,
      'customer_phone', v_cust_phone
    );
  END IF;

  CREATE TEMPORARY TABLE IF NOT EXISTS temp_order_items (
    product_id uuid,
    product_name text,
    unit text,
    unit_price numeric,
    quantity integer,
    total_price numeric
  ) ON COMMIT DROP;
  TRUNCATE TABLE temp_order_items;

  FOR v_item IN
    SELECT product_id, sum(quantity)::integer AS quantity
    FROM jsonb_to_recordset(p_items) AS x(product_id uuid, quantity integer)
    GROUP BY product_id
    ORDER BY product_id NULLS FIRST
  LOOP
    IF v_item.product_id IS NULL THEN
      RAISE EXCEPTION 'Product ID cannot be null in order items.';
    END IF;

    IF v_item.quantity IS NULL OR v_item.quantity <= 0 THEN
      RAISE EXCEPTION 'Invalid item quantity for product %.', v_item.product_id;
    END IF;

    SELECT stock_quantity INTO v_stock
    FROM public.inventory
    WHERE product_id = v_item.product_id
    FOR UPDATE;

    SELECT id, name, unit, price INTO v_prod
    FROM public.products
    WHERE id = v_item.product_id AND is_active = true;

    IF v_prod.id IS NULL THEN
      RAISE EXCEPTION 'Product % is inactive or does not exist.', v_item.product_id;
    END IF;

    IF v_prod.price IS NULL OR v_prod.price < 0 THEN
      RAISE EXCEPTION 'Invalid price configuration for product "%".', v_prod.name;
    END IF;

    IF v_stock IS NULL OR v_stock < v_item.quantity THEN
      RAISE EXCEPTION 'Item "%" is out of stock. (Available: %, Requested: %)', v_prod.name, coalesce(v_stock, 0), v_item.quantity;
    END IF;

    INSERT INTO temp_order_items (product_id, product_name, unit, unit_price, quantity, total_price)
    VALUES (v_prod.id, v_prod.name, v_prod.unit, v_prod.price, v_item.quantity, (v_prod.price * v_item.quantity));

    v_subtotal := v_subtotal + (v_prod.price * v_item.quantity);
  END LOOP;

  IF v_min_order IS NOT NULL AND v_min_order > 0 AND v_subtotal < v_min_order THEN
    RAISE EXCEPTION 'Minimum order amount is Rs %.', v_min_order;
  END IF;

  IF p_delivery_mode = 'pickup' THEN
    v_delivery_fee := 0;
  ELSIF v_free_threshold IS NOT NULL AND v_free_threshold > 0 AND v_subtotal >= v_free_threshold THEN
    v_delivery_fee := 0;
  END IF;

  v_total_amount := v_subtotal + coalesce(v_delivery_fee, 0) - v_discount_amount;

  FOR v_item IN SELECT product_id, quantity FROM temp_order_items
  LOOP
    UPDATE public.inventory
    SET stock_quantity = stock_quantity - v_item.quantity, updated_at = now()
    WHERE product_id = v_item.product_id;
  END LOOP;

  v_order_number := public.generate_order_number();

  INSERT INTO public.orders (
    order_number, customer_id, delivery_mode, status,
    subtotal, delivery_fee, discount_amount, total_amount, delivery_address,
    payment_method, payment_status, idempotency_key
  )
  VALUES (
    v_order_number, v_user_id, p_delivery_mode, 'placed',
    v_subtotal, coalesce(v_delivery_fee, 0), v_discount_amount, v_total_amount, v_address_json,
    p_payment_method, 'unpaid', v_key
  )
  RETURNING id, created_at INTO v_order_id, v_created_at;

  INSERT INTO public.order_items (order_id, product_id, product_name, unit_price, unit, quantity, total_price)
  SELECT v_order_id, product_id, product_name, unit_price, unit, quantity, total_price
  FROM temp_order_items;

  INSERT INTO public.order_status_history (order_id, status, note, created_at)
  VALUES (v_order_id, 'placed', 'Order placed successfully by customer', now());

  DELETE FROM public.cart_items
  WHERE cart_id IN (SELECT id FROM public.carts WHERE user_id = v_user_id);

  RETURN jsonb_build_object(
    'success', true,
    'duplicate', false,
    'order_id', v_order_id,
    'order_number', v_order_number,
    'subtotal', v_subtotal,
    'delivery_fee', coalesce(v_delivery_fee, 0),
    'discount_amount', v_discount_amount,
    'total_amount', v_total_amount,
    'status', 'placed',
    'payment_method', p_payment_method,
    'payment_status', 'unpaid',
    'created_at', v_created_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.place_order(jsonb, text, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.place_order(jsonb, text, uuid, text, text) TO authenticated;
