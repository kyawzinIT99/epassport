import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import api from '../services/api';
import { Application, User } from '../types';

const statusConfig: Record<string, { label: string; bg: string; text: string; dot: string; icon: string }> = {
  pending: {
    label: 'Pending',
    bg: 'bg-amber-50 border border-amber-200',
    text: 'text-amber-700',
    dot: 'bg-amber-400',
    icon: '⏳',
  },
  processing: {
    label: 'Processing',
    bg: 'bg-blue-50 border border-blue-200',
    text: 'text-blue-700',
    dot: 'bg-blue-500',
    icon: '🔄',
  },
  approved: {
    label: 'Approved',
    bg: 'bg-emerald-50 border border-emerald-200',
    text: 'text-emerald-700',
    dot: 'bg-emerald-500',
    icon: '✅',
  },
  rejected: {
    label: 'Rejected',
    bg: 'bg-red-50 border border-red-200',
    text: 'text-red-700',
    dot: 'bg-red-500',
    icon: '❌',
  },
};

export default function AgentDashboard() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payLoading, setPayLoading] = useState(false);
  const userStr = sessionStorage.getItem('user');
  const user: User = userStr ? JSON.parse(userStr) : null;

  useEffect(() => {
    api.get('/applications').then(({ data }) => {
      setApplications(data);
      setLoading(false);
    });
  }, []);

  const markPaid = async (appId: string) => {
    setPayLoading(true);
    try {
      const { data } = await api.patch(`/applications/${appId}/pay`);
      setApplications((prev) => prev.map((a) => a.id === data.id ? data : a));
      setPayingId(null);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Payment could not be recorded. Please try again.');
    } finally {
      setPayLoading(false);
    }
  };

  const approved = applications.filter((a) => a.status === 'approved').length;
  const pending = applications.filter((a) => a.status === 'pending').length;
  const processing = applications.filter((a) => a.status === 'processing').length;
  const active = applications.filter((a) => ['pending', 'processing'].includes(a.status)).length;
  const pendingPayments = applications.filter(
    (a) => a.processing_tier === 'express' && (a as any).payment_status !== 'paid'
  ).length;

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(160deg, #f0f4ff 0%, #f8faff 50%, #fafbff 100%)' }}>
      <Navbar />

      {/* Hero header */}
      <div
        className="relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0f1b3a 0%, #1a2744 55%, #1e3a6e 100%)' }}
      >
        {/* Purple orb for agent identity */}
        <div
          className="absolute top-[-30%] right-[-5%] w-72 h-72 rounded-full opacity-10 pointer-events-none"
          style={{ background: 'radial-gradient(circle, #8b5cf6, transparent 70%)' }}
        />
        <div
          className="absolute bottom-[-20%] left-[-5%] w-56 h-56 rounded-full opacity-8 pointer-events-none"
          style={{ background: 'radial-gradient(circle, #c9a227, transparent 70%)' }}
        />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="text-xs font-bold px-2 py-0.5 rounded-full tracking-wider uppercase"
                  style={{ background: 'rgba(139,92,246,0.3)', color: '#c4b5fd' }}
                >
                  🤝 Agent Portal
                </span>
                {pendingPayments > 0 && (
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full animate-pulse"
                    style={{ background: 'rgba(251,191,36,0.25)', color: '#fbbf24' }}>
                    💳 {pendingPayments} payment{pendingPayments !== 1 ? 's' : ''} pending
                  </span>
                )}
              </div>
              <h1 className="text-2xl font-bold text-white">{user?.full_name}</h1>
              <p className="text-blue-200 text-sm mt-0.5">Submit and manage client passport applications</p>
            </div>
            <div className="flex items-center gap-3">
              {/* Agents can always submit new applications for clients */}
              <Link
                to="/apply"
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all hover:shadow-gold active:scale-[0.97]"
                style={{ background: 'linear-gradient(135deg, #c9a227, #f0c84a)', color: '#0f1b3a' }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
                New Application for Client
              </Link>
            </div>
          </div>

          {/* Quick stats */}
          {!loading && (
            <div className="grid grid-cols-5 gap-3 mt-6">
              {[
                { label: 'Total Submitted', value: applications.length, color: 'rgba(255,255,255,0.1)', text: 'text-white', sub: 'text-blue-200' },
                { label: 'Approved', value: approved, color: 'rgba(52,211,153,0.15)', text: 'text-emerald-300', sub: 'text-emerald-400' },
                { label: 'Active', value: active, color: 'rgba(251,191,36,0.12)', text: 'text-amber-300', sub: 'text-amber-400' },
                { label: 'Processing', value: processing, color: 'rgba(96,165,250,0.12)', text: 'text-blue-300', sub: 'text-blue-400' },
                { label: 'Payments Due', value: pendingPayments, color: pendingPayments > 0 ? 'rgba(251,191,36,0.2)' : 'rgba(255,255,255,0.07)', text: pendingPayments > 0 ? 'text-yellow-300' : 'text-gray-400', sub: pendingPayments > 0 ? 'text-yellow-400' : 'text-gray-500' },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-xl px-4 py-3 border border-white/10"
                  style={{ background: stat.color }}
                >
                  <p className={`text-2xl font-bold ${stat.text}`}>{stat.value}</p>
                  <p className={`text-xs font-medium mt-0.5 ${stat.sub}`}>{stat.label}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl h-28 shimmer" />
            ))}
          </div>
        ) : applications.length === 0 ? (
          <div className="text-center py-20">
            <div
              className="w-24 h-24 rounded-3xl flex items-center justify-center text-5xl mx-auto mb-5 shadow-navy"
              style={{ background: 'linear-gradient(135deg, #0f1b3a, #1a2744)' }}
            >
              🤝
            </div>
            <h3 className="text-xl font-bold text-gray-800">No client applications yet</h3>
            <p className="text-gray-500 text-sm mt-2">Start by submitting a passport application for your first client</p>
            <Link
              to="/apply"
              className="mt-5 inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-sm text-white transition hover:shadow-lg"
              style={{ background: 'linear-gradient(135deg, #1a2744, #243660)' }}
            >
              New Application for Client
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                {applications.length} Client Application{applications.length !== 1 ? 's' : ''}
              </p>
              {/* Payment guide: shown when agent has no express applications yet */}
              {applications.every((a) => a.processing_tier !== 'express') && (
                <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  <span>⚡</span>
                  <span>Select <strong>Express</strong> when submitting to enable $50 payment tracking</span>
                </div>
              )}
              {/* Payment summary bar: shown when agent has express applications */}
              {applications.some((a) => a.processing_tier === 'express') && (
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-gray-400">Express applications:</span>
                  <span className="font-bold text-emerald-600">
                    ✅ {applications.filter((a) => a.processing_tier === 'express' && (a as any).payment_status === 'paid').length} paid
                  </span>
                  {pendingPayments > 0 && (
                    <span className="font-bold text-amber-600 animate-pulse">
                      💳 {pendingPayments} unpaid
                    </span>
                  )}
                </div>
              )}
            </div>
            {applications.map((app) => {
              const cfg = statusConfig[app.status] || statusConfig.pending;
              const isExpressUnpaid = app.processing_tier === 'express' && (app as any).payment_status !== 'paid';
              const isExpressPaid   = app.processing_tier === 'express' && (app as any).payment_status === 'paid';
              const steps = [
                { key: 'pending', label: 'Submitted', date: app.submitted_at },
                {
                  key: 'processing',
                  label: 'Processing',
                  date: app.status === 'processing' || app.status === 'approved' ? app.reviewed_at : null,
                },
                {
                  key: 'done',
                  label: app.status === 'rejected' ? 'Rejected' : 'Approved',
                  date: (app.status === 'approved' || app.status === 'rejected') ? app.reviewed_at : null,
                },
              ];
              const stepIndex =
                app.status === 'rejected' ? 2
                  : app.status === 'approved' ? 2
                  : app.status === 'processing' ? 1
                  : 0;
              const dotColor = (i: number) => {
                if (app.status === 'rejected' && i === 2) return 'bg-red-500';
                if (i <= stepIndex) return 'bg-passport-navy';
                return 'bg-gray-200';
              };
              const lineColor = (i: number) => i < stepIndex ? 'bg-passport-navy' : 'bg-gray-200';

              return (
                <Link
                  key={app.id}
                  to={`/applications/${app.id}`}
                  className="block bg-white rounded-2xl shadow-card hover:shadow-card-hover card-lift border overflow-hidden group transition"
                  style={{ borderColor: isExpressUnpaid ? '#f59e0b' : '#f3f4f6' }}
                >
                  {/* Amber top stripe for unpaid express */}
                  {isExpressUnpaid && (
                    <div className="h-0.5 w-full" style={{ background: 'linear-gradient(90deg, #f59e0b, #fbbf24, #f59e0b)' }} />
                  )}
                  <div className="flex">
                    {/* Left accent bar */}
                    <div
                      className="w-1.5 flex-shrink-0 rounded-l-2xl"
                      style={{
                        background:
                          app.status === 'approved' ? 'linear-gradient(180deg, #34d399, #10b981)'
                          : app.status === 'rejected' ? 'linear-gradient(180deg, #f87171, #ef4444)'
                          : app.status === 'processing' ? 'linear-gradient(180deg, #60a5fa, #3b82f6)'
                          : 'linear-gradient(180deg, #fbbf24, #f59e0b)',
                      }}
                    />

                    <div className="flex-1 p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="text-xs text-gray-400 font-mono tracking-wider">{app.application_number}</p>
                          <p className="font-bold text-gray-800 mt-0.5 text-base">{app.full_name}</p>
                          <p className="text-sm text-gray-500">
                            {app.nationality} —{' '}
                            <span className="capitalize">{app.passport_type}</span> passport
                          </p>
                        </div>
                        <div className="text-right flex flex-col items-end gap-1.5">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full ${cfg.bg} ${cfg.text}`}>
                            <span className="text-sm">{cfg.icon}</span>
                            {cfg.label}
                          </span>

                          {/* Express tier badges */}
                          {app.processing_tier === 'express' && (
                            <span
                              className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full"
                              style={{ background: 'linear-gradient(135deg, #c9a227, #f0c84a)', color: '#0f1b3a' }}
                            >
                              ⚡ EXPRESS
                            </span>
                          )}

                          {/* Payment status */}
                          {isExpressPaid && (
                            <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                              ✅ Paid $50
                            </span>
                          )}
                          {isExpressUnpaid && (
                            <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-300 animate-pulse">
                              💳 Payment Pending
                            </span>
                          )}

                          {/* Pay Now button — stops Link navigation */}
                          {isExpressUnpaid && (
                            <div
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPayingId(app.id); }}
                              className="cursor-pointer"
                            >
                              <span
                                className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg text-white shadow-sm transition hover:opacity-90 active:scale-95"
                                style={{ background: 'linear-gradient(135deg, #d97706, #f59e0b)' }}
                              >
                                💳 Pay Now
                              </span>
                            </div>
                          )}

                          {/* Agent badge */}
                          <span
                            className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
                            style={{ background: 'rgba(139,92,246,0.12)', color: '#7c3aed' }}
                          >
                            🤝 Submitted by you
                          </span>
                          {app.passport_number && (
                            <span className="text-xs text-gray-400 font-mono">{app.passport_number}</span>
                          )}
                        </div>
                      </div>

                      {/* Status timeline */}
                      <div className="flex items-center gap-0 mt-1">
                        {steps.map((step, i) => (
                          <div key={step.key} className="flex items-center flex-1 last:flex-none">
                            <div className="flex flex-col items-center">
                              <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dotColor(i)}`} />
                              <p className="text-xs text-gray-500 mt-1 whitespace-nowrap font-medium">{step.label}</p>
                              {step.date && (
                                <p className="text-xs text-gray-300 whitespace-nowrap">
                                  {new Date(step.date).toLocaleDateString()}
                                </p>
                              )}
                            </div>
                            {i < steps.length - 1 && (
                              <div className={`flex-1 h-0.5 mx-1 mb-5 ${lineColor(i)}`} />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Arrow indicator */}
                    <div className="flex items-center pr-4 text-gray-300 group-hover:text-gray-500 transition">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Cash Payment Confirmation Modal */}
      {payingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15,27,58,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={() => { if (!payLoading) setPayingId(null); }}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div
              className="px-6 py-5 text-center"
              style={{ background: 'linear-gradient(135deg, #0f1b3a, #1a2744)' }}
            >
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-3"
                style={{ background: 'linear-gradient(135deg, #c9a227, #f0c84a)' }}
              >
                💳
              </div>
              <h2 className="text-lg font-bold text-white">Confirm Cash Payment</h2>
              <p className="text-blue-300 text-sm mt-0.5">Express processing fee</p>
            </div>

            {/* Modal body */}
            <div className="px-6 py-5">
              {/* Amount display */}
              <div className="text-center mb-5">
                <p className="text-4xl font-bold text-gray-800">$50</p>
                <p className="text-sm text-gray-500 mt-1">Express application processing fee</p>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-5">
                <p className="text-xs text-amber-700 text-center leading-relaxed">
                  By confirming, you acknowledge that <strong>$50 cash</strong> has been collected for this express application. This action cannot be undone.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setPayingId(null)}
                  disabled={payLoading}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => markPaid(payingId)}
                  disabled={payLoading}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition disabled:opacity-60 flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg, #d97706, #f59e0b)' }}
                >
                  {payLoading ? (
                    <>
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Recording...
                    </>
                  ) : (
                    <>✅ Confirm Payment</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
