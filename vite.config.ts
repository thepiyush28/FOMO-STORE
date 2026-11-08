import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

function extractSupabaseProjectRef(rawUrl?: string): string {
  if (!rawUrl) return '';
  const cleaned = rawUrl.trim().replace(/^['"]|['"]$/g, '').trim();
  try {
    const parsed = new URL(cleaned);
    const parts = parsed.hostname.toLowerCase().split('.');
    if (
      parts.length >= 3 &&
      parts[parts.length - 2] === 'supabase' &&
      parts[parts.length - 1] === 'co'
    ) {
      return parts[0] || '';
    }
    return parsed.hostname.toLowerCase();
  } catch {
    return '';
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Read production env files in Node only to extract the non-secret 20-char project ref
  // so development and staging modes can fail closed if accidentally pointed at Production.
  const prodEnv = loadEnv('production', process.cwd(), 'VITE_');
  const knownProdRef =
    (prodEnv.VITE_PRODUCTION_PROJECT_REF || '').trim().toLowerCase() ||
    extractSupabaseProjectRef(prodEnv.VITE_PRODUCTION_SUPABASE_URL || prodEnv.VITE_SUPABASE_URL);

  return {
    plugins: [react()],
    define: {
      __FOMO_KNOWN_PROD_REF__: JSON.stringify(mode === 'production' ? '' : knownProdRef),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-supabase': ['@supabase/supabase-js'],
            'vendor-icons': ['lucide-react'],
          },
        },
      },
    },
  };
});
