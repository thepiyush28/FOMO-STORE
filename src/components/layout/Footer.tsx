import React from 'react';
import { Link } from 'react-router-dom';
import { StoreConfig } from '../../types';
import { MapPin, Phone, Clock, ShieldCheck, AlertCircle, Bike } from 'lucide-react';
import { Badge } from '../ui/Badge';

interface FooterProps {
  storeConfig: StoreConfig;
}

export const Footer: React.FC<FooterProps> = ({ storeConfig }) => {
  return (
    <footer className="bg-brand-navy text-slate-200 mt-16 pt-12 pb-24 md:pb-12 border-t-4 border-brand-orange">
      <div className="max-w-6xl mx-auto px-4">
        {/* Top Info Banner */}
        <div className="bg-brand-navy-light/80 p-4 rounded-2xl border border-white/10 mb-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-xs text-amber-200">
            <AlertCircle className="w-5 h-5 text-brand-orange flex-shrink-0" />
            <span>
              {storeConfig.connectionStatus === 'connected' ? (
                <>
                  <strong>Live Supabase Storefront Connected:</strong> Catalog, inventory, and store
                  status are synchronized with FOMO Store in Rajauli. Any unconfigured business fields
                  remain explicitly marked as placeholders until finalized in <code>/admin</code>.
                </>
              ) : storeConfig.connectionStatus === 'connecting' ? (
                <>
                  <strong>Connecting to Supabase:</strong> Verifying live catalog and store settings
                  connection…
                </>
              ) : storeConfig.connectionStatus === 'error' ? (
                <>
                  <strong>Supabase Connection Error:</strong> Could not reach the live Supabase Data
                  API ({storeConfig.connectionError || 'Network/Fetch error'}). Live catalog and
                  checkout remain disabled until the connection succeeds.
                </>
              ) : (
                <>
                  <strong>Demo Mode Notice:</strong> Real business values, prices, contact numbers,
                  and registrations are marked as placeholders until <code>VITE_SUPABASE_URL</code>{' '}
                  and <code>VITE_SUPABASE_ANON_KEY</code> are connected.
                </>
              )}
            </span>
          </div>
          <Badge
            variant="placeholder"
            size="sm"
            className={`flex-shrink-0 ${
              storeConfig.connectionStatus === 'connected'
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
                : storeConfig.connectionStatus === 'error'
                ? 'bg-rose-500/20 text-rose-300 border-rose-400/40'
                : 'bg-brand-orange/20 text-brand-orange border-brand-orange/40'
            }`}
          >
            {storeConfig.connectionStatus === 'connected'
              ? 'Live Supabase Connected'
              : storeConfig.connectionStatus === 'connecting'
              ? 'Connecting to Supabase…'
              : storeConfig.connectionStatus === 'error'
              ? 'Supabase Connection Error'
              : 'Demo Mode'}
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pb-10 border-b border-white/10">
          {/* Brand Info */}
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <img
                src="/brand/logo.jpeg"
                alt="FOMO Store Logo"
                className="w-9 h-9 object-contain rounded-lg bg-white p-0.5"
              />
              <span className="text-xl font-black text-white tracking-tight">
                FOMO <span className="text-brand-orange">STORE</span>
              </span>
            </div>
            <p className="text-sm text-slate-300 font-display italic mb-2">
              Your Town. Everything You Need.
            </p>
            <p className="text-xs text-slate-400 leading-relaxed mb-4">
              A neighbourhood supermarket opening in Rajauli, Nawada, Bihar, with walk-in shopping and home delivery under one brand, one catalog, and one set of prices.
            </p>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/5 border border-white/10 rounded-lg text-[11px] text-slate-300">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>FSSAI License: <code className="text-amber-300">{storeConfig.fssaiPlaceholder}</code></span>
            </div>
          </div>

          {/* Visit Us (Store Info - Placeholders strictly preserved) */}
          <div>
            <h4 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-brand-orange" />
              Visit Us & Contact
            </h4>
            <ul className="space-y-3 text-xs text-slate-300">
              <li className="flex items-start gap-2">
                <span className="text-slate-400 font-medium">Address:</span>
                <span className="font-mono text-amber-300/90">{storeConfig.addressPlaceholder}</span>
              </li>
              <li className="flex items-start gap-2">
                <Clock className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-slate-400 font-medium">Store Hours: </span>
                  <span className="font-mono text-amber-300/90">{storeConfig.hoursPlaceholder}</span>
                </div>
              </li>
              <li className="flex items-start gap-2">
                <Phone className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-slate-400 font-medium">Support: </span>
                  <span className="font-mono text-amber-300/90">{storeConfig.phonePlaceholder}</span>
                </div>
              </li>
            </ul>
          </div>

          {/* Service Promises & Roadmap */}
          <div>
            <h4 className="text-sm font-bold text-white uppercase tracking-wider mb-4">
              FOMO Store Principles
            </h4>
            <ul className="space-y-2 text-xs text-slate-300">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-orange" />
                <span>One price everywhere (same in-store & in-app)</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-orange" />
                <span>Cash on delivery from day one</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-orange" />
                <span>Local & trusted real supermarket in Rajauli</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-orange" />
                <span>Easy to use for every household</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Staff & Admin Access (Guarded strictly by Supabase RLS; never grants admin access to normal customers) */}
        <div className="pt-6 pb-2 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-4">
            <Link
              to="/admin"
              className="text-slate-300 hover:text-brand-orange transition-colors flex items-center gap-1.5 font-semibold"
            >
              <ShieldCheck className="w-4 h-4 text-brand-orange" />
              <span>Admin Login (/admin)</span>
            </Link>
            <span className="text-white/20">•</span>
            <Link
              to="/rider"
              className="text-slate-300 hover:text-brand-orange transition-colors flex items-center gap-1.5 font-semibold"
            >
              <Bike className="w-4 h-4 text-brand-orange" />
              <span>Delivery Partner (/rider)</span>
            </Link>
          </div>
          <span className="text-[11px] text-slate-500 font-mono">
            Protected by Supabase Role-Based Security
          </span>
        </div>

        {/* Bottom copyright & disclaimers */}
        <div className="pt-4 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-400 gap-3">
          <p>© 2026 FOMO Store. Rajauli, Nawada, Bihar. All rights reserved.</p>
          <p className="text-slate-400">
            FOMO Store V1 • Powered by React, Vite, TypeScript & Supabase.
          </p>
        </div>
      </div>
    </footer>
  );
};
