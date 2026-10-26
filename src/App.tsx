import React from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { ShieldCheck, Bike, ArrowLeft } from 'lucide-react';

// Future Phase Placeholders for Owner Dashboard & Rider App
const AdminPlaceholder: React.FC = () => (
  <div className="min-h-screen bg-brand-grey-blue flex flex-col items-center justify-center p-6 text-center">
    <div className="max-w-md bg-white p-8 rounded-3xl border border-slate-200 shadow-card">
      <div className="w-12 h-12 bg-brand-navy rounded-2xl flex items-center justify-center mx-auto mb-4 text-white">
        <ShieldCheck className="w-6 h-6 text-brand-orange" />
      </div>
      <h2 className="text-xl font-black text-brand-navy mb-2">Owner Dashboard (/admin)</h2>
      <p className="text-xs text-slate-600 mb-6 leading-relaxed">
        Live order dispatch, catalog editing, inventory tracking, CSV tools, and analytics are scheduled for Phase 2.
      </p>
      <Link
        to="/"
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-orange text-brand-navy font-bold text-xs uppercase hover:bg-brand-orange-hover transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Return to Customer App</span>
      </Link>
    </div>
  </div>
);

const RiderPlaceholder: React.FC = () => (
  <div className="min-h-screen bg-brand-grey-blue flex flex-col items-center justify-center p-6 text-center">
    <div className="max-w-md bg-white p-8 rounded-3xl border border-slate-200 shadow-card">
      <div className="w-12 h-12 bg-brand-navy rounded-2xl flex items-center justify-center mx-auto mb-4 text-white">
        <Bike className="w-6 h-6 text-brand-orange" />
      </div>
      <h2 className="text-xl font-black text-brand-navy mb-2">Rider App (/rider)</h2>
      <p className="text-xs text-slate-600 mb-6 leading-relaxed">
        Online toggle, assigned deliveries, customer navigation, and cash collection interface are scheduled for Phase 3.
      </p>
      <Link
        to="/"
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-orange text-brand-navy font-bold text-xs uppercase hover:bg-brand-orange-hover transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Return to Customer App</span>
      </Link>
    </div>
  </div>
);

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/admin" element={<AdminPlaceholder />} />
        <Route path="/rider" element={<RiderPlaceholder />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
