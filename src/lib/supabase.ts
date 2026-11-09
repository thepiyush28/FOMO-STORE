import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  AdminProductRow,
  AdminStoreSettingsRow,
  Category,
  CustomerAddress,
  DeliveryMode,
  DeliveryPartner,
  DemoProduct,
  OrderRecord,
  OrderRiderInfo,
  OrderStatus,
  PaymentMethod,
  StoreConfig,
  SupabaseConnectionState,
  UserProfile,
  UserRole,
} from '../types';
import { CATEGORIES, DEMO_PRODUCTS, STORE_INITIAL_CONFIG } from '../data/mockData';
import { formatCurrencyOrPlaceholder, ParsedCsvProductRow } from './pricing';

function sanitizeEnvValue(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().replace(/^['"]|['"]$/g, '').trim();
}

export type FomoAppEnvironmentMode = 'development' | 'staging' | 'production';

export type SupabaseEnvValidationReason =
  | 'ok'
  | 'demo_mode'
  | 'missing_staging_config'
  | 'missing_production_config'
  | 'production_project_collision'
  | 'production_fallback_blocked'
  | 'staging_in_production_blocked'
  | 'unsafe_secret_key'
  | 'invalid_url';

export interface SupabaseEnvResolution {
  mode: FomoAppEnvironmentMode;
  isConfigured: boolean;
  isBlocked: boolean;
  reason: SupabaseEnvValidationReason;
  supabaseUrl: string;
  supabaseAnonKey: string;
  projectRef: string | null;
  setupMessage: string | null;
}

const PLACEHOLDER_URLS = new Set([
  'https://your-project-id.supabase.co',
  'https://your-staging-project-id.supabase.co',
  'https://your-production-project-id.supabase.co',
]);

const PLACEHOLDER_KEYS = new Set([
  'your-anon-public-key-here',
  'your-staging-anon-public-key-here',
  'your-production-anon-public-key-here',
]);

const PLACEHOLDER_REFS = new Set([
  'your-project-id',
  'your-staging-project-id',
  'your-production-project-ref',
  'your-production-project-id',
]);

function isPlaceholderUrl(url: string): boolean {
  return !url || PLACEHOLDER_URLS.has(url.toLowerCase());
}

function isPlaceholderKey(key: string): boolean {
  return !key || PLACEHOLDER_KEYS.has(key.toLowerCase());
}

function isPlaceholderRef(ref: string): boolean {
  return !ref || PLACEHOLDER_REFS.has(ref.toLowerCase());
}

/**
 * Extract the non-secret Supabase project reference (`<project-ref>`) from a Supabase URL
 * (`https://<project-ref>.supabase.co`).
 */
export function extractSupabaseProjectRef(rawUrl: unknown): string | null {
  const cleaned = sanitizeEnvValue(rawUrl).replace(/\/+$/, '');
  if (!cleaned || isPlaceholderUrl(cleaned)) return null;
  try {
    const parsed = new URL(cleaned);
    const parts = parsed.hostname.toLowerCase().split('.');
    if (
      parts.length >= 3 &&
      parts[parts.length - 2] === 'supabase' &&
      parts[parts.length - 1] === 'co'
    ) {
      const ref = parts[0] || '';
      return isPlaceholderRef(ref) ? null : ref;
    }
    const host = parsed.hostname.toLowerCase();
    return isPlaceholderRef(host) ? null : host;
  } catch {
    return null;
  }
}

/**
 * Safety guard: ensure a secret/service_role key is never used in the browser client.
 */
export function isUnsafeSecretKey(key: string): boolean {
  if (!key) return false;
  if (key.startsWith('sb_secret_')) return true;
  // Check JWT payload role if key is a 3-part JWT
  const parts = key.split('.');
  if (parts.length === 3) {
    try {
      const payloadJson = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
      const payload = JSON.parse(payloadJson) as { role?: string };
      if (payload.role === 'service_role' || payload.role === 'supabase_admin') {
        return true;
      }
    } catch {
      // Not a standard base64 JWT payload
    }
  }
  return false;
}

/**
 * Fail-closed Supabase environment validator for Development, Staging, and Production modes.
 * - Staging mode refuses to initialize if staging URL/anon key is missing.
 * - Staging and Development modes refuse to initialize if their project reference matches
 *   the known Production project reference.
 * - Never silently falls back to Production credentials in Staging or Development.
 * - Production mode uses only production-specific environment variables and rejects staging ones.
 * - Never logs or exposes secret/anon key values in error or setup messages.
 */
export function resolveSupabaseEnvironment(
  rawEnv: Record<string, unknown>,
  options?: { knownProductionProjectRef?: string }
): SupabaseEnvResolution {
  const viteMode = sanitizeEnvValue(rawEnv.MODE || 'development').toLowerCase();
  const appEnv = sanitizeEnvValue(rawEnv.VITE_APP_ENV || '').toLowerCase();

  const mode: FomoAppEnvironmentMode =
    viteMode === 'staging' || (appEnv === 'staging' && viteMode !== 'production')
      ? 'staging'
      : viteMode === 'production'
      ? 'production'
      : 'development';

  const explicitProdRef = sanitizeEnvValue(rawEnv.VITE_PRODUCTION_PROJECT_REF).toLowerCase();
  const prodUrlRef = extractSupabaseProjectRef(rawEnv.VITE_PRODUCTION_SUPABASE_URL);
  const buildInjectedProdRef = sanitizeEnvValue(
    options?.knownProductionProjectRef ??
      (typeof __FOMO_KNOWN_PROD_REF__ !== 'undefined' ? __FOMO_KNOWN_PROD_REF__ : '')
  ).toLowerCase();

  const knownProdRef =
    (!isPlaceholderRef(explicitProdRef) ? explicitProdRef : null) ||
    prodUrlRef ||
    (!isPlaceholderRef(buildInjectedProdRef) ? buildInjectedProdRef : null);

  // ==========================================================================
  // 1. STAGING MODE (FAIL-CLOSED)
  // ==========================================================================
  if (mode === 'staging') {
    if (appEnv === 'production') {
      return {
        mode,
        isConfigured: false,
        isBlocked: true,
        reason: 'production_fallback_blocked',
        supabaseUrl: '',
        supabaseAnonKey: '',
        projectRef: null,
        setupMessage:
          'Staging safety block: VITE_APP_ENV is set to "production" while running in staging mode. Configure .env.staging with staging-only credentials.',
      };
    }

    const explicitStagingUrl = sanitizeEnvValue(rawEnv.VITE_STAGING_SUPABASE_URL).replace(
      /\/+$/,
      ''
    );
    const explicitStagingKey = sanitizeEnvValue(rawEnv.VITE_STAGING_SUPABASE_ANON_KEY);

    // Only accept generic VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in staging if explicitly
    // marked with VITE_APP_ENV=staging, preventing silent fallback from an untagged root .env.
    const genericUrl =
      appEnv === 'staging' ? sanitizeEnvValue(rawEnv.VITE_SUPABASE_URL).replace(/\/+$/, '') : '';
    const genericKey =
      appEnv === 'staging' ? sanitizeEnvValue(rawEnv.VITE_SUPABASE_ANON_KEY) : '';

    const candidateUrl = !isPlaceholderUrl(explicitStagingUrl) ? explicitStagingUrl : genericUrl;
    const candidateKey = !isPlaceholderKey(explicitStagingKey) ? explicitStagingKey : genericKey;

    if (isPlaceholderUrl(candidateUrl) || isPlaceholderKey(candidateKey)) {
      const hasUntaggedOrProdVars =
        !isPlaceholderUrl(sanitizeEnvValue(rawEnv.VITE_PRODUCTION_SUPABASE_URL)) ||
        !isPlaceholderKey(sanitizeEnvValue(rawEnv.VITE_PRODUCTION_SUPABASE_ANON_KEY)) ||
        (appEnv !== 'staging' &&
          (!isPlaceholderUrl(sanitizeEnvValue(rawEnv.VITE_SUPABASE_URL)) ||
            !isPlaceholderKey(sanitizeEnvValue(rawEnv.VITE_SUPABASE_ANON_KEY))));

      if (hasUntaggedOrProdVars) {
        return {
          mode,
          isConfigured: false,
          isBlocked: true,
          reason: 'production_fallback_blocked',
          supabaseUrl: '',
          supabaseAnonKey: '',
          projectRef: null,
          setupMessage:
            'Staging safety block: Refused to silently fall back to production or untagged .env credentials. Create .env.staging with VITE_STAGING_SUPABASE_URL and VITE_STAGING_SUPABASE_ANON_KEY pointing to a separate staging Supabase project.',
        };
      }

      return {
        mode,
        isConfigured: false,
        isBlocked: true,
        reason: 'missing_staging_config',
        supabaseUrl: '',
        supabaseAnonKey: '',
        projectRef: null,
        setupMessage:
          'Staging configuration required: Create .env.staging with VITE_STAGING_SUPABASE_URL and VITE_STAGING_SUPABASE_ANON_KEY pointing to your separate staging Supabase project. Refusing to connect to Production.',
      };
    }

    if (!candidateUrl.startsWith('https://')) {
      return {
        mode,
        isConfigured: false,
        isBlocked: true,
        reason: 'invalid_url',
        supabaseUrl: '',
        supabaseAnonKey: '',
        projectRef: null,
        setupMessage:
          'Invalid staging URL: VITE_STAGING_SUPABASE_URL must begin with https://.',
      };
    }

    if (isUnsafeSecretKey(candidateKey)) {
      return {
        mode,
        isConfigured: false,
        isBlocked: true,
        reason: 'unsafe_secret_key',
        supabaseUrl: '',
        supabaseAnonKey: '',
        projectRef: null,
        setupMessage:
          'SECURITY ERROR: Staging anon key appears to be a secret/service_role key. Use only the public anon or sb_publishable_ key.',
      };
    }

    const stagingRef = extractSupabaseProjectRef(candidateUrl);
    if (knownProdRef && stagingRef && stagingRef === knownProdRef) {
      return {
        mode,
        isConfigured: false,
        isBlocked: true,
        reason: 'production_project_collision',
        supabaseUrl: '',
        supabaseAnonKey: '',
        projectRef: stagingRef,
        setupMessage:
          'SAFETY BLOCK: Staging mode refused to initialize because the configured Supabase project reference matches the Production project reference. Configure a separate staging project in .env.staging.',
      };
    }

    return {
      mode,
      isConfigured: true,
      isBlocked: false,
      reason: 'ok',
      supabaseUrl: candidateUrl,
      supabaseAnonKey: candidateKey,
      projectRef: stagingRef,
      setupMessage: null,
    };
  }

  // ==========================================================================
  // 2. PRODUCTION MODE (PRODUCTION-ONLY VARIABLES)
  // ==========================================================================
  if (mode === 'production') {
    if (appEnv === 'staging') {
      return {
        mode,
        isConfigured: false,
        isBlocked: true,
        reason: 'staging_in_production_blocked',
        supabaseUrl: '',
        supabaseAnonKey: '',
        projectRef: null,
        setupMessage:
          'Production safety block: VITE_APP_ENV is set to "staging" while running in production mode.',
      };
    }

    const explicitProdUrl = sanitizeEnvValue(rawEnv.VITE_PRODUCTION_SUPABASE_URL).replace(
      /\/+$/,
      ''
    );
    const explicitProdKey = sanitizeEnvValue(rawEnv.VITE_PRODUCTION_SUPABASE_ANON_KEY);
    const prodFileUrl = sanitizeEnvValue(rawEnv.VITE_SUPABASE_URL).replace(/\/+$/, '');
    const prodFileKey = sanitizeEnvValue(rawEnv.VITE_SUPABASE_ANON_KEY);

    const candidateUrl = !isPlaceholderUrl(explicitProdUrl) ? explicitProdUrl : prodFileUrl;
    const candidateKey = !isPlaceholderKey(explicitProdKey) ? explicitProdKey : prodFileKey;

    if (isPlaceholderUrl(candidateUrl) || isPlaceholderKey(candidateKey)) {
      const hasStagingOnlyVars =
        !isPlaceholderUrl(sanitizeEnvValue(rawEnv.VITE_STAGING_SUPABASE_URL)) ||
        !isPlaceholderKey(sanitizeEnvValue(rawEnv.VITE_STAGING_SUPABASE_ANON_KEY));

      if (hasStagingOnlyVars) {
        return {
          mode,
          isConfigured: false,
          isBlocked: true,
          reason: 'staging_in_production_blocked',
          supabaseUrl: '',
          supabaseAnonKey: '',
          projectRef: null,
          setupMessage:
            'Production safety block: Production mode requires VITE_PRODUCTION_SUPABASE_URL / VITE_PRODUCTION_SUPABASE_ANON_KEY (or .env.production.local) and refuses to use VITE_STAGING_* variables.',
        };
      }

      return {
        mode,
        isConfigured: false,
        isBlocked: false,
        reason: 'missing_production_config',
        supabaseUrl: '',
        supabaseAnonKey: '',
        projectRef: null,
        setupMessage:
          'Production Supabase credentials are not configured. Set VITE_PRODUCTION_SUPABASE_URL and VITE_PRODUCTION_SUPABASE_ANON_KEY in .env.production.local or your deployment environment.',
      };
    }

    if (!candidateUrl.startsWith('https://')) {
      return {
        mode,
        isConfigured: false,
        isBlocked: true,
        reason: 'invalid_url',
        supabaseUrl: '',
        supabaseAnonKey: '',
        projectRef: null,
        setupMessage: 'Invalid production Supabase URL: must begin with https://.',
      };
    }

    if (isUnsafeSecretKey(candidateKey)) {
      return {
        mode,
        isConfigured: false,
        isBlocked: true,
        reason: 'unsafe_secret_key',
        supabaseUrl: '',
        supabaseAnonKey: '',
        projectRef: null,
        setupMessage:
          'SECURITY ERROR: Production anon key appears to be a secret/service_role key. Refusing to initialize browser client.',
      };
    }

    const prodRef = extractSupabaseProjectRef(candidateUrl);
    const stagingRef = extractSupabaseProjectRef(rawEnv.VITE_STAGING_SUPABASE_URL);
    if (stagingRef && prodRef && stagingRef === prodRef) {
      return {
        mode,
        isConfigured: false,
        isBlocked: true,
        reason: 'staging_in_production_blocked',
        supabaseUrl: '',
        supabaseAnonKey: '',
        projectRef: prodRef,
        setupMessage:
          'Production safety block: Production project reference cannot be identical to VITE_STAGING_SUPABASE_URL.',
      };
    }

    return {
      mode,
      isConfigured: true,
      isBlocked: false,
      reason: 'ok',
      supabaseUrl: candidateUrl,
      supabaseAnonKey: candidateKey,
      projectRef: prodRef,
      setupMessage: null,
    };
  }

  // ==========================================================================
  // 3. DEVELOPMENT MODE (NEVER CONNECTS TO PRODUCTION)
  // ==========================================================================
  if (
    appEnv === 'production' ||
    !isPlaceholderUrl(sanitizeEnvValue(rawEnv.VITE_PRODUCTION_SUPABASE_URL)) ||
    !isPlaceholderKey(sanitizeEnvValue(rawEnv.VITE_PRODUCTION_SUPABASE_ANON_KEY))
  ) {
    return {
      mode,
      isConfigured: false,
      isBlocked: true,
      reason: 'production_fallback_blocked',
      supabaseUrl: '',
      supabaseAnonKey: '',
      projectRef: null,
      setupMessage:
        'Development safety block: Refused to connect to Production credentials in development mode. Use `npm run dev:staging` with `.env.staging`, or `npm run dev:production` when intentionally accessing Production.',
    };
  }

  const devStagingUrl = sanitizeEnvValue(rawEnv.VITE_STAGING_SUPABASE_URL).replace(/\/+$/, '');
  const devStagingKey = sanitizeEnvValue(rawEnv.VITE_STAGING_SUPABASE_ANON_KEY);
  const devGenericUrl = sanitizeEnvValue(rawEnv.VITE_SUPABASE_URL).replace(/\/+$/, '');
  const devGenericKey = sanitizeEnvValue(rawEnv.VITE_SUPABASE_ANON_KEY);

  const candidateDevUrl = !isPlaceholderUrl(devStagingUrl) ? devStagingUrl : devGenericUrl;
  const candidateDevKey = !isPlaceholderKey(devStagingKey) ? devStagingKey : devGenericKey;

  if (isPlaceholderUrl(candidateDevUrl) && isPlaceholderKey(candidateDevKey)) {
    return {
      mode,
      isConfigured: false,
      isBlocked: false,
      reason: 'demo_mode',
      supabaseUrl: '',
      supabaseAnonKey: '',
      projectRef: null,
      setupMessage: null,
    };
  }

  if (isPlaceholderUrl(candidateDevUrl) || isPlaceholderKey(candidateDevKey)) {
    return {
      mode,
      isConfigured: false,
      isBlocked: true,
      reason: 'missing_staging_config',
      supabaseUrl: '',
      supabaseAnonKey: '',
      projectRef: null,
      setupMessage:
        'Incomplete Supabase configuration in development mode: both URL and anon key are required.',
    };
  }

  if (!candidateDevUrl.startsWith('https://')) {
    return {
      mode,
      isConfigured: false,
      isBlocked: true,
      reason: 'invalid_url',
      supabaseUrl: '',
      supabaseAnonKey: '',
      projectRef: null,
      setupMessage: 'Invalid Supabase URL in development mode: must begin with https://.',
    };
  }

  if (isUnsafeSecretKey(candidateDevKey)) {
    return {
      mode,
      isConfigured: false,
      isBlocked: true,
      reason: 'unsafe_secret_key',
      supabaseUrl: '',
      supabaseAnonKey: '',
      projectRef: null,
      setupMessage:
        'SECURITY ERROR: Configured anon key appears to be a secret/service_role key. Refusing to initialize browser client.',
    };
  }

  const devRef = extractSupabaseProjectRef(candidateDevUrl);
  if (knownProdRef && devRef && devRef === knownProdRef) {
    return {
      mode,
      isConfigured: false,
      isBlocked: true,
      reason: 'production_project_collision',
      supabaseUrl: '',
      supabaseAnonKey: '',
      projectRef: devRef,
      setupMessage:
        'SAFETY BLOCK: Local development refused to initialize because the configured Supabase project reference matches the Production project reference. Move production credentials to .env.production.local and configure a separate staging project in .env.staging.',
    };
  }

  return {
    mode,
    isConfigured: true,
    isBlocked: false,
    reason: 'ok',
    supabaseUrl: candidateDevUrl,
    supabaseAnonKey: candidateDevKey,
    projectRef: devRef,
    setupMessage: null,
  };
}

const currentEnvResolution = resolveSupabaseEnvironment(
  import.meta.env as unknown as Record<string, unknown>
);

if (currentEnvResolution.isBlocked && currentEnvResolution.setupMessage) {
  console.error(currentEnvResolution.setupMessage);
}

const supabaseUrl = currentEnvResolution.supabaseUrl;
const supabaseAnonKey = currentEnvResolution.supabaseAnonKey;

export const getSupabaseEnvDiagnostic = (): Omit<
  SupabaseEnvResolution,
  'supabaseUrl' | 'supabaseAnonKey'
> => ({
  mode: currentEnvResolution.mode,
  isConfigured: currentEnvResolution.isConfigured,
  isBlocked: currentEnvResolution.isBlocked,
  reason: currentEnvResolution.reason,
  projectRef: currentEnvResolution.projectRef,
  setupMessage: currentEnvResolution.setupMessage,
});

/**
 * Check whether Supabase environment variables are properly configured and validated
 * for the active mode (`development`, `staging`, or `production`).
 */
export const isSupabaseConfigured = (): boolean => {
  return currentEnvResolution.isConfigured && !currentEnvResolution.isBlocked;
};

/**
 * Browser-safe fetch wrapper for `@supabase/supabase-js`:
 * 1. New-format publishable keys (`sb_publishable_...`) are opaque keys, NOT JWTs.
 *    `@supabase/supabase-js@2.118.0` sets `Authorization: Bearer sb_publishable_...` on
 *    unauthenticated REST/Auth requests when no user session exists, which causes PostgREST /
 *    API Gateway JWT parsers or CORS preflights to fail. We strip `Authorization` ONLY when it
 *    equals `Bearer ${supabaseAnonKey}` for `sb_publishable_` keys, while preserving any real
 *    signed-in user's JWT (`Bearer eyJ...`).
 * 2. Strips `X-Retry-Count` and redundant `Accept-Profile: public` / `Content-Profile: public`
 *    headers so browser CORS preflight checks from `localhost:5173` never fail.
 */
export const browserSafeSupabaseFetch: typeof fetch = async (input, init) => {
  const headers = new Headers(init?.headers);

  if (supabaseAnonKey && !headers.has('apikey')) {
    headers.set('apikey', supabaseAnonKey);
  }

  if (supabaseAnonKey.startsWith('sb_publishable_')) {
    const authHeader = headers.get('authorization');
    if (
      authHeader &&
      authHeader.toLowerCase() === `bearer ${supabaseAnonKey}`.toLowerCase()
    ) {
      headers.delete('authorization');
    }
  }

  // Remove non-CORS-safelisted retry header and redundant default-schema profile headers
  headers.delete('x-retry-count');
  if (headers.get('accept-profile') === 'public') {
    headers.delete('accept-profile');
  }
  if (headers.get('content-profile') === 'public') {
    headers.delete('content-profile');
  }

  return globalThis.fetch(input, {
    ...init,
    headers,
  });
};

/**
 * Safe Supabase client instance.
 * If credentials are not configured, client is null and the app runs smoothly in labelled demo mode.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured()
  ? createClient(supabaseUrl, supabaseAnonKey, {
      db: {
        schema: 'public',
      },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
      global: {
        fetch: browserSafeSupabaseFetch,
      },
    })
  : null;

/**
 * Fetch active public categories from `public.categories`.
 */
export async function fetchPublicCategories(): Promise<Category[]> {
  if (!supabase) {
    return CATEGORIES;
  }

  const { data, error } = await supabase
    .from('categories')
    .select('id, name, slug, display_order, is_active')
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const dbCategories = data || [];
  return [
    { id: 'all', name: 'All Categories' },
    ...dbCategories.map((c: Record<string, unknown>) => {
      const id = String(c.id);
      const slug = c.slug ? String(c.slug) : id;
      return {
        id,
        name: String(c.name),
        slug,
        display_order: Number(c.display_order || 0),
        is_active: Boolean(c.is_active),
      };
    }),
  ];
}

/**
 * Fetch public storefront products from the `public.public_catalog` view.
 */
export async function fetchPublicCatalogProducts(
  categoryNameById?: Map<string, string>
): Promise<DemoProduct[]> {
  if (!supabase) {
    return DEMO_PRODUCTS;
  }

  const { data, error } = await supabase
    .from('public_catalog')
    .select(
      'id, category_id, name, unit, price, mrp, discount_percent, image_url, is_popular, is_new_arrival, display_order, in_stock'
    )
    .order('display_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const dbProducts = data || [];
  return dbProducts.map((p: Record<string, unknown>) => {
    const priceNum = p.price !== null && p.price !== undefined ? Number(p.price) : null;
    const mrpNum = p.mrp !== null && p.mrp !== undefined ? Number(p.mrp) : null;
    const catId = p.category_id ? String(p.category_id) : null;

    let computedDiscount = p.discount_percent ? String(p.discount_percent) : undefined;
    if (!computedDiscount && priceNum !== null && mrpNum !== null && mrpNum > priceNum && mrpNum > 0) {
      const pct = Math.round(((mrpNum - priceNum) / mrpNum) * 100);
      if (pct > 0) computedDiscount = `${pct}% OFF`;
    }

    const categoryLabel =
      (catId && categoryNameById?.get(catId)) || (catId ? 'Store Item' : 'General');

    return {
      id: String(p.id),
      name: String(p.name),
      unit: p.unit ? String(p.unit) : '1 unit',
      price: priceNum,
      mrp: mrpNum,
      pricePlaceholder: formatCurrencyOrPlaceholder(priceNum, '₹[Price Unset]'),
      mrpPlaceholder: mrpNum !== null ? formatCurrencyOrPlaceholder(mrpNum, '') : '',
      discountPercent: computedDiscount,
      category: categoryLabel,
      categoryId: catId,
      imageUrl: p.image_url ? String(p.image_url) : undefined,
      inStock: Boolean(p.in_stock),
      isPopular: Boolean(p.is_popular),
      isNewArrival: Boolean(p.is_new_arrival),
      displayOrder: Number(p.display_order || 0),
      isDemoItem: false,
    };
  });
}

/**
 * Safe helper to query public catalog products.
 * Seamlessly falls back to local products when Supabase is unconfigured or unavailable.
 */
export async function getCatalogProducts<T>(fallbackData: T[]): Promise<T[]> {
  if (!supabase) {
    return fallbackData;
  }

  try {
    const { data, error } = await supabase
      .from('public_catalog')
      .select('*')
      .order('display_order', { ascending: true });

    if (error || !data || data.length === 0) {
      return fallbackData;
    }

    return data as unknown as T[];
  } catch (err) {
    console.warn('Falling back to local demo catalog:', err);
    return fallbackData;
  }
}

export interface StorefrontCatalogPayload {
  categories: Category[];
  products: DemoProduct[];
  storeConfig: StoreConfig;
  isLiveData: boolean;
  connectionStatus: SupabaseConnectionState;
  error: string | null;
}

/**
 * Resolve a consistent status notice that never contradicts `isOpen`.
 */
function resolveConsistentStatusNotice(isOpen: boolean, rawNotice: unknown): string {
  const notice = typeof rawNotice === 'string' ? rawNotice.trim() : '';
  if (!notice) {
    return isOpen
      ? 'Store is currently OPEN for orders.'
      : 'Store is temporarily closed while configuration is being finalized.';
  }
  const lower = notice.toLowerCase();
  if (isOpen && lower.includes('closed')) {
    return 'Store is currently OPEN for orders.';
  }
  if (!isOpen && lower.includes('currently open')) {
    return 'Store is temporarily closed.';
  }
  return notice;
}

/**
 * Fetch live categories (`public.categories`), catalog (`public.public_catalog`),
 * and store settings (`public.public_store_settings`) from Supabase.
 * - When Supabase is not configured: returns labelled Demo Mode (`connectionStatus = 'demo'`, `isLiveData = false`).
 * - When Supabase IS configured and succeeds: returns `connectionStatus = 'connected'`, `isLiveData = true`.
 * - When Supabase IS configured and fails: returns `connectionStatus = 'error'`, `isLiveData = false`,
 *   with zero fake demo items and a truthful error state across Header, Banner, Grid, and Footer.
 */
export async function fetchStorefrontCatalogAndSettings(): Promise<StorefrontCatalogPayload> {
  if (!supabase) {
    if (currentEnvResolution.isBlocked) {
      const setupMsg =
        currentEnvResolution.setupMessage ||
        'Supabase environment failed safety validation. Check environment configuration.';
      return {
        categories: CATEGORIES,
        products: [],
        storeConfig: {
          ...STORE_INITIAL_CONFIG,
          isOpen: false,
          statusNotice: setupMsg,
          isLiveData: false,
          connectionStatus: 'error',
          connectionError: setupMsg,
        },
        isLiveData: false,
        connectionStatus: 'error',
        error: setupMsg,
      };
    }

    return {
      categories: CATEGORIES,
      products: DEMO_PRODUCTS,
      storeConfig: {
        ...STORE_INITIAL_CONFIG,
        isLiveData: false,
        connectionStatus: 'demo',
        connectionError: null,
      },
      isLiveData: false,
      connectionStatus: 'demo',
      error: null,
    };
  }

  try {
    const [mappedCategories, settingsRes] = await Promise.all([
      fetchPublicCategories(),
      supabase.from('public_store_settings').select('*').maybeSingle(),
    ]);

    if (settingsRes.error) throw new Error(settingsRes.error.message);

    const categoryNameById = new Map<string, string>();
    for (const c of mappedCategories) {
      if (c.id !== 'all') {
        categoryNameById.set(c.id, c.name);
      }
    }

    const mappedProducts = await fetchPublicCatalogProducts(categoryNameById);

    const s = settingsRes.data as Record<string, unknown> | null;
    const isOpen = s ? Boolean(s.is_open) : false;
    const deliveryFeeNum =
      s && s.delivery_fee !== null && s.delivery_fee !== undefined ? Number(s.delivery_fee) : null;
    const freeThresholdNum =
      s && s.free_delivery_threshold !== null && s.free_delivery_threshold !== undefined
        ? Number(s.free_delivery_threshold)
        : null;
    const minOrderNum =
      s && s.min_order_amount !== null && s.min_order_amount !== undefined
        ? Number(s.min_order_amount)
        : null;
    const radiusNum =
      s && s.delivery_radius_km !== null && s.delivery_radius_km !== undefined
        ? Number(s.delivery_radius_km)
        : null;

    const liveStoreConfig: StoreConfig = {
      isOpen,
      statusNotice: resolveConsistentStatusNotice(isOpen, s?.status_notice),
      addressPlaceholder:
        s && s.store_address ? String(s.store_address) : STORE_INITIAL_CONFIG.addressPlaceholder,
      hoursPlaceholder:
        s && s.opening_hours ? String(s.opening_hours) : STORE_INITIAL_CONFIG.hoursPlaceholder,
      phonePlaceholder:
        s && s.support_phone ? String(s.support_phone) : STORE_INITIAL_CONFIG.phonePlaceholder,
      deliveryFeePlaceholder: formatCurrencyOrPlaceholder(
        deliveryFeeNum,
        STORE_INITIAL_CONFIG.deliveryFeePlaceholder
      ),
      freeDeliveryThresholdPlaceholder: formatCurrencyOrPlaceholder(
        freeThresholdNum,
        STORE_INITIAL_CONFIG.freeDeliveryThresholdPlaceholder
      ),
      fssaiPlaceholder:
        s && s.fssai_license_number
          ? String(s.fssai_license_number)
          : STORE_INITIAL_CONFIG.fssaiPlaceholder,
      deliveryFee: deliveryFeeNum,
      freeDeliveryThreshold: freeThresholdNum,
      minOrderAmount: minOrderNum,
      deliveryRadiusKm: radiusNum,
      serviceablePincodes:
        s && Array.isArray(s.serviceable_pincodes)
          ? (s.serviceable_pincodes as string[]).map((p) => String(p).trim()).filter(Boolean)
          : null,
      bannerMessage: s && s.banner_message ? String(s.banner_message) : null,
      isLiveData: true,
      connectionStatus: 'connected',
      connectionError: null,
    };

    return {
      categories: mappedCategories,
      products: mappedProducts,
      storeConfig: liveStoreConfig,
      isLiveData: true,
      connectionStatus: 'connected',
      error: null,
    };
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : 'Failed to load live storefront catalog.';
    const detailedError = rawMsg.toLowerCase().includes('failed to fetch')
      ? `${rawMsg} — Could not reach ${supabaseUrl}. Verify your internet connection, ensure your Supabase project is active (not paused), and check that no browser extension or firewall is blocking *.supabase.co.`
      : rawMsg;

    return {
      categories: [{ id: 'all', name: 'All Categories' }],
      products: [],
      storeConfig: {
        ...STORE_INITIAL_CONFIG,
        isOpen: false,
        statusNotice: 'Store status unavailable (unable to connect to Supabase)',
        isLiveData: false,
        connectionStatus: 'error',
        connectionError: detailedError,
      },
      isLiveData: false,
      connectionStatus: 'error',
      error: detailedError,
    };
  }
}

// ============================================================================
// AUTHENTICATION & PROFILE HELPERS
// ============================================================================

export function normalizeIndianPhone(rawPhone: string): string {
  const digits = rawPhone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `+91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+${digits}`;
  }
  if (rawPhone.trim().startsWith('+')) {
    return rawPhone.trim();
  }
  return `+${digits}`;
}

export async function sendPhoneOtp(rawPhone: string): Promise<{ normalizedPhone: string }> {
  if (!supabase) {
    throw new Error(
      'Supabase environment variables (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY) are not configured. Phone OTP requires a connected Supabase project with an active SMS OTP provider.'
    );
  }
  const normalizedPhone = normalizeIndianPhone(rawPhone);
  if (!/^\+\d{10,15}$/.test(normalizedPhone)) {
    throw new Error('Please enter a valid 10-digit mobile number.');
  }

  const { error } = await supabase.auth.signInWithOtp({
    phone: normalizedPhone,
  });

  if (error) {
    if (
      error.message.toLowerCase().includes('sms') ||
      error.message.toLowerCase().includes('phone') ||
      error.message.toLowerCase().includes('provider')
    ) {
      throw new Error(
        `Supabase Phone OTP error: ${error.message}. Ensure Phone Auth and an SMS provider (e.g., Twilio/MessageBird) are enabled in Supabase Auth settings.`
      );
    }
    throw new Error(error.message);
  }

  return { normalizedPhone };
}

export async function verifyPhoneOtp(
  normalizedPhone: string,
  otpToken: string,
  fullName?: string
): Promise<UserProfile | null> {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }
  const cleanToken = otpToken.trim();
  if (!/^\d{4,8}$/.test(cleanToken)) {
    throw new Error('Please enter the 6-digit OTP code sent to your phone.');
  }

  const { data, error } = await supabase.auth.verifyOtp({
    phone: normalizedPhone,
    token: cleanToken,
    type: 'sms',
  });

  if (error) {
    throw new Error(error.message);
  }

  const user = data.user;
  if (!user) {
    return null;
  }

  if (fullName && fullName.trim().length > 0) {
    await supabase
      .from('profiles')
      .update({ full_name: fullName.trim(), updated_at: new Date().toISOString() })
      .eq('id', user.id);
  }

  return fetchCurrentUserProfile(user.id);
}

export async function signInWithEmailPassword(
  email: string,
  password: string
): Promise<UserProfile | null> {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env to sign in.'
    );
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data.user) return null;
  return fetchCurrentUserProfile(data.user.id);
}

export async function signUpWithEmailPassword(
  email: string,
  password: string,
  fullName?: string
): Promise<{ user: unknown; profile: UserProfile | null; needsEmailConfirmation: boolean }> {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env to register.'
    );
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanName = fullName?.trim() || '';

  const { data, error } = await supabase.auth.signUp({
    email: cleanEmail,
    password,
    options: {
      data: {
        full_name: cleanName,
      },
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  const user = data.user;
  const needsEmailConfirmation = !data.session;
  let profile: UserProfile | null = null;
  if (user && data.session) {
    profile = await fetchCurrentUserProfile(user.id);
  }

  return { user, profile, needsEmailConfirmation };
}

export async function resetPasswordForEmail(email: string): Promise<void> {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  const cleanEmail = email.trim().toLowerCase();
  const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/` : undefined;
  const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
    redirectTo,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function fetchCurrentUserProfile(userId: string): Promise<UserProfile | null> {
  if (!supabase || !userId) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, phone, full_name, role, created_at, updated_at')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) return null;

  let email: string | null = null;
  try {
    const { data: authData } = await supabase.auth.getSession();
    if (authData.session?.user?.id === userId) {
      email = authData.session.user.email || null;
    }
  } catch {
    // Session read is best-effort
  }

  return {
    id: String(data.id),
    phone: data.phone ? String(data.phone) : null,
    email,
    full_name: data.full_name ? String(data.full_name) : null,
    role: (data.role as UserRole) || 'customer',
    created_at: data.created_at ? String(data.created_at) : undefined,
    updated_at: data.updated_at ? String(data.updated_at) : undefined,
  };
}

export async function updateUserProfile(
  userId: string,
  updates: { full_name?: string }
): Promise<UserProfile> {
  if (!supabase) throw new Error('Supabase is not configured.');

  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (updates.full_name !== undefined) payload.full_name = updates.full_name.trim() || null;

  const { data, error } = await supabase
    .from('profiles')
    .update(payload)
    .eq('id', userId)
    .select('id, phone, full_name, role, created_at, updated_at')
    .single();

  if (error) throw new Error(error.message);
  return data as UserProfile;
}

export async function signOutUser(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}

// ============================================================================
// PERSISTENT CUSTOMER CART (public.carts & public.cart_items)
// ============================================================================

async function getOrCreateUserCartId(userId: string): Promise<string | null> {
  if (!supabase) return null;

  const { data: existing, error: selErr } = await supabase
    .from('carts')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (!selErr && existing?.id) {
    return String(existing.id);
  }

  const { data: created, error: insErr } = await supabase
    .from('carts')
    .upsert({ user_id: userId }, { onConflict: 'user_id' })
    .select('id')
    .single();

  if (insErr || !created) return null;
  return String(created.id);
}

export async function fetchCustomerCartFromDb(userId: string): Promise<Record<string, number>> {
  if (!supabase) return {};
  const cartId = await getOrCreateUserCartId(userId);
  if (!cartId) return {};

  const { data, error } = await supabase
    .from('cart_items')
    .select('product_id, quantity')
    .eq('cart_id', cartId);

  if (error || !data) return {};

  const map: Record<string, number> = {};
  for (const row of data) {
    if (row.product_id && Number(row.quantity) > 0) {
      map[String(row.product_id)] = Number(row.quantity);
    }
  }
  return map;
}

export async function syncCustomerCartItemToDb(
  userId: string,
  productId: string,
  quantity: number
): Promise<void> {
  if (!supabase) return;
  const cartId = await getOrCreateUserCartId(userId);
  if (!cartId) return;

  if (quantity <= 0) {
    await supabase
      .from('cart_items')
      .delete()
      .eq('cart_id', cartId)
      .eq('product_id', productId);
  } else {
    await supabase.from('cart_items').upsert(
      {
        cart_id: cartId,
        product_id: productId,
        quantity,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'cart_id,product_id' }
    );
  }
}

export async function clearCustomerCartInDb(userId: string): Promise<void> {
  if (!supabase) return;
  const cartId = await getOrCreateUserCartId(userId);
  if (!cartId) return;
  await supabase.from('cart_items').delete().eq('cart_id', cartId);
}

// ============================================================================
// CUSTOMER ADDRESSES (public.addresses)
// ============================================================================

export async function fetchCustomerAddresses(userId: string): Promise<CustomerAddress[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('addresses')
    .select('*')
    .eq('user_id', userId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data || []) as CustomerAddress[];
}

export async function saveCustomerAddress(
  userId: string,
  address: {
    id?: string;
    address_line: string;
    landmark?: string | null;
    pincode: string;
    is_default?: boolean;
  }
): Promise<CustomerAddress> {
  if (!supabase) throw new Error('Supabase is not configured.');

  const cleanLine = address.address_line.trim();
  const cleanPin = address.pincode.trim();
  const cleanLandmark = address.landmark?.trim() || null;

  if (cleanLine.length < 5) {
    throw new Error('Address line must be at least 5 characters.');
  }
  if (!/^\d{6}$/.test(cleanPin)) {
    throw new Error('Pincode must be a valid 6-digit number.');
  }

  if (address.is_default) {
    await supabase.from('addresses').update({ is_default: false }).eq('user_id', userId);
  }

  if (address.id) {
    const { data, error } = await supabase
      .from('addresses')
      .update({
        address_line: cleanLine,
        landmark: cleanLandmark,
        pincode: cleanPin,
        is_default: Boolean(address.is_default),
      })
      .eq('id', address.id)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return data as CustomerAddress;
  } else {
    const { data, error } = await supabase
      .from('addresses')
      .insert({
        user_id: userId,
        address_line: cleanLine,
        landmark: cleanLandmark,
        pincode: cleanPin,
        is_default: Boolean(address.is_default),
      })
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return data as CustomerAddress;
  }
}

export async function deleteCustomerAddress(userId: string, addressId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { error } = await supabase
    .from('addresses')
    .delete()
    .eq('id', addressId)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}

// ============================================================================
// ORDER PLACEMENT, TRACKING & CANCELLATION (RPCs)
// ============================================================================

export interface PlaceOrderRpcResult {
  success: boolean;
  order_id: string;
  order_number: string;
  subtotal: number;
  delivery_fee: number;
  discount_amount: number;
  total_amount: number;
  status: OrderStatus;
}

export async function placeOrderViaRpc(params: {
  items: Array<{ product_id: string; quantity: number }>;
  deliveryMode: DeliveryMode;
  addressId: string | null;
  paymentMethod?: PaymentMethod;
}): Promise<PlaceOrderRpcResult> {
  if (!supabase) {
    throw new Error('Supabase is not configured. Live order placement requires Supabase connection.');
  }

  const { data, error } = await supabase.rpc('place_order', {
    p_items: params.items,
    p_delivery_mode: params.deliveryMode,
    p_address_id: params.deliveryMode === 'delivery' ? params.addressId : null,
    p_payment_method: params.paymentMethod || 'cod',
  });

  if (error) {
    throw new Error(error.message);
  }

  return data as PlaceOrderRpcResult;
}

export async function fetchCustomerOrders(userId: string): Promise<OrderRecord[]> {
  if (!supabase) return [];

  const { data: ordersData, error: ordersErr } = await supabase
    .from('orders')
    .select(
      `
      *,
      items:order_items(*),
      history:order_status_history(*)
    `
    )
    .eq('customer_id', userId)
    .order('created_at', { ascending: false });

  if (ordersErr) throw new Error(ordersErr.message);

  const rawOrders = (ordersData || []) as OrderRecord[];

  // Fetch assigned rider contact info for any order that has a delivery_partner_id
  const enriched = await Promise.all(
    rawOrders.map(async (ord) => {
      let riderInfo: OrderRiderInfo | null = null;
      if (ord.delivery_partner_id && supabase) {
        const { data: rData } = await supabase.rpc('get_order_rider_info', {
          p_order_id: ord.id,
        });
        if (rData) {
          riderInfo = rData as OrderRiderInfo;
        }
      }
      const sortedHistory = [...(ord.history || [])].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      return {
        ...ord,
        subtotal: Number(ord.subtotal),
        delivery_fee: Number(ord.delivery_fee),
        discount_amount: Number(ord.discount_amount),
        total_amount: Number(ord.total_amount),
        items: (ord.items || []).map((i) => ({
          ...i,
          unit_price: Number(i.unit_price),
          quantity: Number(i.quantity),
          total_price: Number(i.total_price),
        })),
        history: sortedHistory,
        rider_info: riderInfo,
      };
    })
  );

  return enriched;
}

export async function cancelCustomerOrderViaRpc(
  orderId: string,
  reason?: string
): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { error } = await supabase.rpc('customer_cancel_order', {
    p_order_id: orderId,
    p_reason: reason?.trim() || 'Cancelled by customer before packing',
  });
  if (error) throw new Error(error.message);
}

// ============================================================================
// OWNER ADMIN DASHBOARD OPERATIONS (/admin)
// ============================================================================

export interface AdminDashboardBundle {
  orders: OrderRecord[];
  products: AdminProductRow[];
  categories: Category[];
  settings: AdminStoreSettingsRow;
  profiles: UserProfile[];
  riders: DeliveryPartner[];
}

export async function fetchAdminAllData(): Promise<AdminDashboardBundle> {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  const [ordersRes, prodsRes, invRes, catsRes, settingsRes, profilesRes, ridersRes] =
    await Promise.all([
      supabase
        .from('orders')
        .select('*, items:order_items(*), history:order_status_history(*)')
        .order('created_at', { ascending: false }),
      supabase.from('products').select('*').order('display_order', { ascending: true }),
      supabase.from('inventory').select('*'),
      supabase.from('categories').select('*').order('display_order', { ascending: true }),
      supabase.from('store_settings').select('*').eq('config_id', 'primary').maybeSingle(),
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('delivery_partners').select('*').order('created_at', { ascending: false }),
    ]);

  if (ordersRes.error) throw new Error(ordersRes.error.message);
  if (prodsRes.error) throw new Error(prodsRes.error.message);
  if (invRes.error) throw new Error(invRes.error.message);
  if (catsRes.error) throw new Error(catsRes.error.message);
  if (settingsRes.error) throw new Error(settingsRes.error.message);
  if (profilesRes.error) throw new Error(profilesRes.error.message);
  if (ridersRes.error) throw new Error(ridersRes.error.message);

  const profilesList = (profilesRes.data || []) as UserProfile[];
  const profileMap = new Map(profilesList.map((p) => [p.id, p]));

  const invMap = new Map<
    string,
    { stock_quantity: number; low_stock_threshold: number; updated_at?: string }
  >();
  for (const row of invRes.data || []) {
    invMap.set(String(row.product_id), {
      stock_quantity: Number(row.stock_quantity ?? 0),
      low_stock_threshold: Number(row.low_stock_threshold ?? 5),
      updated_at: row.updated_at ? String(row.updated_at) : undefined,
    });
  }

  const products: AdminProductRow[] = (prodsRes.data || []).map((p: Record<string, unknown>) => {
    const pid = String(p.id);
    const inv = invMap.get(pid) || { stock_quantity: 0, low_stock_threshold: 5 };
    return {
      id: pid,
      category_id: p.category_id ? String(p.category_id) : null,
      name: String(p.name),
      unit: p.unit ? String(p.unit) : null,
      price: p.price !== null && p.price !== undefined ? Number(p.price) : null,
      mrp: p.mrp !== null && p.mrp !== undefined ? Number(p.mrp) : null,
      discount_percent: p.discount_percent ? String(p.discount_percent) : null,
      image_url: p.image_url ? String(p.image_url) : null,
      is_active: Boolean(p.is_active),
      is_popular: Boolean(p.is_popular),
      is_new_arrival: Boolean(p.is_new_arrival),
      display_order: Number(p.display_order || 0),
      created_at: p.created_at ? String(p.created_at) : undefined,
      stock_quantity: inv.stock_quantity,
      low_stock_threshold: inv.low_stock_threshold,
      inventory_updated_at: inv.updated_at,
    };
  });

  const categories: Category[] = (catsRes.data || []).map((c: Record<string, unknown>) => ({
    id: String(c.id),
    name: String(c.name),
    slug: c.slug ? String(c.slug) : null,
    display_order: Number(c.display_order || 0),
    is_active: Boolean(c.is_active),
  }));

  const riders: DeliveryPartner[] = (ridersRes.data || []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    user_id: String(r.user_id),
    is_online: Boolean(r.is_online),
    vehicle_details: r.vehicle_details ? String(r.vehicle_details) : null,
    created_at: r.created_at ? String(r.created_at) : undefined,
    profile: profileMap.get(String(r.user_id)),
  }));

  const orders: OrderRecord[] = (ordersRes.data || []).map((o: Record<string, unknown>) => {
    const cust = profileMap.get(String(o.customer_id));
    const addr = (o.delivery_address || {}) as Record<string, unknown>;
    const rawHistory = (o.history as Array<Record<string, unknown>>) || [];
    const rawItems = (o.items as Array<Record<string, unknown>>) || [];
    return {
      id: String(o.id),
      order_number: String(o.order_number),
      customer_id: String(o.customer_id),
      delivery_partner_id: o.delivery_partner_id ? String(o.delivery_partner_id) : null,
      delivery_mode: (o.delivery_mode as DeliveryMode) || 'delivery',
      status: (o.status as OrderStatus) || 'placed',
      subtotal: Number(o.subtotal || 0),
      delivery_fee: Number(o.delivery_fee || 0),
      discount_amount: Number(o.discount_amount || 0),
      total_amount: Number(o.total_amount || 0),
      delivery_address: addr,
      payment_method: (o.payment_method as PaymentMethod) || 'cod',
      cancel_reason: o.cancel_reason ? String(o.cancel_reason) : null,
      created_at: String(o.created_at),
      updated_at: String(o.updated_at),
      customer_name: cust?.full_name || (addr.customer_name as string) || 'Customer',
      customer_phone: cust?.phone || (addr.customer_phone as string) || null,
      items: rawItems.map((i) => ({
        id: String(i.id),
        order_id: String(i.order_id),
        product_id: i.product_id ? String(i.product_id) : null,
        product_name: String(i.product_name),
        unit_price: Number(i.unit_price || 0),
        unit: i.unit ? String(i.unit) : null,
        quantity: Number(i.quantity || 1),
        total_price: Number(i.total_price || 0),
      })),
      history: rawHistory
        .map((h) => ({
          id: String(h.id),
          order_id: String(h.order_id),
          status: h.status as OrderStatus,
          note: h.note ? String(h.note) : null,
          created_at: String(h.created_at),
        }))
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    };
  });

  const rawSettings = (settingsRes.data || {}) as Record<string, unknown>;
  const normalizedSettings: AdminStoreSettingsRow = {
    config_id: 'primary',
    is_open: Boolean(rawSettings.is_open),
    status_notice:
      rawSettings.status_notice !== undefined && rawSettings.status_notice !== null
        ? String(rawSettings.status_notice)
        : STORE_INITIAL_CONFIG.statusNotice,
    store_address:
      rawSettings.store_address !== undefined && rawSettings.store_address !== null
        ? String(rawSettings.store_address)
        : STORE_INITIAL_CONFIG.addressPlaceholder,
    opening_hours:
      rawSettings.opening_hours !== undefined && rawSettings.opening_hours !== null
        ? String(rawSettings.opening_hours)
        : STORE_INITIAL_CONFIG.hoursPlaceholder,
    support_phone:
      rawSettings.support_phone !== undefined && rawSettings.support_phone !== null
        ? String(rawSettings.support_phone)
        : STORE_INITIAL_CONFIG.phonePlaceholder,
    delivery_fee:
      rawSettings.delivery_fee !== null && rawSettings.delivery_fee !== undefined
        ? Number(rawSettings.delivery_fee)
        : null,
    free_delivery_threshold:
      rawSettings.free_delivery_threshold !== null &&
      rawSettings.free_delivery_threshold !== undefined
        ? Number(rawSettings.free_delivery_threshold)
        : null,
    min_order_amount:
      rawSettings.min_order_amount !== null && rawSettings.min_order_amount !== undefined
        ? Number(rawSettings.min_order_amount)
        : null,
    delivery_radius_km:
      rawSettings.delivery_radius_km !== null && rawSettings.delivery_radius_km !== undefined
        ? Number(rawSettings.delivery_radius_km)
        : null,
    serviceable_pincodes:
      Array.isArray(rawSettings.serviceable_pincodes)
        ? (rawSettings.serviceable_pincodes as string[]).map((p) => String(p).trim()).filter(Boolean)
        : null,
    fssai_license_number:
      rawSettings.fssai_license_number !== undefined && rawSettings.fssai_license_number !== null
        ? String(rawSettings.fssai_license_number)
        : STORE_INITIAL_CONFIG.fssaiPlaceholder,
    banner_message:
      rawSettings.banner_message !== undefined && rawSettings.banner_message !== null
        ? String(rawSettings.banner_message)
        : null,
    updated_at: rawSettings.updated_at ? String(rawSettings.updated_at) : undefined,
  };

  return {
    orders,
    products,
    categories,
    settings: normalizedSettings,
    profiles: profilesList,
    riders,
  };
}

export async function adminUpdateOrderStatus(
  orderId: string,
  newStatus: OrderStatus,
  note?: string
): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');
  if (newStatus === 'cancelled') {
    throw new Error('Use adminCancelOrderViaRpc with a cancellation reason to cancel orders.');
  }

  const { data: currentOrder, error: fetchErr } = await supabase
    .from('orders')
    .select('status, delivery_mode')
    .eq('id', orderId)
    .single();

  if (fetchErr || !currentOrder) {
    throw new Error(fetchErr?.message || 'Order not found.');
  }

  if (currentOrder.status === 'cancelled' || currentOrder.status === 'delivered') {
    throw new Error(`Cannot change status of an order that is already ${currentOrder.status}.`);
  }

  if (currentOrder.delivery_mode === 'pickup' && newStatus === 'out_for_delivery') {
    throw new Error(
      'Store pickup orders cannot be marked "Out for Delivery". Mark as "Ready" or "Delivered".'
    );
  }

  const { error: updErr } = await supabase
    .from('orders')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', orderId);
  if (updErr) throw new Error(updErr.message);

  const { error: histErr } = await supabase.from('order_status_history').insert({
    order_id: orderId,
    status: newStatus,
    note: note?.trim() || `Status updated to ${newStatus} by owner`,
  });
  if (histErr) throw new Error(histErr.message);
}

export async function adminCancelOrderViaRpc(orderId: string, reason: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { error } = await supabase.rpc('admin_cancel_order', {
    p_order_id: orderId,
    p_reason: reason.trim(),
  });
  if (error) throw new Error(error.message);
}

export async function adminAssignOrderRider(
  orderId: string,
  deliveryPartnerId: string | null,
  currentStatus: OrderStatus
): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');

  const { data: currentOrder, error: fetchErr } = await supabase
    .from('orders')
    .select('status, delivery_mode')
    .eq('id', orderId)
    .single();

  if (fetchErr || !currentOrder) {
    throw new Error(fetchErr?.message || 'Order not found.');
  }

  if (currentOrder.status === 'cancelled' || currentOrder.status === 'delivered') {
    throw new Error(`Cannot assign or change rider on a ${currentOrder.status} order.`);
  }

  if (currentOrder.delivery_mode === 'pickup' && deliveryPartnerId !== null) {
    throw new Error('Cannot assign a delivery rider to a store self-pickup order.');
  }

  const { error } = await supabase
    .from('orders')
    .update({
      delivery_partner_id: deliveryPartnerId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId);
  if (error) throw new Error(error.message);

  const { error: histErr } = await supabase.from('order_status_history').insert({
    order_id: orderId,
    status: currentStatus,
    note: deliveryPartnerId
      ? 'Delivery rider assigned by store owner'
      : 'Delivery rider unassigned by store owner',
  });
  if (histErr) throw new Error(histErr.message);
}

export async function adminSaveCategory(category: {
  id?: string;
  name: string;
  slug?: string | null;
  display_order?: number;
  is_active?: boolean;
}): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const cleanName = category.name.trim();
  if (!cleanName) throw new Error('Category name is required.');

  const generatedSlug = cleanName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const slug =
    category.slug?.trim() ||
    generatedSlug ||
    `cat-${Date.now().toString(36)}`;

  // Check for duplicate category name or slug before writing
  const { data: existingCats, error: checkErr } = await supabase
    .from('categories')
    .select('id, name, slug');
  if (checkErr) throw new Error(checkErr.message);

  for (const existing of existingCats || []) {
    if (category.id && String(existing.id) === category.id) continue;
    const sameName = String(existing.name || '').trim().toLowerCase() === cleanName.toLowerCase();
    const sameSlug =
      existing.slug && String(existing.slug).trim().toLowerCase() === slug.toLowerCase();
    if (sameName || sameSlug) {
      throw new Error(`A category with the name "${cleanName}" or slug "${slug}" already exists.`);
    }
  }

  const displayOrderNum = Number(category.display_order ?? 0);
  const payload = {
    name: cleanName,
    slug,
    display_order: Number.isFinite(displayOrderNum) ? Math.floor(displayOrderNum) : 0,
    is_active: category.is_active !== false,
  };

  if (category.id) {
    const { error } = await supabase.from('categories').update(payload).eq('id', category.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from('categories').insert(payload);
    if (error) throw new Error(error.message);
  }
}

export async function adminDeleteCategory(categoryId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { error } = await supabase.from('categories').delete().eq('id', categoryId);
  if (error) throw new Error(error.message);
}

export async function adminSaveProduct(params: {
  id?: string;
  category_id: string | null;
  name: string;
  unit: string;
  price: number | null;
  mrp: number | null;
  discount_percent?: string | null;
  image_url?: string | null;
  is_active: boolean;
  is_popular: boolean;
  is_new_arrival: boolean;
  display_order: number;
  stock_quantity: number;
  low_stock_threshold: number;
}): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const cleanName = params.name.trim();
  if (!cleanName) throw new Error('Product name is required.');
  if (params.price !== null && (!Number.isFinite(params.price) || params.price < 0)) {
    throw new Error('Price must be a valid non-negative number.');
  }
  if (params.mrp !== null && (!Number.isFinite(params.mrp) || params.mrp < 0)) {
    throw new Error('MRP must be a valid non-negative number.');
  }
  if (params.price !== null && params.mrp !== null && params.mrp < params.price) {
    throw new Error('Selling price cannot exceed MRP.');
  }
  if (!Number.isFinite(params.stock_quantity) || params.stock_quantity < 0) {
    throw new Error('Stock quantity cannot be negative.');
  }
  if (!Number.isFinite(params.low_stock_threshold) || params.low_stock_threshold < 0) {
    throw new Error('Low-stock threshold cannot be negative.');
  }

  const prodPayload = {
    category_id: params.category_id || null,
    name: cleanName,
    unit: params.unit.trim() || '1 unit',
    price: params.price,
    mrp: params.mrp,
    discount_percent: params.discount_percent?.trim() || null,
    image_url: params.image_url?.trim() || null,
    is_active: params.is_active,
    is_popular: params.is_popular,
    is_new_arrival: params.is_new_arrival,
    display_order: Number.isFinite(params.display_order) ? Math.floor(params.display_order) : 0,
  };

  let productId = params.id;
  if (productId) {
    const { error } = await supabase.from('products').update(prodPayload).eq('id', productId);
    if (error) throw new Error(error.message);
  } else {
    const { data, error } = await supabase
      .from('products')
      .insert(prodPayload)
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    productId = String(data.id);
  }

  const { error: invErr } = await supabase.from('inventory').upsert(
    {
      product_id: productId,
      stock_quantity: Math.max(0, Math.floor(params.stock_quantity)),
      low_stock_threshold: Math.max(0, Math.floor(params.low_stock_threshold)),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'product_id' }
  );
  if (invErr) throw new Error(invErr.message);
}

export async function adminDeleteProduct(productId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { error } = await supabase.from('products').delete().eq('id', productId);
  if (error) throw new Error(error.message);
}

export async function adminUpdateProductStock(
  productId: string,
  stockQuantity: number,
  lowStockThreshold: number
): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');
  if (!Number.isFinite(stockQuantity) || stockQuantity < 0) {
    throw new Error('Stock quantity cannot be negative.');
  }
  if (!Number.isFinite(lowStockThreshold) || lowStockThreshold < 0) {
    throw new Error('Low-stock threshold cannot be negative.');
  }

  const { error } = await supabase.from('inventory').upsert(
    {
      product_id: productId,
      stock_quantity: Math.floor(stockQuantity),
      low_stock_threshold: Math.max(0, Math.floor(lowStockThreshold)),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'product_id' }
  );
  if (error) throw new Error(error.message);
}

export async function adminSaveStoreSettings(
  settings: Partial<AdminStoreSettingsRow>
): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');

  const fee =
    settings.delivery_fee !== null && settings.delivery_fee !== undefined
      ? Number(settings.delivery_fee)
      : null;
  if (fee !== null && (!Number.isFinite(fee) || fee < 0)) {
    throw new Error('Delivery fee must be a non-negative number or left blank (NULL).');
  }

  const freeThreshold =
    settings.free_delivery_threshold !== null && settings.free_delivery_threshold !== undefined
      ? Number(settings.free_delivery_threshold)
      : null;
  if (freeThreshold !== null && (!Number.isFinite(freeThreshold) || freeThreshold < 0)) {
    throw new Error('Free-delivery threshold must be a non-negative number or left blank (NULL).');
  }

  const minOrder =
    settings.min_order_amount !== null && settings.min_order_amount !== undefined
      ? Number(settings.min_order_amount)
      : null;
  if (minOrder !== null && (!Number.isFinite(minOrder) || minOrder < 0)) {
    throw new Error('Minimum order amount must be a non-negative number or left blank (NULL).');
  }

  const radius =
    settings.delivery_radius_km !== null && settings.delivery_radius_km !== undefined
      ? Number(settings.delivery_radius_km)
      : null;
  if (radius !== null && (!Number.isFinite(radius) || radius <= 0)) {
    throw new Error(
      'Delivery radius must be greater than 0 km, or left blank (NULL) if unconfigured.'
    );
  }

  const isOpenBool = Boolean(settings.is_open);
  const payload = {
    is_open: isOpenBool,
    status_notice: resolveConsistentStatusNotice(isOpenBool, settings.status_notice),
    store_address: settings.store_address?.trim() || null,
    opening_hours: settings.opening_hours?.trim() || null,
    support_phone: settings.support_phone?.trim() || null,
    delivery_fee: fee,
    free_delivery_threshold: freeThreshold,
    min_order_amount: minOrder,
    delivery_radius_km: radius,
    serviceable_pincodes: Array.isArray(settings.serviceable_pincodes)
      ? settings.serviceable_pincodes.map((p) => String(p).trim()).filter(Boolean)
      : null,
    fssai_license_number: settings.fssai_license_number?.trim() || null,
    banner_message: settings.banner_message?.trim() || null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('store_settings')
    .update(payload)
    .eq('config_id', 'primary');
  if (error) throw new Error(error.message);
}

/**
 * Immediate 1-click store OPEN / CLOSED control for the owner.
 * Updates only `is_open` and `status_notice` on `public.store_settings` (`config_id = 'primary'`),
 * preserving all other store configuration, existing orders, statuses, and customer data untouched.
 */
export async function adminToggleStoreOpen(
  nextIsOpen: boolean,
  customNotice?: string | null
): Promise<{ is_open: boolean; status_notice: string }> {
  if (!supabase) throw new Error('Supabase is not configured.');

  const isOpenBool = Boolean(nextIsOpen);
  const resolvedNotice = resolveConsistentStatusNotice(
    isOpenBool,
    customNotice !== undefined && customNotice !== null && customNotice.trim() !== ''
      ? customNotice.trim()
      : isOpenBool
      ? 'Store is currently OPEN for orders.'
      : 'Store is temporarily closed for new orders. Existing orders remain active.'
  );

  const { error } = await supabase
    .from('store_settings')
    .update({
      is_open: isOpenBool,
      status_notice: resolvedNotice,
      updated_at: new Date().toISOString(),
    })
    .eq('config_id', 'primary');

  if (error) throw new Error(error.message);
  return { is_open: isOpenBool, status_notice: resolvedNotice };
}

export async function adminSetUserRoleViaRpc(
  targetUserId: string,
  newRole: UserRole
): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { error } = await supabase.rpc('admin_set_user_role', {
    p_user_id: targetUserId,
    p_new_role: newRole,
  });
  if (error) throw new Error(error.message);
}

export async function adminUpdateRiderDetails(
  partnerId: string,
  updates: { vehicle_details?: string | null; is_online?: boolean }
): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const payload: Record<string, unknown> = {};
  if (updates.vehicle_details !== undefined) {
    payload.vehicle_details = updates.vehicle_details?.trim() || null;
  }
  if (updates.is_online !== undefined) {
    payload.is_online = Boolean(updates.is_online);
  }
  const { error } = await supabase
    .from('delivery_partners')
    .update(payload)
    .eq('id', partnerId);
  if (error) throw new Error(error.message);
}

const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MIME_TO_SAFE_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
const MAX_IMAGE_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export async function adminUploadProductImage(file: File): Promise<string> {
  if (!supabase) throw new Error('Supabase is not configured.');
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type)) {
    throw new Error('Invalid image format. Only JPEG, PNG, WebP, and GIF images are allowed.');
  }
  if (file.size <= 0) {
    throw new Error('Image file cannot be empty.');
  }
  if (file.size > MAX_IMAGE_FILE_SIZE_BYTES) {
    throw new Error('Image file exceeds the 5 MB maximum size limit.');
  }
  const ext = MIME_TO_SAFE_EXT[file.type] || 'jpg';
  const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const filePath = `catalog/${safeName}`;

  const { error: uploadErr } = await supabase.storage
    .from('product-images')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type,
    });

  if (uploadErr) {
    throw new Error(
      `Image upload failed: ${uploadErr.message}. Ensure the 'product-images' storage bucket exists in Supabase Storage.`
    );
  }

  const { data } = supabase.storage.from('product-images').getPublicUrl(filePath);
  return data.publicUrl;
}

export async function adminBulkImportCsvRows(
  rows: ParsedCsvProductRow[],
  existingCategories: Category[],
  existingProducts: AdminProductRow[] = []
): Promise<{ importedCount: number; createdCount: number; updatedCount: number }> {
  if (!supabase) throw new Error('Supabase is not configured.');

  const catByName = new Map<string, string>();
  for (const c of existingCategories) {
    catByName.set(c.name.toLowerCase().trim(), c.id);
  }

  const prodById = new Map<string, AdminProductRow>();
  const prodByNameUnit = new Map<string, AdminProductRow>();
  for (const p of existingProducts) {
    prodById.set(p.id.toLowerCase(), p);
    const key = `${p.name.trim().toLowerCase()}::${(p.unit || '1 unit').trim().toLowerCase()}`;
    prodByNameUnit.set(key, p);
  }

  let importedCount = 0;
  let createdCount = 0;
  let updatedCount = 0;

  for (const row of rows) {
    let categoryId: string | null = null;
    const catKey = row.category_name.toLowerCase().trim();
    if (catKey) {
      if (catByName.has(catKey)) {
        categoryId = catByName.get(catKey)!;
      } else {
        const cleanCatName = row.category_name.trim();
        const catSlug =
          catKey.replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') ||
          `cat-${Date.now().toString(36)}-${importedCount}`;
        const { data: newCat, error: catErr } = await supabase
          .from('categories')
          .insert({
            name: cleanCatName,
            slug: catSlug,
            is_active: true,
          })
          .select('id')
          .single();
        if (catErr) {
          throw new Error(`Failed to create category "${cleanCatName}": ${catErr.message}`);
        }
        if (newCat) {
          categoryId = String(newCat.id);
          catByName.set(catKey, categoryId);
        }
      }
    }

    const normKey = `${row.name.trim().toLowerCase()}::${row.unit.trim().toLowerCase()}`;
    const matchedExisting =
      (row.id ? prodById.get(row.id.toLowerCase()) : undefined) || prodByNameUnit.get(normKey);

    await adminSaveProduct({
      id: matchedExisting?.id,
      category_id: categoryId ?? matchedExisting?.category_id ?? null,
      name: row.name,
      unit: row.unit,
      price: row.price,
      mrp: row.mrp,
      discount_percent: row.discount_percent,
      image_url: matchedExisting?.image_url ?? null,
      is_active: row.is_active,
      is_popular: row.is_popular,
      is_new_arrival: row.is_new_arrival,
      display_order: matchedExisting ? matchedExisting.display_order : existingProducts.length + createdCount,
      stock_quantity: row.stock_quantity,
      low_stock_threshold: row.low_stock_threshold,
    });

    if (matchedExisting) {
      updatedCount++;
    } else {
      createdCount++;
    }
    importedCount++;
  }

  return { importedCount, createdCount, updatedCount };
}

// ============================================================================
// RIDER APPLICATION OPERATIONS (/rider)
// ============================================================================

export async function fetchRiderData(userId: string): Promise<{
  partner: DeliveryPartner | null;
  assignedOrders: OrderRecord[];
}> {
  if (!supabase) throw new Error('Supabase is not configured.');

  const [partnerRes, ordersRpcRes] = await Promise.all([
    supabase.from('delivery_partners').select('*').eq('user_id', userId).maybeSingle(),
    supabase.rpc('rider_get_assigned_orders'),
  ]);

  if (partnerRes.error) throw new Error(partnerRes.error.message);
  if (ordersRpcRes.error) throw new Error(ordersRpcRes.error.message);

  const partner: DeliveryPartner | null = partnerRes.data
    ? {
        id: String(partnerRes.data.id),
        user_id: String(partnerRes.data.user_id),
        is_online: Boolean(partnerRes.data.is_online),
        vehicle_details: partnerRes.data.vehicle_details
          ? String(partnerRes.data.vehicle_details)
          : null,
        created_at: partnerRes.data.created_at ? String(partnerRes.data.created_at) : undefined,
      }
    : null;

  const rawOrders = Array.isArray(ordersRpcRes.data) ? ordersRpcRes.data : [];
  const assignedOrders: OrderRecord[] = rawOrders.map((o: Record<string, unknown>) => ({
    id: String(o.id),
    order_number: String(o.order_number),
    customer_id: String(o.customer_id),
    delivery_partner_id: o.delivery_partner_id ? String(o.delivery_partner_id) : null,
    delivery_mode: (o.delivery_mode as DeliveryMode) || 'delivery',
    status: (o.status as OrderStatus) || 'placed',
    subtotal: Number(o.subtotal || 0),
    delivery_fee: Number(o.delivery_fee || 0),
    discount_amount: Number(o.discount_amount || 0),
    total_amount: Number(o.total_amount || 0),
    delivery_address: (o.delivery_address || {}) as Record<string, unknown>,
    payment_method: (o.payment_method as PaymentMethod) || 'cod',
    cancel_reason: o.cancel_reason ? String(o.cancel_reason) : null,
    created_at: String(o.created_at),
    updated_at: String(o.updated_at),
    customer_name: o.customer_name ? String(o.customer_name) : 'Customer',
    customer_phone: o.customer_phone ? String(o.customer_phone) : null,
    items: Array.isArray(o.items)
      ? o.items.map((i: Record<string, unknown>) => ({
          id: String(i.id),
          product_id: i.product_id ? String(i.product_id) : null,
          product_name: String(i.product_name),
          unit_price: Number(i.unit_price || 0),
          unit: i.unit ? String(i.unit) : null,
          quantity: Number(i.quantity || 1),
          total_price: Number(i.total_price || 0),
        }))
      : [],
    history: [],
  }));

  return { partner, assignedOrders };
}

export async function riderToggleOnlineViaRpc(isOnline: boolean): Promise<boolean> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.rpc('rider_toggle_online', {
    p_is_online: isOnline,
  });
  if (error) throw new Error(error.message);
  return Boolean((data as Record<string, unknown>)?.is_online);
}

export async function riderUpdateOrderStatusViaRpc(
  orderId: string,
  newStatus: 'out_for_delivery' | 'delivered',
  note?: string
): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { error } = await supabase.rpc('rider_update_order_status', {
    p_order_id: orderId,
    p_new_status: newStatus,
    p_note: note || null,
  });
  if (error) throw new Error(error.message);
}
