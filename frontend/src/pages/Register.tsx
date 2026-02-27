import { useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

export default function Register() {
  const [form, setForm] = useState({ email: '', password: '', full_name: '' });
  const [isAgent, setIsAgent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');
  const [showPass, setShowPass] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/register', { ...form, role: isAgent ? 'agent' : 'applicant' });
      setRegisteredEmail(form.email);
      setPending(true);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const bgStyle = {
    background: 'linear-gradient(135deg, #0f1b3a 0%, #1a2744 45%, #1e3a6e 75%, #0f2460 100%)',
  };

  if (pending) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" style={bgStyle}>
        <div
          className="absolute top-[-10%] right-[-5%] w-96 h-96 rounded-full opacity-15 animate-float-2 pointer-events-none"
          style={{ background: 'radial-gradient(circle, #c9a227, transparent 70%)' }}
        />
        <div className="relative z-10 bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-slide-up">
          <div
            className="px-8 py-8 text-center"
            style={{ background: 'linear-gradient(135deg, #0f1b3a, #1a2744)' }}
          >
            <div
              className="w-20 h-20 rounded-3xl flex items-center justify-center text-4xl mx-auto mb-4 shadow-gold"
              style={{ background: 'linear-gradient(135deg, #c9a227, #f0c84a)' }}
            >
              📧
            </div>
            <h1 className="text-2xl font-bold text-white">Check Your Email</h1>
            <p className="text-blue-300 text-sm mt-1">Verification link sent</p>
          </div>
          <div className="px-8 py-7 text-center">
            <p className="text-gray-600 text-sm leading-relaxed">
              We sent a verification link to{' '}
              <strong className="text-gray-800 font-semibold">{registeredEmail}</strong>.
              <br />Click the link in the email to activate your account.
            </p>
            <div className="mt-4 p-3 rounded-xl bg-blue-50 border border-blue-100 text-xs text-gray-500">
              Didn't receive it? Check your spam folder or{' '}
              <ResendLink email={registeredEmail} />
            </div>
            <Link
              to="/login"
              className="mt-6 inline-flex items-center gap-2 text-sm font-semibold hover:underline"
              style={{ color: '#1a2744' }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Sign In
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" style={bgStyle}>
      {/* Animated orbs */}
      <div
        className="absolute top-[-10%] left-[-5%] w-96 h-96 rounded-full opacity-20 animate-float-1 pointer-events-none"
        style={{ background: 'radial-gradient(circle, #c9a227, transparent 70%)' }}
      />
      <div
        className="absolute bottom-[-15%] right-[-5%] w-[500px] h-[500px] rounded-full opacity-15 animate-float-2 pointer-events-none"
        style={{ background: 'radial-gradient(circle, #8b5cf6, transparent 70%)' }}
      />
      <div
        className="absolute inset-0 opacity-5 pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      <div className="relative z-10 w-full max-w-md animate-slide-up">
        <div className="text-center mb-6">
          <div
            className="w-20 h-20 rounded-3xl flex items-center justify-center text-4xl mx-auto mb-4 shadow-gold"
            style={{ background: 'linear-gradient(135deg, #c9a227, #f0c84a)' }}
          >
            🛂
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Create Account</h1>
          <p className="text-blue-300 text-sm mt-1 font-medium tracking-wide">REGISTER FOR E-PASSPORT SERVICES</p>
        </div>

        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
          <div
            className="px-8 py-5 text-center"
            style={{ background: 'linear-gradient(135deg, #0f1b3a, #1a2744)' }}
          >
            <h2 className="text-lg font-semibold text-white">New Account</h2>
            <p className="text-blue-300 text-xs mt-0.5">Fill in your details below</p>
          </div>

          <div className="px-8 py-6">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 mb-5 text-sm flex items-start gap-2">
                <svg className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Full Name</label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    value={form.full_name}
                    onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100 transition"
                    placeholder="John Doe"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Email Address</label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100 transition"
                    placeholder="you@example.com"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Password</label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl pl-10 pr-10 py-2.5 text-sm focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100 transition"
                    placeholder="Min. 8 characters"
                    required
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
                  >
                    {showPass ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Agent registration toggle */}
              <label className="flex items-start gap-3 cursor-pointer select-none p-3 rounded-xl border border-gray-200 hover:border-purple-300 transition group">
                <input
                  type="checkbox"
                  checked={isAgent}
                  onChange={(e) => setIsAgent(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-purple-600 flex-shrink-0"
                />
                <div>
                  <p className="text-sm font-semibold text-gray-700 group-hover:text-purple-700 transition">
                    Register as Travel Agent / Partner
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Submit passport applications on behalf of multiple clients
                  </p>
                </div>
              </label>

              <button
                type="submit"
                disabled={loading}
                className="w-full text-white font-semibold py-3 rounded-xl transition-all disabled:opacity-60 disabled:cursor-not-allowed mt-2 flex items-center justify-center gap-2 shadow-navy hover:shadow-lg active:scale-[0.98]"
                style={{ background: loading ? '#94a3b8' : 'linear-gradient(135deg, #1a2744, #243660)' }}
              >
                {loading ? (
                  <>
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Creating account...
                  </>
                ) : (
                  <>
                    Create Account
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </>
                )}
              </button>
            </form>

            <p className="text-center text-sm text-gray-500 mt-6">
              Already have an account?{' '}
              <Link to="/login" className="font-semibold hover:underline" style={{ color: '#1a2744' }}>
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResendLink({ email }: { email: string }) {
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const resend = async () => {
    setLoading(true);
    try {
      await api.post('/auth/resend-verification', { email });
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  if (sent) return <span className="text-green-600 font-semibold">sent!</span>;
  return (
    <button
      onClick={resend}
      disabled={loading}
      className="font-semibold hover:underline disabled:opacity-50"
      style={{ color: '#1a2744' }}
    >
      {loading ? 'sending...' : 'resend it'}
    </button>
  );
}
