import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Phone, KeyRound, User, Mail, Lock, AlertCircle, CheckCircle2, ShieldAlert } from 'lucide-react';
import {
  getSupabaseEnvDiagnostic,
  isSupabaseConfigured,
  sendPhoneOtp,
  signInWithEmailPassword,
  verifyPhoneOtp,
} from '../../lib/supabase';
import { UserProfile } from '../../types';

interface PhoneOtpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (profile: UserProfile | null) => void;
  title?: string;
  subtitle?: string;
}

export const PhoneOtpModal: React.FC<PhoneOtpModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  title = 'Sign In to FOMO Store',
  subtitle = 'Sign in with your mobile number via SMS OTP, or use Email & Password.',
}) => {
  const isConfigured = isSupabaseConfigured();
  const [authMethod, setAuthMethod] = useState<'phone' | 'email'>('phone');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phoneInput, setPhoneInput] = useState('');
  const [normalizedPhone, setNormalizedPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const handleReset = () => {
    setStep('phone');
    setOtpCode('');
    setError(null);
    setInfoMessage(null);
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);
    setLoading(true);
    try {
      const profile = await signInWithEmailPassword(emailInput, passwordInput);
      onSuccess(profile);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in with email and password.');
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);
    setLoading(true);
    try {
      const res = await sendPhoneOtp(phoneInput);
      setNormalizedPhone(res.normalizedPhone);
      setStep('otp');
      setInfoMessage(`OTP sent via SMS to ${res.normalizedPhone}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send OTP.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const profile = await verifyPhoneOtp(normalizedPhone, otpCode, fullName);
      onSuccess(profile);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid or expired OTP code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="space-y-4 text-sm">
        <p className="text-xs text-slate-600 leading-relaxed">{subtitle}</p>

        {/* Honest Provider Requirement Notice */}
        {!isConfigured ? (
          getSupabaseEnvDiagnostic().isBlocked ? (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 text-xs text-rose-900 space-y-1.5">
              <div className="flex items-center gap-2 font-bold">
                <ShieldAlert className="w-4 h-4 text-rose-600 flex-shrink-0" />
                <span>Environment Safety Guard Active</span>
              </div>
              <p className="leading-relaxed text-rose-800">
                {getSupabaseEnvDiagnostic().setupMessage}
              </p>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-900 space-y-1.5">
              <div className="flex items-center gap-2 font-bold">
                <ShieldAlert className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <span>Supabase & SMS OTP Provider Required</span>
              </div>
              <p className="leading-relaxed text-amber-800">
                Live Phone OTP authentication requires <code>VITE_SUPABASE_URL</code> and{' '}
                <code>VITE_SUPABASE_ANON_KEY</code> in <code>.env</code>, plus an active SMS OTP
                provider configured in Supabase Auth.
              </p>
            </div>
          )
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between bg-brand-grey-blue px-3 py-2 rounded-xl border border-slate-200 text-xs">
              <span className="text-brand-navy font-semibold">Supabase Auth</span>
              <Badge variant="green" size="sm">
                Connected
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-1.5 bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setAuthMethod('phone');
                  setError(null);
                }}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                  authMethod === 'phone'
                    ? 'bg-brand-navy text-white shadow-xs'
                    : 'text-slate-600 hover:text-brand-navy'
                }`}
              >
                Phone OTP
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMethod('email');
                  setError(null);
                }}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                  authMethod === 'email'
                    ? 'bg-brand-navy text-white shadow-xs'
                    : 'text-slate-600 hover:text-brand-navy'
                }`}
              >
                Email & Password
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {infoMessage && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-800 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
            <span>{infoMessage}</span>
          </div>
        )}

        {authMethod === 'email' ? (
          <form onSubmit={handleEmailLogin} className="space-y-3.5">
            <div>
              <label className="block text-xs font-bold text-brand-navy mb-1">
                Email Address *
              </label>
              <Input
                type="email"
                required
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="you@example.com"
                icon={<Mail className="w-4 h-4" />}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-brand-navy mb-1">
                Password *
              </label>
              <Input
                type="password"
                required
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="Enter your password"
                icon={<Lock className="w-4 h-4" />}
              />
            </div>

            <div className="pt-2 flex flex-col gap-2">
              <Button
                type="submit"
                variant="primary"
                fullWidth
                disabled={loading || !emailInput.trim() || !passwordInput}
              >
                {loading ? 'Signing In...' : 'Sign In with Email'}
              </Button>
              <Button type="button" variant="ghost" size="sm" fullWidth onClick={onClose}>
                Cancel
              </Button>
            </div>
          </form>
        ) : step === 'phone' ? (
          <form onSubmit={handleSendOtp} className="space-y-3.5">
            <div>
              <label className="block text-xs font-bold text-brand-navy mb-1">
                Your Name (Optional)
              </label>
              <Input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Ankit Kumar"
                icon={<User className="w-4 h-4" />}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-brand-navy mb-1">
                Mobile Number (India +91) *
              </label>
              <Input
                type="tel"
                required
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="10-digit mobile number"
                icon={<Phone className="w-4 h-4" />}
              />
            </div>

            <div className="pt-2 flex flex-col gap-2">
              <Button type="submit" variant="primary" fullWidth disabled={loading || !phoneInput.trim()}>
                {loading ? 'Sending OTP...' : 'Send Verification OTP'}
              </Button>
              <Button type="button" variant="ghost" size="sm" fullWidth onClick={onClose}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-3.5">
            <div>
              <label className="block text-xs font-bold text-brand-navy mb-1">
                Enter 6-Digit SMS OTP sent to {normalizedPhone} *
              </label>
              <Input
                type="text"
                inputMode="numeric"
                maxLength={6}
                required
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                placeholder="6-digit OTP"
                icon={<KeyRound className="w-4 h-4" />}
              />
            </div>

            <div className="pt-2 flex flex-col gap-2">
              <Button type="submit" variant="primary" fullWidth disabled={loading || otpCode.length < 4}>
                {loading ? 'Verifying...' : 'Verify & Sign In'}
              </Button>
              <Button type="button" variant="outline" size="sm" fullWidth onClick={handleReset}>
                Change Phone Number
              </Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
};
