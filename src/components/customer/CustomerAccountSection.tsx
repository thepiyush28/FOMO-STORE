import React, { useEffect, useState, useCallback } from 'react';
import { CustomerAddress, StoreConfig, UserProfile } from '../../types';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Badge } from '../ui/Badge';
import {
  User,
  MapPin,
  Phone,
  MessageCircle,
  LogOut,
  Plus,
  Edit2,
  Trash2,
  ShieldCheck,
  Bike,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import {
  deleteCustomerAddress,
  fetchCustomerAddresses,
  saveCustomerAddress,
  updateUserProfile,
} from '../../lib/supabase';
import { Link } from 'react-router-dom';

interface CustomerAccountSectionProps {
  userId: string | null;
  profile: UserProfile | null;
  storeConfig: StoreConfig;
  onRequireLogin: () => void;
  onProfileUpdated: () => Promise<UserProfile | null>;
  onSignOut: () => Promise<void>;
  onBackToShop: () => void;
}

export const CustomerAccountSection: React.FC<CustomerAccountSectionProps> = ({
  userId,
  profile,
  storeConfig,
  onRequireLogin,
  onProfileUpdated,
  onSignOut,
  onBackToShop,
}) => {
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Addresses state
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [loadingAddresses, setLoadingAddresses] = useState(false);
  const [showAddrForm, setShowAddrForm] = useState(false);
  const [editingAddrId, setEditingAddrId] = useState<string | undefined>(undefined);
  const [addressLine, setAddressLine] = useState('');
  const [landmark, setLandmark] = useState('');
  const [pincode, setPincode] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);

  useEffect(() => {
    setFullName(profile?.full_name || '');
  }, [profile]);

  const loadAddresses = useCallback(async () => {
    if (!userId) {
      setAddresses([]);
      return;
    }
    setLoadingAddresses(true);
    try {
      const list = await fetchCustomerAddresses(userId);
      setAddresses(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load addresses.');
    } finally {
      setLoadingAddresses(false);
    }
  }, [userId]);

  useEffect(() => {
    loadAddresses();
  }, [loadAddresses]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    setSavingProfile(true);
    setError(null);
    setProfileNotice(null);
    try {
      await updateUserProfile(userId, { full_name: fullName });
      await onProfileUpdated();
      setProfileNotice('Profile updated successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleOpenAddAddress = () => {
    setEditingAddrId(undefined);
    setAddressLine('');
    setLandmark('');
    setPincode('');
    setIsDefault(addresses.length === 0);
    setShowAddrForm(true);
    setError(null);
  };

  const handleOpenEditAddress = (addr: CustomerAddress) => {
    setEditingAddrId(addr.id);
    setAddressLine(addr.address_line);
    setLandmark(addr.landmark || '');
    setPincode(addr.pincode);
    setIsDefault(addr.is_default);
    setShowAddrForm(true);
    setError(null);
  };

  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    setSavingAddress(true);
    setError(null);
    try {
      await saveCustomerAddress(userId, {
        id: editingAddrId,
        address_line: addressLine,
        landmark,
        pincode,
        is_default: isDefault,
      });
      await loadAddresses();
      setShowAddrForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save address.');
    } finally {
      setSavingAddress(false);
    }
  };

  const handleDeleteAddress = async (id: string) => {
    if (!userId) return;
    try {
      await deleteCustomerAddress(userId, id);
      await loadAddresses();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete address.');
    }
  };

  const isPhoneConfigured =
    storeConfig.phonePlaceholder &&
    !storeConfig.phonePlaceholder.includes('[') &&
    /\d{10}/.test(storeConfig.phonePlaceholder);

  const cleanSupportDigits = storeConfig.phonePlaceholder.replace(/\D/g, '');

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToShop}
            className="p-2 rounded-xl border border-slate-200 hover:bg-brand-grey-blue text-brand-navy touch-target flex items-center justify-center"
            aria-label="Back to Storefront"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-brand-navy">My Account</h1>
            <p className="text-xs text-slate-500">
              Manage your profile, saved Rajauli delivery addresses & store support
            </p>
          </div>
        </div>

        {userId && (
          <Button variant="outline" size="sm" onClick={onSignOut} className="gap-1.5 text-rose-700">
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </Button>
        )}
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-800 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {profileNotice && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-800 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
          <span>{profileNotice}</span>
        </div>
      )}

      {/* Role Portal Shortcut for Owner or Rider */}
      {profile?.role === 'admin' && (
        <Card variant="soft-orange" className="p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-xs">
            <ShieldCheck className="w-5 h-5 text-brand-orange" />
            <div>
              <span className="font-bold text-brand-navy block">Store Owner Account Active</span>
              <span className="text-slate-600">
                You have administrator permissions to manage catalog, stock, settings, and orders.
              </span>
            </div>
          </div>
          <Link
            to="/admin"
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-brand-navy text-white text-xs font-bold hover:bg-brand-navy-light touch-target"
          >
            <span>Open Owner Dashboard (/admin)</span>
          </Link>
        </Card>
      )}

      {profile?.role === 'rider' && (
        <Card variant="soft-orange" className="p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-xs">
            <Bike className="w-5 h-5 text-brand-orange" />
            <div>
              <span className="font-bold text-brand-navy block">Delivery Partner Account Active</span>
              <span className="text-slate-600">
                Access your assigned deliveries, online status toggle, and navigation screen.
              </span>
            </div>
          </div>
          <Link
            to="/rider"
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-brand-navy text-white text-xs font-bold hover:bg-brand-navy-light touch-target"
          >
            <span>Open Rider App (/rider)</span>
          </Link>
        </Card>
      )}

      {/* Profile Section */}
      {!userId ? (
        <Card className="p-6 sm:p-8 text-center space-y-4">
          <div className="w-16 h-16 bg-brand-grey-blue rounded-full flex items-center justify-center mx-auto">
            <User className="w-8 h-8 text-brand-orange" />
          </div>
          <div className="max-w-sm mx-auto space-y-1">
            <h2 className="text-base font-bold text-brand-navy">Sign in to your FOMO Store account</h2>
            <p className="text-xs text-slate-500">
              Save your delivery addresses in Rajauli, view past orders, and check out faster with
              Phone OTP.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Button variant="primary" onClick={onRequireLogin} className="gap-2">
              <Phone className="w-4 h-4" />
              <span>Login with Phone OTP</span>
            </Button>
            <Link
              to="/admin"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-brand-navy hover:bg-brand-grey-blue touch-target"
            >
              <ShieldCheck className="w-4 h-4 text-brand-orange" />
              <span>Owner Dashboard</span>
            </Link>
            <Link
              to="/rider"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-brand-navy hover:bg-brand-grey-blue touch-target"
            >
              <Bike className="w-4 h-4 text-brand-orange" />
              <span>Rider App</span>
            </Link>
          </div>
        </Card>
      ) : (
        <>
          <Card className="p-5 border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-brand-navy flex items-center gap-2">
                <User className="w-4 h-4 text-brand-orange" />
                <span>Personal Details</span>
              </h2>
              <Badge variant="navy" size="sm" className="uppercase">
                {profile?.role || 'customer'}
              </Badge>
            </div>

            <form onSubmit={handleSaveProfile} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Full Name</label>
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter your full name"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  Registered Phone
                </label>
                <Input value={profile?.phone || 'Not linked'} disabled />
              </div>
              <div className="sm:col-span-2 flex justify-end">
                <Button type="submit" size="sm" variant="primary" disabled={savingProfile}>
                  {savingProfile ? 'Saving...' : 'Save Profile'}
                </Button>
              </div>
            </form>
          </Card>

          {/* Saved Addresses Section */}
          <Card className="p-5 border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-brand-navy flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-brand-orange" />
                  <span>Saved Delivery Addresses</span>
                </h2>
                <p className="text-xs text-slate-500">
                  Manage your home or shop addresses in Rajauli and nearby areas
                </p>
              </div>
              {!showAddrForm && (
                <Button size="sm" variant="outline" onClick={handleOpenAddAddress} className="gap-1.5">
                  <Plus className="w-4 h-4" />
                  <span>Add Address</span>
                </Button>
              )}
            </div>

            {showAddrForm && (
              <form
                onSubmit={handleSaveAddress}
                className="bg-brand-grey-blue p-4 rounded-xl border border-slate-200 space-y-3"
              >
                <h3 className="text-xs font-bold text-brand-navy uppercase">
                  {editingAddrId ? 'Edit Delivery Address' : 'Add New Delivery Address'}
                </h3>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    House / Street / Village *
                  </label>
                  <Input
                    required
                    value={addressLine}
                    onChange={(e) => setAddressLine(e.target.value)}
                    placeholder="e.g. Ward 7, Main Road, Rajauli"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">
                      Landmark (Optional)
                    </label>
                    <Input
                      value={landmark}
                      onChange={(e) => setLandmark(e.target.value)}
                      placeholder="e.g. Near Bus Stand"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">
                      Pincode (6 digits) *
                    </label>
                    <Input
                      required
                      maxLength={6}
                      value={pincode}
                      onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))}
                      placeholder="805125"
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-xs text-brand-navy font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isDefault}
                    onChange={(e) => setIsDefault(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  <span>Set as default delivery address</span>
                </label>
                <div className="flex gap-2 pt-1">
                  <Button type="submit" size="sm" variant="primary" disabled={savingAddress}>
                    {savingAddress ? 'Saving...' : 'Save Address'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowAddrForm(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            )}

            {loadingAddresses ? (
              <div className="p-4 text-center text-xs text-slate-500">Loading addresses...</div>
            ) : addresses.length === 0 ? (
              <div className="p-6 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 text-xs text-slate-500">
                No saved addresses yet. Add an address for faster doorstep delivery checkout.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {addresses.map((addr) => (
                  <div
                    key={addr.id}
                    className="p-3.5 rounded-xl border border-slate-200 bg-white flex flex-col justify-between gap-3"
                  >
                    <div className="space-y-1 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-brand-navy">{addr.address_line}</span>
                        {addr.is_default && (
                          <Badge variant="orange" size="sm">
                            Default
                          </Badge>
                        )}
                      </div>
                      {addr.landmark && (
                        <p className="text-slate-500">Landmark: {addr.landmark}</p>
                      )}
                      <p className="text-slate-500 font-mono">Pincode: {addr.pincode}</p>
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleOpenEditAddress(addr)}
                        className="gap-1 text-xs"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteAddress(addr.id)}
                        className="gap-1 text-xs text-rose-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      {/* Customer Support & Store Contact Section */}
      <Card className="p-5 border border-slate-200 space-y-4">
        <div>
          <h2 className="text-base font-bold text-brand-navy">Store Support & Help</h2>
          <p className="text-xs text-slate-500">
            Reach out to FOMO Store in Rajauli by phone call or WhatsApp
          </p>
        </div>

        <div className="bg-brand-grey-blue p-3.5 rounded-xl border border-slate-200 text-xs space-y-1.5">
          <div className="flex flex-wrap justify-between gap-2">
            <span className="text-slate-500 font-medium">Support Phone / WhatsApp:</span>
            <span className="font-mono font-bold text-brand-navy">
              {storeConfig.phonePlaceholder}
            </span>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <span className="text-slate-500 font-medium">Store Address:</span>
            <span className="font-mono text-brand-navy">{storeConfig.addressPlaceholder}</span>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <span className="text-slate-500 font-medium">Operating Hours:</span>
            <span className="font-mono text-brand-navy">{storeConfig.hoursPlaceholder}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {isPhoneConfigured ? (
            <>
              <a
                href={`tel:${storeConfig.phonePlaceholder}`}
                className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-brand-navy text-white text-xs font-bold hover:bg-brand-navy-light touch-target"
              >
                <Phone className="w-4 h-4 text-brand-orange" />
                <span>Call FOMO Store</span>
              </a>
              <a
                href={`https://wa.me/${cleanSupportDigits}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 touch-target"
              >
                <MessageCircle className="w-4 h-4" />
                <span>Chat on WhatsApp</span>
              </a>
            </>
          ) : (
            <div className="sm:col-span-2 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3">
              Direct Call and WhatsApp buttons will activate automatically once the store owner
              configures the official support phone number in <code>/admin</code> settings.
            </div>
          )}
        </div>
      </Card>

      {/* Staff & Admin Access Section (Role-protected via Supabase RLS) */}
      <Card className="p-5 border border-slate-200 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-brand-orange" />
            <h3 className="text-sm font-bold text-brand-navy">Staff & Management Portals</h3>
          </div>
          {profile?.role && (
            <Badge
              variant={profile.role === 'admin' ? 'orange' : profile.role === 'rider' ? 'navy' : 'placeholder'}
              size="sm"
            >
              Account Role: {profile.role.toUpperCase()}
            </Badge>
          )}
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">
          Access the FOMO Store Owner Dashboard or Delivery Partner Portal. Note: Administrative access is strictly enforced by Supabase Row-Level Security and requires verified admin role authorization.
        </p>
        <div className="flex flex-wrap gap-2.5 pt-1">
          <Link
            to="/admin"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-brand-navy text-white text-xs font-bold hover:bg-brand-navy-light transition-colors touch-target"
          >
            <ShieldCheck className="w-4 h-4 text-brand-orange" />
            <span>Admin Dashboard (/admin)</span>
          </Link>
          <Link
            to="/rider"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-brand-grey-blue hover:bg-slate-200 text-brand-navy text-xs font-bold transition-colors touch-target border border-slate-200"
          >
            <Bike className="w-4 h-4 text-brand-orange" />
            <span>Rider Portal (/rider)</span>
          </Link>
        </div>
      </Card>
    </div>
  );
};
