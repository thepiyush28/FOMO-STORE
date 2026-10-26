import React from 'react';
import { StoreConfig } from '../../types';
import { MapPin, Phone, Clock, ShieldCheck, AlertCircle } from 'lucide-react';
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
              <strong>Phase 1 Frontend Prototype Notice:</strong> Real business values, prices, contact numbers, and registrations are marked as placeholders and will be connected upon store launch. Checkout and ordering are non-functional in this demo.
            </span>
          </div>
          <Badge variant="placeholder" size="sm" className="bg-brand-orange/20 text-brand-orange border-brand-orange/40 flex-shrink-0">
            Phase 1 Prototype
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

        {/* Bottom copyright & disclaimers */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-400 gap-3">
          <p>© 2026 FOMO Store. Rajauli, Nawada, Bihar. All rights reserved.</p>
          <p className="text-slate-400">
            Phase 1 Frontend Prototype Built with React, Vite, TypeScript & Tailwind CSS.
          </p>
        </div>
      </div>
    </footer>
  );
};
