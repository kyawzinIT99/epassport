import { useState, FormEvent, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import api from '../services/api';

const DRAFT_KEY = 'apply_draft';

const emptyForm = {
  full_name: '', date_of_birth: '', nationality: '', gender: '',
  place_of_birth: '', address: '', phone: '', email: '', passport_type: 'regular',
  existing_passport_number: '', processing_tier: 'standard',
};

export default function Apply() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [showDraftBanner, setShowDraftBanner] = useState(false);

  // Guard: redirect applicants away if they already have an active application.
  // Agents are exempt — they can submit unlimited applications for different clients.
  useEffect(() => {
    const userStr = sessionStorage.getItem('user');
    const user = userStr ? JSON.parse(userStr) : null;
    if (user?.role === 'agent') {
      setChecking(false);
      return;
    }
    api.get('/applications').then(({ data }) => {
      const blocked = data.some((a: any) => ['pending', 'processing', 'approved', 'rejected'].includes(a.status));
      if (blocked) navigate('/dashboard');
      else {
        setChecking(false);
        // Check for saved draft after guard passes
        const saved = localStorage.getItem(DRAFT_KEY);
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (parsed && Object.values(parsed).some((v) => v !== '' && v !== 'regular')) {
              setShowDraftBanner(true);
            }
          } catch { localStorage.removeItem(DRAFT_KEY); }
        }
      }
    }).catch(() => setChecking(false));
  }, []);

  const [photo, setPhoto] = useState<File | null>(null);
  const [idDoc, setIdDoc] = useState<File | null>(null);
  const [form, setForm] = useState(emptyForm);

  const update = (field: string, value: string) => {
    setForm((f) => {
      const next = { ...f, [field]: value };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
      return next;
    });
  };

  const restoreDraft = () => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) setForm(JSON.parse(saved));
    } catch { /* ignore */ }
    setShowDraftBanner(false);
  };

  const discardDraft = () => {
    localStorage.removeItem(DRAFT_KEY);
    setShowDraftBanner(false);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const formData = new FormData();
      Object.entries(form).forEach(([k, v]) => formData.append(k, v));
      if (photo) formData.append('photo', photo);
      if (idDoc) formData.append('id_document', idDoc);
      const { data } = await api.post('/applications', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      localStorage.removeItem(DRAFT_KEY);
      navigate(`/applications/${data.id}`);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Submission failed');
    } finally {
      setLoading(false);
    }
  };

  const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-passport-navy text-sm';
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1';

  if (checking) {
    return (
      <div className="min-h-screen bg-gray-50">
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
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-passport-navy">Passport Application</h1>
          <p className="text-gray-500 text-sm">Complete all steps to submit your application</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition ${s <= step ? 'bg-passport-navy text-white' : 'bg-gray-200 text-gray-400'}`}>
                {s}
              </div>
              {s < 3 && <div className={`h-1 w-12 rounded ${s < step ? 'bg-passport-navy' : 'bg-gray-200'}`} />}
            </div>
          ))}
          <span className="text-sm text-gray-500 ml-2">
            {step === 1 ? 'Personal Info' : step === 2 ? 'Contact & Passport Type' : 'Documents'}
          </span>
        </div>

        {showDraftBanner && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span>💾</span>
              <span className="text-amber-800">You have a saved draft. Would you like to restore it?</span>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button onClick={restoreDraft} className="text-xs font-semibold text-white px-3 py-1 rounded-lg" style={{ background: 'linear-gradient(135deg, #1a2744, #243660)' }}>
                Restore
              </button>
              <button onClick={discardDraft} className="text-xs font-semibold text-gray-600 px-3 py-1 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 transition">
                Discard
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 rounded-lg p-3 mb-4 text-sm">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
          {step === 1 && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="col-span-1 sm:col-span-1 sm:col-span-2">
                  <label className={labelClass}>Full Name</label>
                  <input className={inputClass} value={form.full_name} onChange={(e) => update('full_name', e.target.value)} required />
                </div>
                <div>
                  <label className={labelClass}>Date of Birth</label>
                  <input type="date" lang="en-GB" className={inputClass} value={form.date_of_birth} onChange={(e) => update('date_of_birth', e.target.value)} required />
                </div>
                <div>
                  <label className={labelClass}>Gender</label>
                  <select className={inputClass} value={form.gender} onChange={(e) => update('gender', e.target.value)} required>
                    <option value="">Select</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Nationality</label>
                  <input className={inputClass} value={form.nationality} onChange={(e) => update('nationality', e.target.value)} required placeholder="e.g. Malaysian" />
                </div>
                <div>
                  <label className={labelClass}>Place of Birth</label>
                  <input className={inputClass} value={form.place_of_birth} onChange={(e) => update('place_of_birth', e.target.value)} required />
                </div>
              </div>
              <button type="button" onClick={() => setStep(2)} className="w-full bg-passport-navy text-white py-2 rounded-lg font-medium hover:bg-blue-900 transition">
                Next: Contact Details
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="col-span-1 sm:col-span-1 sm:col-span-2">
                  <label className={labelClass}>Address</label>
                  <textarea className={inputClass} rows={3} value={form.address} onChange={(e) => update('address', e.target.value)} required />
                </div>
                <div>
                  <label className={labelClass}>Phone Number</label>
                  <input type="tel" className={inputClass} value={form.phone} onChange={(e) => update('phone', e.target.value)} required />
                </div>
                <div>
                  <label className={labelClass}>Email Address</label>
                  <input type="email" className={inputClass} value={form.email} onChange={(e) => update('email', e.target.value)} required />
                </div>
                <div className="col-span-1 sm:col-span-2">
                  <label className={labelClass}>Passport Type</label>
                  <select className={inputClass} value={form.passport_type} onChange={(e) => update('passport_type', e.target.value)}>
                    <option value="regular">Regular</option>
                    <option value="official">Official</option>
                    <option value="diplomatic">Diplomatic</option>
                  </select>
                </div>
                <div className="col-span-1 sm:col-span-2">
                  <label className={labelClass}>
                    Previous Passport Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    className={inputClass}
                    value={form.existing_passport_number}
                    onChange={(e) => update('existing_passport_number', e.target.value.toUpperCase())}
                    placeholder="e.g. AB1234567"
                    maxLength={20}
                    required
                  />
                  {!form.existing_passport_number.trim() && (
                    <p className="text-xs text-red-500 mt-1">Required — must be filled to continue</p>
                  )}
                </div>

                {/* Processing Speed Selector */}
                <div className="col-span-1 sm:col-span-2">
                  <label className={labelClass}>Processing Speed</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
                    <div
                      onClick={() => update('processing_tier', 'standard')}
                      className={`cursor-pointer rounded-xl border-2 p-4 transition ${
                        form.processing_tier === 'standard'
                          ? 'border-passport-navy bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <p className="font-semibold text-sm text-gray-800">Standard</p>
                      <p className="text-xs text-gray-500 mt-0.5">10-15 business days</p>
                      <p className="text-lg font-bold text-gray-700 mt-2">Free</p>
                    </div>
                    <div
                      onClick={() => update('processing_tier', 'express')}
                      className={`cursor-pointer rounded-xl border-2 p-4 transition relative ${
                        form.processing_tier === 'express'
                          ? 'bg-amber-50'
                          : 'border-yellow-200 hover:border-yellow-400'
                      }`}
                      style={{
                        borderColor: form.processing_tier === 'express' ? '#c9a227' : undefined,
                      }}
                    >
                      <span
                        className="absolute top-2 right-2 text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{ background: 'linear-gradient(135deg, #c9a227, #f0c84a)', color: '#0f1b3a' }}
                      >
                        EXPRESS
                      </span>
                      <p className="font-semibold text-sm text-gray-800">Express ⚡</p>
                      <p className="text-xs text-gray-500 mt-0.5">24-72 hours</p>
                      <p className="text-lg font-bold mt-2" style={{ color: '#c9a227' }}>$50</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setStep(1)} className="flex-1 border border-gray-300 text-gray-600 py-2 rounded-lg font-medium hover:bg-gray-50 transition">
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => { if (form.existing_passport_number.trim()) setStep(3); }}
                  disabled={!form.existing_passport_number.trim()}
                  className="flex-1 bg-passport-navy text-white py-2 rounded-lg font-medium hover:bg-blue-900 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next: Documents
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="space-y-4">
                <div>
                  <label className={labelClass}>Passport Photo <span className="text-gray-400">(JPEG/PNG, max 5MB)</span></label>
                  <input
                    type="file"
                    accept="image/jpeg,image/png"
                    onChange={(e) => setPhoto(e.target.files?.[0] || null)}
                    className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-passport-navy file:text-white hover:file:bg-blue-900"
                  />
                  {photo && <p className="text-xs text-green-600 mt-1">Selected: {photo.name}</p>}
                </div>
                <div>
                  <label className={labelClass}>ID Document <span className="text-gray-400">(JPEG/PNG/PDF, max 5MB)</span></label>
                  <p className="text-xs text-gray-400 mb-1.5">e.g. National Registration Card (NRC), birth certificate, or existing passport</p>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,application/pdf"
                    onChange={(e) => setIdDoc(e.target.files?.[0] || null)}
                    className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-passport-navy file:text-white hover:file:bg-blue-900"
                  />
                  {idDoc && <p className="text-xs text-green-600 mt-1">Selected: {idDoc.name}</p>}
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setStep(2)} className="flex-1 border border-gray-300 text-gray-600 py-2 rounded-lg font-medium hover:bg-gray-50 transition">
                  Back
                </button>
                <button type="submit" disabled={loading} className="flex-1 bg-passport-green hover:bg-green-800 text-white py-2 rounded-lg font-medium transition disabled:opacity-50">
                  {loading ? 'Submitting...' : 'Submit Application'}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
      <Footer />
    </div>
  );
}
