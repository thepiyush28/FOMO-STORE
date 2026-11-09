import React, { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import {
  Phone,
  KeyRound,
  User,
  Mail,
  Lock,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import {
  getSupabaseEnvDiagnostic,
  isSupabaseConfigured,
  resetPasswordForEmail,
  sendPhoneOtp,
  signInWithEmailPassword,
  signUpWithEmailPassword,
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
  title = 'Customer Account Access',
  subtitle = 'Sign in or create your account to place orders and manage delivery addresses.',
}) => {
  const isConfigured = isSupabaseConfigured();
  const [authMethod, setAuthMethod] = useState<'email' | 'phone'>('email');
  const [emailMode, setEmailMode] = useState<'login' | 'register' | 'forgot'>('login');

  // Phone OTP state
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phoneInput, setPhoneInput] = useState('');
  const [normalizedPhone, setNormalizedPhone] = useState('');
  const [phoneFullName, setPhoneFullName] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [phoneOtpProviderNotice, setPhoneOtpProviderNotice] = useState<string | null>(null);
  const [phoneMode, setPhoneMode] = useState<'login' | 'register'>('register');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [otpAttempts, setOtpAttempts] = useState(0);

  // Resend cooldown countdown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  // Email state
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [registerFullName, setRegisterFullName] = useState('');

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const handleReset = () => {
    setStep('phone');
    setOtpCode('');
    setError(null);
    setInfoMessage(null);
    setPhoneOtpProviderNotice(null);
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

  const handleEmailRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);

    if (passwordInput.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    if (passwordInput !== confirmPasswordInput) {
      setError('Passwords do not match. Please re-enter matching passwords.');
      return;
    }

    setLoading(true);
    try {
      const res = await signUpWithEmailPassword(emailInput, passwordInput, registerFullName);
      if (res.needsEmailConfirmation) {
        setInfoMessage(
          'Registration successful! Please check your email inbox to verify your account, then sign in.'
        );
        setEmailMode('login');
      } else {
        setInfoMessage('Account created successfully! Signing you in…');
        onSuccess(res.profile);
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to register account.');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);
    setLoading(true);
    try {
      await resetPasswordForEmail(emailInput);
      setInfoMessage('Password reset link sent to your email. Check your inbox to set a new password.');
      setEmailMode('login');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send password reset email.');
    } finally {
      setLoading(false);
    }
  };

  const MAX_OTP_ATTEMPTS = 5;
  const RESEND_COOLDOWN_SECONDS = 60;

  const requestOtp = async () => {
    setError(null);
    setInfoMessage(null);
    setPhoneOtpProviderNotice(null);
    setLoading(true);
    try {
      const res = await sendPhoneOtp(phoneInput, {
        mode: phoneMode,
        fullName: phoneFullName,
      });
      setNormalizedPhone(res.normalizedPhone);
      setStep('otp');
      setOtpCode('');
      setOtpAttempts(0);
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      setInfoMessage(`OTP sent via SMS to ${res.normalizedPhone}.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to send OTP.';
      const lower = msg.toLowerCase();
      if (lower.includes('signups not allowed') || lower.includes('user not found')) {
        setError('No account found for this mobile number. Please choose "Create Account" first.');
      } else if (lower.includes('rate limit') || lower.includes('too many') || lower.includes('security purposes')) {
        setError('Too many OTP requests. Please wait a minute before trying again.');
        setResendCooldown(RESEND_COOLDOWN_SECONDS);
      } else {
        setError(msg);
      }
      if (
        lower.includes('sms') ||
        lower.includes('provider') ||
        lower.includes('unsupported phone')
      ) {
        setPhoneOtpProviderNotice(
          'SMS OTP is not live yet because an SMS provider has not been configured for this store. You can register and log in right now using the Email & Password option.'
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    await requestOtp();
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (otpAttempts >= MAX_OTP_ATTEMPTS) {
      setError('Too many incorrect attempts. Please request a new OTP.');
      return;
    }
    setLoading(true);
    try {
      const profile = await verifyPhoneOtp(normalizedPhone, otpCode, phoneFullName);
      onSuccess(profile);
      onClose();
    } catch (err) {
      const used = otpAttempts + 1;
      setOtpAttempts(used);
      setOtpCode('');
      const base = err instanceof Error ? err.message : 'Invalid or expired OTP code.';
      setError(
        used >= MAX_OTP_ATTEMPTS
          ? 'Too many incorrect attempts. Please request a new OTP.'
          : `${base} (${MAX_OTP_ATTEMPTS - used} attempt${MAX_OTP_ATTEMPTS - used === 1 ? '' : 's'} left)`
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="space-y-4 text-sm">
        <p className="text-xs text-slate-600 leading-relaxed">{subtitle}</p>

        {/* Supabase Connection State Notice */}
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
                <span>Supabase Configuration Required</span>
              </div>
              <p className="leading-relaxed text-amber-800">
                Live authentication requires <code>VITE_SUPABASE_URL</code> and{' '}
                <code>VITE_SUPABASE_ANON_KEY</code> to be configured.
              </p>
            </div>
          )
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-1.5 bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setAuthMethod('email');
                  setError(null);
                  setInfoMessage(null);
                }}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                  authMethod === 'email'
                    ? 'bg-brand-navy text-white shadow-xs'
                    : 'text-slate-600 hover:text-brand-navy'
                }`}
              >
                Email & Password
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMethod('phone');
                  setError(null);
                  setInfoMessage(null);
                }}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                  authMethod === 'phone'
                    ? 'bg-brand-navy text-white shadow-xs'
                    : 'text-slate-600 hover:text-brand-navy'
                }`}
              >
                Phone OTP
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

        {phoneOtpProviderNotice && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-900 space-y-2">
            <div className="flex items-center gap-2 font-bold text-amber-950">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span>SMS Gateway Status</span>
            </div>
            <p className="leading-relaxed text-amber-800">{phoneOtpProviderNotice}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setAuthMethod('email');
                setEmailMode('register');
                setPhoneOtpProviderNotice(null);
                setError(null);
              }}
              className="gap-1.5 text-brand-navy font-bold"
            >
              <Sparkles className="w-3.5 h-3.5 text-brand-orange" />
              <span>Use Email & Password Instead</span>
            </Button>
          </div>
        )}

        {authMethod === 'email' ? (
          <div>
            {/* Email Mode Toggle: Sign In vs Register vs Forgot */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-3.5 text-xs">
              <span className="font-bold text-brand-navy">
                {emailMode === 'login'
                  ? 'Sign In to Your Account'
                  : emailMode === 'register'
                  ? 'Create New Customer Account'
                  : 'Reset Account Password'}
              </span>
              <div className="flex gap-2">
                {emailMode !== 'login' && (
                  <button
                    type="button"
                    onClick={() => {
                      setEmailMode('login');
                      setError(null);
                      setInfoMessage(null);
                    }}
                    className="text-brand-orange font-bold hover:underline"
                  >
                    Sign In
                  </button>
                )}
                {emailMode !== 'register' && (
                  <button
                    type="button"
                    onClick={() => {
                      setEmailMode('register');
                      setError(null);
                      setInfoMessage(null);
                    }}
                    className="text-brand-orange font-bold hover:underline"
                  >
                    Register
                  </button>
                )}
              </div>
            </div>

            {emailMode === 'login' && (
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
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-brand-navy">
                      Password *
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setEmailMode('forgot');
                        setError(null);
                        setInfoMessage(null);
                      }}
                      className="text-[11px] text-brand-orange hover:underline font-semibold"
                    >
                      Forgot password?
                    </button>
                  </div>
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
                  <div className="text-center text-xs text-slate-500 pt-1">
                    Don’t have an account yet?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setEmailMode('register');
                        setError(null);
                        setInfoMessage(null);
                      }}
                      className="font-bold text-brand-orange hover:underline"
                    >
                      Create one here
                    </button>
                  </div>
                </div>
              </form>
            )}

            {emailMode === 'register' && (
              <form onSubmit={handleEmailRegister} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-brand-navy mb-1">
                    Full Name *
                  </label>
                  <Input
                    type="text"
                    required
                    value={registerFullName}
                    onChange={(e) => setRegisterFullName(e.target.value)}
                    placeholder="e.g. Ramesh Kumar"
                    icon={<User className="w-4 h-4" />}
                  />
                </div>

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
                    Create Password (min. 6 characters) *
                  </label>
                  <Input
                    type="password"
                    required
                    minLength={6}
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="At least 6 characters"
                    icon={<Lock className="w-4 h-4" />}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-brand-navy mb-1">
                    Confirm Password *
                  </label>
                  <Input
                    type="password"
                    required
                    minLength={6}
                    value={confirmPasswordInput}
                    onChange={(e) => setConfirmPasswordInput(e.target.value)}
                    placeholder="Re-enter your password"
                    icon={<Lock className="w-4 h-4" />}
                  />
                </div>

                <div className="pt-2 flex flex-col gap-2">
                  <Button
                    type="submit"
                    variant="primary"
                    fullWidth
                    disabled={
                      loading ||
                      !registerFullName.trim() ||
                      !emailInput.trim() ||
                      passwordInput.length < 6 ||
                      passwordInput !== confirmPasswordInput
                    }
                  >
                    {loading ? 'Creating Account...' : 'Register as Customer'}
                  </Button>
                  <div className="text-center text-xs text-slate-500 pt-1">
                    Already registered?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setEmailMode('login');
                        setError(null);
                        setInfoMessage(null);
                      }}
                      className="font-bold text-brand-orange hover:underline"
                    >
                      Sign In
                    </button>
                  </div>
                </div>
              </form>
            )}

            {emailMode === 'forgot' && (
              <form onSubmit={handleEmailForgotPassword} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-brand-navy mb-1">
                    Your Registered Email Address *
                  </label>
                  <Input
                    type="email"
                    required
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="you@example.com"
                    icon={<Mail className="w-4 h-4" />}
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    We will send a password reset link to this email address.
                  </p>
                </div>

                <div className="pt-2 flex flex-col gap-2">
                  <Button
                    type="submit"
                    variant="primary"
                    fullWidth
                    disabled={loading || !emailInput.trim()}
                  >
                    {loading ? 'Sending Link...' : 'Send Password Reset Link'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    fullWidth
                    onClick={() => {
                      setEmailMode('login');
                      setError(null);
                    }}
                  >
                    Cancel / Back to Sign In
                  </Button>
                </div>
              </form>
            )}
          </div>
        ) : step === 'phone' ? (
          <form onSubmit={handleSendOtp} className="space-y-3.5">
            <div className="grid grid-cols-2 gap-1.5 bg-slate-100 p-1 rounded-xl">
              {(['register', 'login'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setPhoneMode(m);
                    setError(null);
                  }}
                  className={`py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                    phoneMode === m
                      ? 'bg-white text-brand-navy shadow-xs'
                      : 'text-slate-600 hover:text-brand-navy'
                  }`}
                >
                  {m === 'register' ? 'Create Account' : 'Sign In'}
                </button>
              ))}
            </div>

            {phoneOtpProviderNotice ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 space-y-2">
                <p>{phoneOtpProviderNotice}</p>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  fullWidth
                  onClick={() => {
                    setAuthMethod('email');
                    setEmailMode(phoneMode === 'register' ? 'register' : 'login');
                    setError(null);
                  }}
                >
                  Continue with Email &amp; Password instead
                </Button>
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-600">
                We will send a 6-digit verification code by SMS to your mobile number.
              </div>
            )}

            {phoneMode === 'register' && (
              <div>
                <label className="block text-xs font-bold text-brand-navy mb-1">
                  Full Name *
                </label>
                <Input
                  type="text"
                  required
                  minLength={2}
                  value={phoneFullName}
                  onChange={(e) => setPhoneFullName(e.target.value)}
                  placeholder="e.g. Ramesh Kumar"
                  icon={<User className="w-4 h-4" />}
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-brand-navy mb-1">
                Mobile Number (India +91) *
              </label>
              <Input
                type="tel"
                required
                inputMode="numeric"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="10-digit mobile number"
                icon={<Phone className="w-4 h-4" />}
              />
            </div>

            <div className="pt-2 flex flex-col gap-2">
              <Button
                type="submit"
                variant="primary"
                fullWidth
                disabled={
                  loading ||
                  !phoneInput.trim() ||
                  (phoneMode === 'register' && phoneFullName.trim().length < 2) ||
                  resendCooldown > 0
                }
              >
                {loading
                  ? 'Sending OTP...'
                  : resendCooldown > 0
                  ? `Please wait ${resendCooldown}s`
                  : phoneMode === 'register'
                  ? 'Send OTP & Create Account'
                  : 'Send OTP to Sign In'}
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
              <Button
                type="submit"
                variant="primary"
                fullWidth
                disabled={loading || otpCode.length < 6 || otpAttempts >= MAX_OTP_ATTEMPTS}
              >
                {loading ? 'Verifying...' : 'Verify & Continue'}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                fullWidth
                disabled={loading || resendCooldown > 0}
                onClick={requestOtp}
              >
                {resendCooldown > 0 ? `Resend OTP in ${resendCooldown}s` : 'Resend OTP'}
              </Button>
              <Button type="button" variant="ghost" size="sm" fullWidth onClick={handleReset}>
                Change Phone Number
              </Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
};
