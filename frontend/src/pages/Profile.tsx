import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import api from '../services/api';

interface ProfileData {
  id: string;
  email: string;
  full_name: string;
  role: string;
  created_at: string;
  phone?: string | null;
  sms_opt_in?: number;
}

function InputField({
  label, type = 'text', value, onChange, placeholder, required, minLength,
}: {
  label: string; type?: string; value: string; onChange: (v: string) => void;
  placeholder?: string; required?: boolean; minLength?: number;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        minLength={minLength}
        placeholder={placeholder}
        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100 transition"
      />
    </div>
  );
}

export default function Profile() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [profileMsg, setProfileMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);

  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdMsg, setPwdMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [pwdSaving, setPwdSaving] = useState(false);

  const [exporting, setExporting] = useState(false);

  const [smsPhone, setSmsPhone] = useState('');
  const [smsOptIn, setSmsOptIn] = useState(false);
  const [smsMsg, setSmsMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [smsSaving, setSmsSaving] = useState(false);

  useEffect(() => {
    api.get('/auth/me').then(({ data }) => {
      setProfile(data);
      setName(data.full_name);
      setEmail(data.email);
      setSmsPhone(data.phone || '');
      setSmsOptIn(!!data.sms_opt_in);
    });
  }, []);

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);
    setProfileSaving(true);
    try {
      await api.patch('/auth/profile', { full_name: name, email });
      const stored = localStorage.getItem('user');
      if (stored) localStorage.setItem('user', JSON.stringify({ ...JSON.parse(stored), full_name: name, email }));
      setProfileMsg({ text: 'Profile updated successfully.', ok: true });
      setProfile((p) => p ? { ...p, full_name: name, email } : p);
    } catch (err: any) {
      setProfileMsg({ text: err.response?.data?.message || 'Failed to update profile.', ok: false });
    } finally {
      setProfileSaving(false);
    }
  };

  const handleExportData = async () => {
    setExporting(true);
    try {
      const { data } = await api.get('/applications/export-data');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `my-passport-data-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdMsg(null);
    if (newPwd !== confirmPwd) { setPwdMsg({ text: 'New passwords do not match.', ok: false }); return; }
    setPwdSaving(true);
    try {
      await api.patch('/auth/change-password', { current_password: currentPwd, new_password: newPwd });
      setPwdMsg({ text: 'Password changed successfully.', ok: true });
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd('');
    } catch (err: any) {
      setPwdMsg({ text: err.response?.data?.message || 'Failed to change password.', ok: false });
    } finally {
      setPwdSaving(false);
    }
  };

  const handleSmsSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSmsMsg(null);
    setSmsSaving(true);
    try {
      await api.patch('/auth/sms-settings', { phone: smsPhone, sms_opt_in: smsOptIn ? 1 : 0 });
      setSmsMsg({ text: 'SMS settings saved successfully.', ok: true });
    } catch (err: any) {
      setSmsMsg({ text: err.response?.data?.message || 'Failed to save SMS settings.', ok: false });
    } finally {
      setSmsSaving(false);
    }
  };

  if (!profile) {
    return (
      <div className="min-h-screen" style={{ background: 'linear-gradient(160deg, #f0f4ff, #fafbff)' }}>
        <Navbar />
        <div className="flex items-center justify-center py-32">
          <svg className="animate-spin w-8 h-8 text-passport-navy" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(160deg, #f0f4ff 0%, #f8faff 50%, #fafbff 100%)' }}>
      <Navbar />

      {/* Hero header */}
      <div className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0f1b3a 0%, #1a2744 55%, #1e3a6e 100%)' }}>
        <div className="absolute top-[-40%] right-[-5%] w-72 h-72 rounded-full opacity-10 pointer-events-none"
          style={{ background: 'radial-gradient(circle, #c9a227, transparent 70%)' }} />
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
          <Link to="/dashboard"
            className="inline-flex items-center gap-1.5 text-blue-300 hover:text-white text-sm font-medium transition mb-5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Dashboard
          </Link>
          <div className="flex items-center gap-5">
            <div className="w-20 h-20 rounded-3xl flex items-center justify-center text-3xl font-bold flex-shrink-0 shadow-gold"
              style={{ background: 'linear-gradient(135deg, #c9a227, #f0c84a)', color: '#0f1b3a' }}>
              {profile.full_name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-blue-300 text-xs font-semibold tracking-widest uppercase mb-1">Account Profile</p>
              <h1 className="text-2xl font-bold text-white">{profile.full_name}</h1>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-blue-200 text-sm font-mono">{profile.email}</span>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full capitalize"
                  style={profile.role === 'admin'
                    ? { background: 'rgba(139,92,246,0.25)', color: '#c4b5fd' }
                    : { background: 'rgba(96,165,250,0.2)', color: '#93c5fd' }}>
                  {profile.role}
                </span>
              </div>
              <p className="text-blue-300/70 text-xs mt-1">
                Member since {new Date(profile.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Edit profile */}
        <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100" style={{ background: 'linear-gradient(135deg, #f8faff, #f0f4ff)' }}>
            <h2 className="font-bold text-gray-800 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: '#1a2744' }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Edit Profile
            </h2>
          </div>
          <form onSubmit={handleProfileSave} className="p-6 space-y-4">
            <InputField label="Full Name" value={name} onChange={setName} required placeholder="Your full name" />
            <InputField label="Email Address" type="email" value={email} onChange={setEmail} required placeholder="you@example.com" />
            {profileMsg && (
              <div className={`rounded-xl p-3 text-sm flex items-center gap-2 ${profileMsg.ok ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                <span>{profileMsg.ok ? '✅' : '❌'}</span> {profileMsg.text}
              </div>
            )}
            <button type="submit" disabled={profileSaving}
              className="text-white px-6 py-2.5 rounded-xl text-sm font-semibold transition disabled:opacity-60 flex items-center gap-2"
              style={{ background: 'linear-gradient(135deg, #1a2744, #243660)' }}>
              {profileSaving ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Saving...</> : 'Save Changes'}
            </button>
          </form>
        </div>

        {/* Change password */}
        <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100" style={{ background: 'linear-gradient(135deg, #f8faff, #f0f4ff)' }}>
            <h2 className="font-bold text-gray-800 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: '#1a2744' }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Change Password
            </h2>
          </div>
          <form onSubmit={handlePasswordChange} className="p-6 space-y-4">
            <InputField label="Current Password" type="password" value={currentPwd} onChange={setCurrentPwd} required placeholder="Enter current password" />
            <InputField label="New Password" type="password" value={newPwd} onChange={setNewPwd} required minLength={8} placeholder="Minimum 8 characters" />
            <InputField label="Confirm New Password" type="password" value={confirmPwd} onChange={setConfirmPwd} required placeholder="Repeat new password" />
            {pwdMsg && (
              <div className={`rounded-xl p-3 text-sm flex items-center gap-2 ${pwdMsg.ok ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                <span>{pwdMsg.ok ? '✅' : '❌'}</span> {pwdMsg.text}
              </div>
            )}
            <button type="submit" disabled={pwdSaving}
              className="text-white px-6 py-2.5 rounded-xl text-sm font-semibold transition disabled:opacity-60 flex items-center gap-2"
              style={{ background: 'linear-gradient(135deg, #1a2744, #243660)' }}>
              {pwdSaving ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Changing...</> : 'Change Password'}
            </button>
          </form>
        </div>
        {/* SMS Notifications */}
        <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100" style={{ background: 'linear-gradient(135deg, #f8faff, #f0f4ff)' }}>
            <h2 className="font-bold text-gray-800 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: '#1a2744' }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              SMS Notifications
            </h2>
          </div>
          <form onSubmit={handleSmsSave} className="p-6 space-y-4">
            <p className="text-sm text-gray-500">
              Receive real-time SMS alerts when your application status changes. Standard messaging rates apply.
            </p>
            <InputField
              label="Phone Number"
              type="tel"
              value={smsPhone}
              onChange={setSmsPhone}
              placeholder="+60123456789"
            />
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <div className="relative">
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={smsOptIn}
                  onChange={(e) => setSmsOptIn(e.target.checked)}
                />
                <div
                  className="w-10 h-6 rounded-full transition-colors"
                  style={{ background: smsOptIn ? '#1a2744' : '#e5e7eb' }}
                />
                <div
                  className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform"
                  style={{ transform: smsOptIn ? 'translateX(16px)' : 'translateX(0)' }}
                />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-700">Enable SMS notifications</p>
                <p className="text-xs text-gray-400">Application submitted, processing, approved or rejected</p>
              </div>
            </label>
            {smsMsg && (
              <div className={`rounded-xl p-3 text-sm flex items-center gap-2 ${smsMsg.ok ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                <span>{smsMsg.ok ? '✅' : '❌'}</span> {smsMsg.text}
              </div>
            )}
            <button type="submit" disabled={smsSaving}
              className="text-white px-6 py-2.5 rounded-xl text-sm font-semibold transition disabled:opacity-60 flex items-center gap-2"
              style={{ background: 'linear-gradient(135deg, #1a2744, #243660)' }}>
              {smsSaving ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Saving...</> : 'Save SMS Settings'}
            </button>
          </form>
        </div>

        {/* Privacy & Data Export */}
        <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100" style={{ background: 'linear-gradient(135deg, #f8faff, #f0f4ff)' }}>
            <h2 className="font-bold text-gray-800 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: '#1a2744' }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Privacy &amp; Data Export
            </h2>
          </div>
          <div className="p-6">
            <p className="text-sm text-gray-500 mb-4">
              Download a copy of all your personal data stored in this system — profile, applications, notifications, and login history — as a JSON file.
            </p>
            <button
              onClick={handleExportData}
              disabled={exporting}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg, #c9a227, #f0c84a)', color: '#0f1b3a' }}
            >
              {exporting ? (
                <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Preparing...</>
              ) : (
                <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>Download My Data</>
              )}
            </button>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
