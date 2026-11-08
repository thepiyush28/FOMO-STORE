import React from 'react';
import { Link } from 'react-router-dom';
import { Compass, ArrowLeft, ShieldCheck, Bike } from 'lucide-react';
import { Card } from '../components/ui/Card';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-brand-grey-blue flex flex-col items-center justify-center p-6 text-center">
      <Card className="max-w-md w-full p-8 border border-slate-200 shadow-card space-y-5">
        <div className="w-14 h-14 bg-brand-navy rounded-2xl flex items-center justify-center mx-auto text-white">
          <Compass className="w-7 h-7 text-brand-orange" />
        </div>

        <div className="space-y-1.5">
          <span className="text-xs font-mono font-bold text-brand-orange uppercase tracking-wider">
            404 • Page Not Found
          </span>
          <h1 className="text-2xl font-black text-brand-navy">Aisle Not Found</h1>
          <p className="text-xs text-slate-600 leading-relaxed">
            The page you are looking for does not exist in FOMO Store. Use one of the links below
            to return to the supermarket app.
          </p>
        </div>

        <div className="flex flex-col gap-2.5 pt-2">
          <Link
            to="/"
            className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-brand-orange text-brand-navy font-bold text-xs uppercase hover:bg-brand-orange-hover transition-colors touch-target"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Customer Storefront (/)</span>
          </Link>

          <div className="grid grid-cols-2 gap-2.5">
            <Link
              to="/admin"
              className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-brand-navy font-bold text-xs hover:bg-slate-50 touch-target"
            >
              <ShieldCheck className="w-4 h-4 text-brand-orange" />
              <span>Owner (/admin)</span>
            </Link>
            <Link
              to="/rider"
              className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-brand-navy font-bold text-xs hover:bg-slate-50 touch-target"
            >
              <Bike className="w-4 h-4 text-brand-orange" />
              <span>Rider (/rider)</span>
            </Link>
          </div>
        </div>
      </Card>
    </div>
  );
};
