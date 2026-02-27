import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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

export default function Dashboard() {
  const navigate = useNavigate();
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const userStr = sessionStorage.getItem('user');
  const user: User = userStr ? JSON.parse(userStr) : null;

  useEffect(() => {
    api.get('/applications').then(({ data }) => {
      setApplications(data);
      setLoading(false);
    });
  }, []);

  const approved = applications.filter((a) => a.status === 'approved').length;
  const pending = applications.filter((a) => a.status === 'pending').length;
  const processing = applications.filter((a) => a.status === 'processing').length;
  // Block new applications if user has any active or rejected (unfinalised) application
  const blockNew = !loading && applications.some((a) => ['pending', 'processing', 'rejected'].includes(a.status));

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(160deg, #f0f4ff 0%, #f8faff 50%, #fafbff 100%)' }}>
      <Navbar />

      {/* Hero header */}
      <div
        className="relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0f1b3a 0%, #1a2744 55%, #1e3a6e 100%)' }}
      >
        <div
          className="absolute top-[-30%] right-[-5%] w-72 h-72 rounded-full opacity-10 pointer-events-none"
          style={{ background: 'radial-gradient(circle, #c9a227, transparent 70%)' }}
        />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-300 text-sm font-medium tracking-wider uppercase mb-1">Welcome back</p>
              <h1 className="text-2xl font-bold text-white">{user?.full_name}</h1>
              <p className="text-blue-200 text-sm mt-0.5">Manage your passport applications</p>
            </div>
            <div className="flex items-center gap-3">
              {/* Live Support shortcut */}
              {!loading && applications.some((a) => ['pending', 'processing'].includes(a.status)) && (
                <button
                  onClick={() => {
                    const active = applications.find((a) => ['pending', 'processing'].includes(a.status));
                    if (active) navigate(`/applications/${active.id}?chat=1`);
                  }}
                  className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl font-medium border border-white/20 text-blue-200 hover:bg-white/10 transition"
                >
                  💬 Live Support
                </button>
              )}
              {!loading && !blockNew ? (
                <Link
                  to="/apply"
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all hover:shadow-gold active:scale-[0.97]"
                  style={{ background: 'linear-gradient(135deg, #c9a227, #f0c84a)', color: '#0f1b3a' }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                  </svg>
                  New Application
                </Link>
              ) : blockNew ? (
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-white/10 text-blue-200 border border-white/20 cursor-not-allowed">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  Application Active
                </div>
              ) : null}
            </div>
          </div>

          {/* Quick stats */}
          {!loading && applications.length > 0 && (
            <div className="grid grid-cols-3 gap-3 mt-6">
              {[
                { label: 'Total', value: applications.length, color: 'rgba(255,255,255,0.1)', text: 'text-white', sub: 'text-blue-200' },
                { label: 'Approved', value: approved, color: 'rgba(52,211,153,0.15)', text: 'text-emerald-300', sub: 'text-emerald-400' },
                { label: 'In Progress', value: pending + processing, color: 'rgba(251,191,36,0.12)', text: 'text-amber-300', sub: 'text-amber-400' },
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
              📄
            </div>
            <h3 className="text-xl font-bold text-gray-800">No applications yet</h3>
            <p className="text-gray-500 text-sm mt-2">Start by applying for your first passport</p>
            <Link
              to="/apply"
              className="mt-5 inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-sm text-white transition hover:shadow-lg"
              style={{ background: 'linear-gradient(135deg, #1a2744, #243660)' }}
            >
              Apply Now
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
              {applications.length} Application{applications.length !== 1 ? 's' : ''}
            </p>
            {applications.map((app) => {
              const cfg = statusConfig[app.status] || statusConfig.pending;
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
                  className="block bg-white rounded-2xl shadow-card hover:shadow-card-hover card-lift border border-gray-100 overflow-hidden group"
                >
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
                          {app.processing_tier === 'express' && (
                            <span
                              className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full"
                              style={{ background: 'linear-gradient(135deg, #c9a227, #f0c84a)', color: '#0f1b3a' }}
                            >
                              ⚡ EXPRESS
                            </span>
                          )}
                          {app.processing_tier === 'express' && app.status !== 'rejected' && (
                            (app as any).payment_status === 'paid' ? (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                ✅ Fee Paid
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-300 animate-pulse">
                                💳 $50 Due
                              </span>
                            )
                          )}
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
    </div>
  );
}
