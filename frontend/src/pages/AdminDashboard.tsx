import { useEffect, useState } from 'react';
import Navbar from '../components/Navbar';
import api from '../services/api';
import { Application, AdminStats, AdminUser, User } from '../types';

interface AnalyticsData {
  monthly: { month: string; count: number }[];
  statusDist: { status: string; count: number }[];
  typeDist: { passport_type: string; count: number }[];
  avgProcessingDays: number | null;
  totalUsers: number;
}

interface AuditEntry {
  id: string;
  admin_name: string;
  action: string;
  target_type: string;
  target_id: string | null;
  details: string;
  created_at: string;
}

const auditActionConfig: Record<string, { icon: string; color: string }> = {
  set_status_approved:   { icon: '✅', color: 'text-emerald-700' },
  set_status_rejected:   { icon: '❌', color: 'text-red-700' },
  set_status_processing: { icon: '🔄', color: 'text-blue-700' },
  set_status_pending:    { icon: '⏳', color: 'text-amber-700' },
  bulk_set_status_approved:   { icon: '✅', color: 'text-emerald-700' },
  bulk_set_status_rejected:   { icon: '❌', color: 'text-red-700' },
  bulk_set_status_processing: { icon: '🔄', color: 'text-blue-700' },
  bulk_set_status_pending:    { icon: '⏳', color: 'text-amber-700' },
  suspend_user:          { icon: '🚫', color: 'text-orange-700' },
  unsuspend_user:        { icon: '✔️', color: 'text-emerald-700' },
  delete_user:           { icon: '🗑️', color: 'text-red-700' },
  create_admin:          { icon: '👤', color: 'text-purple-700' },
  promote_super_admin:   { icon: '⭐', color: 'text-yellow-700' },
  demote_super_admin:    { icon: '⬇️', color: 'text-gray-600' },
};

const statusConfig: Record<string, { bg: string; text: string; badge: string; icon: string }> = {
  pending:    { bg: 'bg-amber-50 border-amber-200',   text: 'text-amber-700',   badge: 'bg-amber-100 text-amber-700 border border-amber-200',   icon: '⏳' },
  processing: { bg: 'bg-blue-50 border-blue-200',     text: 'text-blue-700',    badge: 'bg-blue-100 text-blue-700 border border-blue-200',       icon: '🔄' },
  approved:   { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-700 border border-emerald-200', icon: '✅' },
  rejected:   { bg: 'bg-red-50 border-red-200',       text: 'text-red-700',     badge: 'bg-red-100 text-red-700 border border-red-200',           icon: '❌' },
};

export default function AdminDashboard() {
  const [tab, setTab] = useState<'applications' | 'users' | 'analytics' | 'audit' | 'appointments'>('applications');
  const [applications, setApplications] = useState<Application[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [selected, setSelected] = useState<Application | null>(null);
  const [status, setStatus] = useState('');
  const [notes, setNotes] = useState('');
  const [updating, setUpdating] = useState(false);
  // Bulk selection
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState('processing');
  const [bulkLoading, setBulkLoading] = useState(false);
  // Audit log
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditLoading, setAuditLoading] = useState(false);
  // Duplicate detection
  const [duplicates, setDuplicates] = useState<any[]>([]);
  // AI review — auto-scanned results keyed by application ID
  const [aiResults, setAiResults] = useState<Record<string, any>>({});
  const [aiScanLoading, setAiScanLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [filter, setFilter] = useState('all');
  const [appSearch, setAppSearch] = useState('');
  const [passportTypeFilter, setPassportTypeFilter] = useState('all');

  const exportCSV = () => {
    const headers = ['Application #', 'Full Name', 'Email', 'Phone', 'Nationality', 'Passport Type', 'Status', 'Submitted', 'Passport #', 'Issued', 'Expires'];
    const rows = filtered.map((a) => [
      a.application_number,
      a.full_name,
      a.email,
      (a as any).phone || '',
      a.nationality,
      a.passport_type,
      a.status,
      new Date(a.submitted_at).toLocaleDateString(),
      a.passport_number || '',
      (a as any).issued_at || '',
      (a as any).expires_at || '',
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `applications-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const [userSearch, setUserSearch] = useState('');
  const [userActionLoading, setUserActionLoading] = useState<string | null>(null);
  const [showCreateAdmin, setShowCreateAdmin] = useState(false);
  const [adminForm, setAdminForm] = useState({ email: '', full_name: '', password: '' });
  const [adminFormError, setAdminFormError] = useState('');
  const [adminFormLoading, setAdminFormLoading] = useState(false);
  // Login history modal
  const [loginHistoryUser, setLoginHistoryUser] = useState<AdminUser | null>(null);
  const [loginLogs, setLoginLogs] = useState<any[]>([]);
  const [loginLogsLoading, setLoginLogsLoading] = useState(false);
  // In-app messaging (review panel)
  const [panelMessages, setPanelMessages] = useState<any[]>([]);
  const [panelMsgInput, setPanelMsgInput] = useState('');
  const [panelMsgSending, setPanelMsgSending] = useState(false);
  // CSAT data
  const [csatData, setCsatData] = useState<any | null>(null);
  // Create agent modal (reuses same state as create admin with a flag)
  const [showCreateAgent, setShowCreateAgent] = useState(false);
  const [agentForm, setAgentForm] = useState({ email: '', full_name: '', password: '' });
  const [agentFormError, setAgentFormError] = useState('');
  const [agentFormLoading, setAgentFormLoading] = useState(false);
  // Batch report
  const today = new Date().toISOString().split('T')[0];
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
  const [reportFrom, setReportFrom] = useState(firstOfMonth);
  const [reportTo, setReportTo] = useState(today);
  const [reportStatuses, setReportStatuses] = useState<string[]>(['approved', 'rejected']);
  const [reportAgentFilter, setReportAgentFilter] = useState('all');
  const [reportData, setReportData] = useState<any | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [showReport, setShowReport] = useState(false);

  // Current logged-in admin permission level
  const storedUser: User = JSON.parse(sessionStorage.getItem('user') || '{}');
  const [currentUser, setCurrentUser] = useState<User>(storedUser);
  // Seed from localStorage immediately so buttons show without waiting for API
  const [isSuperAdmin, setIsSuperAdmin] = useState(storedUser.is_super_admin === 1);
  // Live new-application badge
  const [newAppsCount, setNewAppsCount] = useState(0);

  // Appointments
  const [adminAppointments, setAdminAppointments] = useState<any[]>([]);
  const [arrangeAppt, setArrangeAppt] = useState<any | null>(null);
  const [arrangeForm, setArrangeForm] = useState({ status: 'approved', scheduled_date: '', scheduled_time: '', location: '', admin_notes: '' });
  const [arrangeLoading, setArrangeLoading] = useState(false);
  const [arrangeError, setArrangeError] = useState('');
  const [apptPendingCount, setApptPendingCount] = useState(0);

  const fetchAdminAppointments = () =>
    api.get('/appointments').then(({ data }) => {
      setAdminAppointments(data);
      setApptPendingCount(data.filter((a: any) => a.status === 'pending').length);
    }).catch(() => {});

  const generateReport = async () => {
    setReportLoading(true);
    try {
      const params = new URLSearchParams({
        from: reportFrom,
        to: reportTo,
        status: reportStatuses.join(','),
        ...(reportAgentFilter !== 'all' && { agent: reportAgentFilter }),
      });
      const { data } = await api.get(`/admin/report?${params}`);
      setReportData(data);
      setShowReport(true);
    } finally {
      setReportLoading(false);
    }
  };

  const exportReportCSV = () => {
    if (!reportData) return;
    const headers = [
      'App #', 'Full Name', 'Email', 'Phone', 'Nationality',
      'Passport Type', 'Status', 'Tier', 'Payment', 'Fee ($)',
      'Agent', 'Assigned To', 'Submitted', 'Reviewed',
      'Passport #', 'Issued', 'Expires',
    ];
    const rows = reportData.applications.map((a: any) => [
      a.application_number,
      a.full_name,
      a.email,
      a.phone || '',
      a.nationality,
      a.passport_type,
      a.status,
      a.processing_tier || 'standard',
      a.payment_status || 'paid',
      a.tier_price ?? 0,
      a.agent_name || '',
      a.assigned_name || '',
      a.submitted_at ? new Date(a.submitted_at.replace(' ', 'T') + 'Z').toLocaleDateString() : '',
      a.reviewed_at  ? new Date(a.reviewed_at.replace(' ', 'T') + 'Z').toLocaleDateString() : '',
      a.passport_number || '',
      a.issued_at  || '',
      a.expires_at || '',
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href     = url;
    link.download = `epassport-report-${reportFrom}-to-${reportTo}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const openLoginHistory = async (user: AdminUser) => {
    setLoginHistoryUser(user);
    setLoginLogs([]);
    setLoginLogsLoading(true);
    try {
      const { data } = await api.get(`/admin/users/${user.id}/login-logs`);
      setLoginLogs(data);
    } finally {
      setLoginLogsLoading(false);
    }
  };

  const fetchData = async () => {
    const [appsRes, statsRes, usersRes, analyticsRes] = await Promise.all([
      api.get('/admin/applications'),
      api.get('/admin/stats'),
      api.get('/admin/users'),
      api.get('/admin/analytics'),
    ]);
    setApplications(appsRes.data);
    setStats(statsRes.data);
    setUsers(usersRes.data);
    setAnalytics(analyticsRes.data);

    // Auto-scan all pending and processing applications with AI
    const toScan = (appsRes.data as Application[]).filter(
      (a) => a.status === 'pending' || a.status === 'processing'
    );
    if (toScan.length > 0) {
      setAiScanLoading(true);
      const results = await Promise.allSettled(
        toScan.map((a) => api.get(`/admin/applications/${a.id}/ai-review`))
      );
      const newResults: Record<string, any> = {};
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') newResults[toScan[i].id] = r.value.data;
      });
      setAiResults((prev) => ({ ...prev, ...newResults }));
      setAiScanLoading(false);
    }
  };

  const loadAuditLogs = async () => {
    setAuditLoading(true);
    try {
      const { data } = await api.get('/admin/audit-log?limit=100');
      setAuditLogs(data.logs);
      setAuditTotal(data.total);
    } finally {
      setAuditLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Refresh current user from API so is_super_admin is always up-to-date
    api.get('/auth/me').then(({ data }) => {
      setCurrentUser(data);
      setIsSuperAdmin(data.is_super_admin === 1);
      sessionStorage.setItem('user', JSON.stringify({ ...data }));
    }).catch(() => {});
  }, []);
  useEffect(() => {
    if (tab === 'audit') loadAuditLogs();
    if (tab === 'analytics') {
      api.get('/admin/csat').then(({ data }) => setCsatData(data)).catch(() => {});
    }
    if (tab === 'appointments') fetchAdminAppointments();
  }, [tab]);

  // Live new-application badge: SSE → Navbar dispatches CustomEvent → we listen here
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as Application;
      setApplications((prev) => {
        if (prev.find((a) => a.id === detail.id)) return prev;
        return [detail, ...prev];
      });
      setStats((prev) => prev ? { ...prev, pending: (prev.pending ?? 0) + 1 } : prev);
      if (tab !== 'applications') setNewAppsCount((n) => n + 1);
    };
    window.addEventListener('app:new_application', handler);
    return () => window.removeEventListener('app:new_application', handler);
  }, [tab]);
  // Live incoming messages from applicants via SSE → no reload needed
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!selected || detail.application_id !== selected.id) return;
      const msg = detail.message;
      setPanelMessages((prev: any[]) => {
        if (prev.find((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    };
    window.addEventListener('app:new_message', handler);
    return () => window.removeEventListener('app:new_message', handler);
  }, [selected?.id]);

  useEffect(() => {
    if (!selected) { setDuplicates([]); setPanelMessages([]); return; }
    api.get(`/admin/applications/${selected.id}/duplicates`)
      .then(({ data }) => setDuplicates(data))
      .catch(() => setDuplicates([]));
    api.get(`/applications/${selected.id}/messages`)
      .then(({ data }) => setPanelMessages(data))
      .catch(() => setPanelMessages([]));
  }, [selected?.id]);

  const sendPanelMessage = async () => {
    if (!selected || !panelMsgInput.trim() || panelMsgSending) return;
    setPanelMsgSending(true);
    try {
      const { data } = await api.post(`/applications/${selected.id}/messages`, { content: panelMsgInput.trim() });
      setPanelMessages((prev) => [...prev, data]);
      setPanelMsgInput('');
    } finally {
      setPanelMsgSending(false);
    }
  };

  const runAIReview = async () => {
    if (!selected) return;
    setAiLoading(true);
    try {
      const { data } = await api.get(`/admin/applications/${selected.id}/ai-review`);
      setAiResults((prev) => ({ ...prev, [selected.id]: data }));
    } catch (err: any) {
      setAiResults((prev) => ({ ...prev, [selected.id]: { error: err.response?.data?.message || 'AI review failed' } }));
    } finally {
      setAiLoading(false);
    }
  };

  const handleReview = async () => {
    if (!selected || !status) return;
    setUpdating(true);
    await api.patch(`/admin/applications/${selected.id}/review`, { status, admin_notes: notes });
    await fetchData();
    setSelected(null); setStatus(''); setNotes('');
    setUpdating(false);
  };

  const handleBulkReview = async () => {
    if (checkedIds.size === 0) return;
    setBulkLoading(true);
    try {
      await api.post('/admin/applications/bulk-review', {
        ids: Array.from(checkedIds),
        status: bulkStatus,
      });
      setCheckedIds(new Set());
      await fetchData();
    } finally {
      setBulkLoading(false);
    }
  };

  const toggleCheck = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setCheckedIds((prev) =>
      prev.size === filtered.length ? new Set() : new Set(filtered.map((a) => a.id))
    );
  };

  const filtered = applications.filter((a) => {
    if (filter === 'express') return a.processing_tier === 'express';
    if (filter === 'unpaid') return a.processing_tier === 'express' && (a as any).payment_status !== 'paid';
    if (filter !== 'all' && a.status !== filter) return false;
    if (passportTypeFilter !== 'all' && a.passport_type !== passportTypeFilter) return false;
    if (appSearch.trim()) {
      const q = appSearch.trim().toLowerCase();
      return (
        a.full_name.toLowerCase().includes(q) ||
        a.email.toLowerCase().includes(q) ||
        a.application_number.toLowerCase().includes(q) ||
        (a.passport_number || '').toLowerCase().includes(q) ||
        a.nationality.toLowerCase().includes(q) ||
        a.passport_type.toLowerCase().includes(q) ||
        (a.phone || '').includes(q)
      );
    }
    return true;
  });

  const statCards = stats ? [
    { label: 'Total',      value: stats.total,               icon: '📋', grad: 'linear-gradient(135deg, #1a2744, #243660)', sub: 'text-blue-200' },
    { label: 'Pending',    value: stats.pending,             icon: '⏳', grad: 'linear-gradient(135deg, #b45309, #d97706)', sub: 'text-amber-200' },
    { label: 'Processing', value: stats.processing,          icon: '🔄', grad: 'linear-gradient(135deg, #1d4ed8, #2563eb)', sub: 'text-blue-200' },
    { label: 'Approved',   value: stats.approved,            icon: '✅', grad: 'linear-gradient(135deg, #065f46, #059669)', sub: 'text-emerald-200' },
    { label: 'Rejected',   value: stats.rejected,            icon: '❌', grad: 'linear-gradient(135deg, #991b1b, #dc2626)', sub: 'text-red-200' },
    { label: 'Flagged',    value: stats.flagged,             icon: '⚠️', grad: 'linear-gradient(135deg, #7c2d12, #c2410c)', sub: 'text-orange-200' },
    { label: 'Express',    value: stats.express_count ?? 0,  icon: '⚡', grad: 'linear-gradient(135deg, #c9a227, #f0c84a)', sub: 'text-yellow-900' },
  ] : [];

  const tabs = [
    { key: 'applications', label: 'Applications', icon: '📋' },
    { key: 'users',        label: 'Users',        icon: '👥' },
    { key: 'analytics',    label: 'Analytics',    icon: '📊' },
    { key: 'audit',        label: 'Audit Log',    icon: '🔍' },
    { key: 'appointments', label: 'Appointments', icon: '📅' },
  ] as const;

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(160deg, #f0f4ff 0%, #f8faff 50%, #fafbff 100%)' }}>
      <Navbar />

      {/* Hero header */}
      <div
        className="relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0f1b3a 0%, #1a2744 55%, #1e3a6e 100%)' }}
      >
        <div
          className="absolute top-[-40%] right-[-5%] w-80 h-80 rounded-full opacity-10 pointer-events-none"
          style={{ background: 'radial-gradient(circle, #c9a227, transparent 70%)' }}
        />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-7">
          <div className="flex items-center justify-between mb-7">
            <div>
              <p className="text-blue-300 text-xs font-semibold tracking-widest uppercase mb-1">Admin Console</p>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
                <span
                  className="text-xs font-bold px-2.5 py-1 rounded-full border"
                  style={isSuperAdmin
                    ? { background: 'linear-gradient(135deg, #c9a227, #f0c84a)', color: '#0f1b3a', borderColor: '#c9a227' }
                    : { background: 'rgba(255,255,255,0.12)', color: '#93c5fd', borderColor: 'rgba(255,255,255,0.2)' }
                  }
                >
                  {isSuperAdmin ? '⭐ Super Admin' : '👤 Admin'}
                </span>
              </div>
              <p className="text-blue-200 text-sm mt-0.5">Manage applications, users & analytics</p>
            </div>
            {/* Tab switcher inside hero */}
            <div
              className="flex rounded-2xl overflow-hidden border border-white/10"
              style={{ background: 'rgba(255,255,255,0.07)' }}
            >
              {tabs.map(({ key, label, icon }) => (
                <button
                  key={key}
                  onClick={() => {
                    setTab(key);
                    if (key === 'applications') setNewAppsCount(0);
                  }}
                  className={`px-5 py-2.5 text-sm font-medium transition flex items-center gap-1.5 ${
                    tab === key
                      ? 'text-passport-navy-dark font-bold'
                      : 'text-blue-200 hover:text-white hover:bg-white/5'
                  }`}
                  style={tab === key ? { background: 'linear-gradient(135deg, #c9a227, #f0c84a)', color: '#0f1b3a' } : {}}
                >
                  <span>{icon}</span>
                  <span>{label}</span>
                  {key === 'applications' && newAppsCount > 0 && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-500 text-white font-bold animate-pulse">
                      +{newAppsCount}
                    </span>
                  )}
                  {key === 'users' && users.length > 0 && (
                    <span
                      className="text-xs px-1.5 py-0.5 rounded-full"
                      style={tab === key ? { background: 'rgba(15,27,58,0.2)', color: '#0f1b3a' } : { background: 'rgba(255,255,255,0.15)', color: '#fff' }}
                    >
                      {users.length}
                    </span>
                  )}
                  {key === 'appointments' && apptPendingCount > 0 && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-500 text-white font-bold animate-pulse">
                      {apptPendingCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Stat cards */}
          {stats && (
            <div className="grid grid-cols-7 gap-3">
              {statCards.map(({ label, value, icon, grad, sub }) => (
                <div
                  key={label}
                  className="rounded-2xl p-4 text-white relative overflow-hidden"
                  style={{ background: grad }}
                >
                  <div className="absolute -top-2 -right-2 text-3xl opacity-20">{icon}</div>
                  <p className="text-2xl font-bold">{value}</p>
                  <p className={`text-xs font-medium mt-0.5 ${sub}`}>{label}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* ── Applications Tab ────────────────────────────────────────────── */}
        {tab === 'applications' && (
          <div className="flex gap-6">
            <div className="flex-1 min-w-0">
              {/* Search bar */}
              <div className="relative mb-4">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={appSearch}
                  onChange={(e) => setAppSearch(e.target.value)}
                  placeholder="Search by name, email, application number, passport number, nationality..."
                  className="w-full pl-9 pr-9 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100 transition"
                />
                {appSearch && (
                  <button onClick={() => setAppSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
                )}
              </div>
              {(appSearch || passportTypeFilter !== 'all' || filter !== 'all') && filtered.length > 0 && (
                <p className="text-xs text-gray-400 mb-3">
                  Showing <span className="font-semibold text-gray-700">{filtered.length}</span> of {applications.length} applications
                </p>
              )}

              {/* Filter pills — status + passport type */}
              <div className="flex items-center gap-2 mb-5 flex-wrap">
                {['all', 'pending', 'processing', 'approved', 'rejected'].map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-4 py-1.5 rounded-full text-sm font-semibold capitalize transition ${
                      filter === f
                        ? 'text-white shadow-sm'
                        : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                    }`}
                    style={filter === f ? { background: 'linear-gradient(135deg, #1a2744, #243660)' } : {}}
                  >
                    {f === 'all' ? `All (${applications.length})` : f}
                  </button>
                ))}
                <button
                  onClick={() => setFilter(filter === 'express' ? 'all' : 'express')}
                  className={`px-4 py-1.5 rounded-full text-sm font-semibold transition ${
                    filter === 'express' ? 'shadow-sm' : 'bg-white text-gray-600 border border-yellow-200 hover:bg-amber-50'
                  }`}
                  style={filter === 'express' ? { background: 'linear-gradient(135deg, #c9a227, #f0c84a)', color: '#0f1b3a' } : {}}
                >
                  ⚡ Express {stats?.express_count ? `(${stats.express_count})` : ''}
                </button>
                {(() => {
                  const unpaidCount = applications.filter(
                    (a) => a.processing_tier === 'express' && (a as any).payment_status !== 'paid'
                  ).length;
                  return unpaidCount > 0 ? (
                    <button
                      onClick={() => setFilter(filter === 'unpaid' ? 'all' : 'unpaid')}
                      className={`px-4 py-1.5 rounded-full text-sm font-semibold transition ${
                        filter === 'unpaid' ? 'shadow-sm text-white' : 'bg-amber-50 text-amber-700 border border-amber-300 hover:bg-amber-100 animate-pulse'
                      }`}
                      style={filter === 'unpaid' ? { background: 'linear-gradient(135deg, #d97706, #f59e0b)' } : {}}
                    >
                      💳 Unpaid ({unpaidCount})
                    </button>
                  ) : null;
                })()}
                <div className="w-px h-5 bg-gray-200 mx-1" />
                {['all', 'regular', 'official', 'diplomatic'].map((t) => (
                  <button
                    key={t}
                    onClick={() => setPassportTypeFilter(t)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold capitalize transition ${
                      passportTypeFilter === t
                        ? 'text-white shadow-sm'
                        : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'
                    }`}
                    style={passportTypeFilter === t ? { background: 'linear-gradient(135deg, #c9a227, #f0c84a)', color: '#0f1b3a' } : {}}
                  >
                    {t === 'all' ? 'All Types' : t}
                  </button>
                ))}
                {(appSearch || passportTypeFilter !== 'all') && (
                  <button
                    onClick={() => { setAppSearch(''); setPassportTypeFilter('all'); }}
                    className="text-xs text-red-500 hover:text-red-700 font-medium flex items-center gap-1 transition"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Clear filters
                  </button>
                )}
                <button
                  onClick={exportCSV}
                  disabled={filtered.length === 0}
                  className="ml-auto flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition disabled:opacity-40"
                  title="Download filtered list as CSV"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Export CSV
                </button>
                {filtered.length > 0 && (
                  <label className={`flex items-center gap-1.5 text-sm font-medium text-gray-600 cursor-pointer select-none bg-white border border-gray-200 rounded-full px-3 py-1.5 hover:bg-gray-50 transition ${appSearch || passportTypeFilter !== 'all' ? '' : 'ml-auto'}`}>
                    <input
                      type="checkbox"
                      checked={checkedIds.size === filtered.length && filtered.length > 0}
                      onChange={toggleAll}
                      className="w-4 h-4 rounded border-gray-300 accent-yellow-500"
                    />
                    Select All
                  </label>
                )}
              </div>

              <div className="space-y-3">
                {filtered.length === 0 && (
                  <div className="text-center py-16 text-gray-400">
                    <svg className="w-10 h-10 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <p className="font-medium">No applications found</p>
                    {(appSearch || passportTypeFilter !== 'all') && (
                      <button onClick={() => { setAppSearch(''); setPassportTypeFilter('all'); setFilter('all'); }}
                        className="mt-2 text-sm text-blue-500 hover:underline">Clear all filters</button>
                    )}
                  </div>
                )}
                {filtered.map((app) => {
                  const cfg = statusConfig[app.status] || statusConfig.pending;
                  const isSelected = selected?.id === app.id;
                  const isChecked = checkedIds.has(app.id);
                  return (
                    <div
                      key={app.id}
                      className={`w-full bg-white rounded-2xl border card-lift overflow-hidden transition flex ${
                        isSelected ? 'border-passport-navy shadow-navy' : isChecked ? 'border-yellow-400 shadow-sm' : 'border-gray-100 shadow-card'
                      }`}
                    >
                      {/* Checkbox */}
                      <div className="flex items-center px-4 border-r border-gray-100 flex-shrink-0">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleCheck(app.id)}
                          className="w-4 h-4 rounded border-gray-300 accent-yellow-500 cursor-pointer"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                      {/* Colored status bar */}
                      <div
                        className="w-1.5 flex-shrink-0"
                        style={{
                          background:
                            app.status === 'approved' ? 'linear-gradient(180deg, #34d399, #10b981)'
                            : app.status === 'rejected' ? 'linear-gradient(180deg, #f87171, #ef4444)'
                            : app.status === 'processing' ? 'linear-gradient(180deg, #60a5fa, #3b82f6)'
                            : 'linear-gradient(180deg, #fbbf24, #f59e0b)',
                        }}
                      />
                      {/* Card content – clickable */}
                      <button
                        className="flex-1 px-5 py-4 text-left min-w-0"
                        onClick={() => {
                          // Use local data immediately for instant response, then fetch fresh full data
                          // This ensures the review panel always shows complete information even when
                          // the application was added via SSE (which only contains partial fields)
                          setSelected(app); setStatus(app.status ?? 'pending'); setNotes(app.admin_notes || '');
                          api.get(`/applications/${app.id}`).then(({ data }) => {
                            setSelected((prev) => prev?.id === data.id ? data : prev);
                            setStatus((prev) => prev === (app.status ?? 'pending') ? data.status : prev);
                          }).catch(() => {});
                        }}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="font-bold text-gray-800">{app.full_name}</p>
                              {app.support_chat_open === 1 && (
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" title="Live support active" />
                              )}
                            </div>
                            <p className="text-xs font-mono text-gray-400 mt-0.5">{app.application_number}</p>
                            <p className="text-xs text-gray-500 mt-1 capitalize">{app.nationality} — {app.passport_type}</p>
                            {(app as any).assigned_name && (
                              <p className="text-xs text-blue-500 mt-0.5 font-medium">👤 {(app as any).assigned_name}</p>
                            )}
                            {app.agent_name && (
                              <p className="text-xs text-purple-500 mt-0.5 font-medium">🤝 Agent: {app.agent_name}</p>
                            )}
                          </div>
                          <div className="text-right flex flex-col items-end gap-1.5 flex-shrink-0 ml-3">
                            <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ${cfg.badge}`}>
                              {cfg.icon} {app.status}
                            </span>
                            {app.processing_tier === 'express' && (
                              <span
                                className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full"
                                style={{ background: 'linear-gradient(135deg, #c9a227, #f0c84a)', color: '#0f1b3a' }}
                              >
                                ⚡ EXPRESS
                              </span>
                            )}
                            {app.processing_tier === 'express' && (
                              (app as any).payment_status === 'paid' ? (
                                <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  ✅ Paid
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-300 animate-pulse">
                                  💳 Unpaid
                                </span>
                              )
                            )}
                            {aiResults[app.id] && !aiResults[app.id].error && (() => {
                              const riskBadge: Record<string, string> = {
                                LOW:      'bg-emerald-100 text-emerald-700 border border-emerald-200',
                                MEDIUM:   'bg-amber-100 text-amber-700 border border-amber-200',
                                HIGH:     'bg-orange-100 text-orange-700 border border-orange-200',
                                CRITICAL: 'bg-red-100 text-red-700 border border-red-200',
                              };
                              const r = aiResults[app.id];
                              return (
                                <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${riskBadge[r.riskLevel] || ''}`}>
                                  🤖 {r.riskLevel}
                                </span>
                              );
                            })()}
                            {aiScanLoading && !aiResults[app.id] && (app.status === 'pending' || app.status === 'processing') && (
                              <span className="text-xs text-gray-400 animate-pulse">AI scanning...</span>
                            )}
                            <p className="text-xs text-gray-400">{new Date(app.submitted_at).toLocaleDateString()}</p>
                          </div>
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Review Panel */}
            {selected && (
              <div className="w-80 flex-shrink-0">
                <div className="bg-white rounded-2xl shadow-card border border-gray-100 sticky top-4 max-h-[calc(100vh-6rem)] overflow-y-auto">
                  <div
                    className="px-5 py-4 rounded-t-2xl"
                    style={{ background: 'linear-gradient(135deg, #0f1b3a, #1a2744)' }}
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-white text-sm">Review Application</h3>
                      <button
                        onClick={() => setSelected(null)}
                        className="text-blue-300 hover:text-white transition text-lg leading-none"
                      >
                        ×
                      </button>
                    </div>
                    <p className="text-blue-200 text-xs mt-1 font-mono">{selected.application_number}</p>
                  </div>

                  <div className="p-5">
                    <p className="font-semibold text-gray-800">{selected.full_name}</p>
                    <p className="text-xs text-gray-500 mt-0.5 capitalize">{selected.nationality} · {selected.passport_type} passport</p>

                    {/* ── Duplicate alert ── */}
                    {duplicates.length > 0 && (() => {
                      const hasHigh = duplicates.some((d) => d.confidence === 'HIGH');
                      return (
                        <div className={`mt-3 rounded-xl border p-3 ${hasHigh ? 'border-red-300 bg-red-50' : 'border-orange-300 bg-orange-50'}`}>
                          <p className={`text-xs font-bold flex items-center gap-1.5 mb-1 ${hasHigh ? 'text-red-700' : 'text-orange-700'}`}>
                            {hasHigh ? '🚨' : '⚠️'} Duplicate Alert ({duplicates.length})
                          </p>
                          <p className={`text-xs mb-2 ${hasHigh ? 'text-red-600' : 'text-orange-600'}`}>
                            {hasHigh
                              ? 'Same previous passport number found on another account — likely fraud.'
                              : 'Same name + date of birth found on another account — possible duplicate.'}
                          </p>
                          <div className="space-y-1.5">
                            {duplicates.map((d) => (
                              <div key={d.id} className="bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="font-semibold text-gray-700">{d.application_number}</p>
                                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${d.confidence === 'HIGH' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                                    {d.confidence}
                                  </span>
                                </div>
                                <p className="text-gray-500">{d.user_email}</p>
                                {d.existing_passport_number && (
                                  <p className="text-gray-400 font-mono">prev: {d.existing_passport_number}</p>
                                )}
                                <p className={`font-medium mt-0.5 capitalize ${
                                  d.status === 'approved' ? 'text-emerald-600'
                                  : d.status === 'rejected' ? 'text-red-600'
                                  : d.status === 'processing' ? 'text-blue-600'
                                  : 'text-amber-600'
                                }`}>
                                  {d.status === 'approved' ? '✅' : d.status === 'rejected' ? '❌' : d.status === 'processing' ? '🔄' : '⏳'} {d.status}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Personal Information */}
                    <div className="mt-4 space-y-1.5">
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Applicant Details</p>
                      {([
                        { label: 'Date of Birth', value: (selected as any).date_of_birth },
                        { label: 'Gender',        value: (selected as any).gender },
                        { label: 'Place of Birth', value: (selected as any).place_of_birth },
                        { label: 'Address',       value: (selected as any).address },
                        { label: 'Phone',         value: (selected as any).phone },
                        { label: 'Email',         value: (selected as any).email },
                        { label: 'Prev. Passport', value: (selected as any).existing_passport_number },
                      ] as { label: string; value: string }[]).map(({ label, value }) => (
                        <div key={label} className="flex gap-2 text-xs">
                          <span className="text-gray-400 font-medium flex-shrink-0 w-24">{label}</span>
                          <span className={`break-all font-mono ${label === 'Prev. Passport' && value ? 'text-orange-600 font-semibold' : 'text-gray-700'}`}>
                            {value || '—'}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Passport Details (approved only) */}
                    {selected.status === 'approved' && selected.passport_number && (
                      <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 space-y-1.5">
                        <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-2">Passport Issued</p>
                        {([
                          { label: 'Passport No.', value: selected.passport_number },
                          { label: 'Issued',       value: selected.issued_at ? new Date(selected.issued_at.replace(' ', 'T') + 'Z').toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—' },
                          { label: 'Expires',      value: selected.expires_at ? new Date(selected.expires_at.replace(' ', 'T') + 'Z').toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—' },
                        ] as { label: string; value: string }[]).map(({ label, value }) => (
                          <div key={label} className="flex gap-2 text-xs">
                            <span className="text-emerald-600 font-medium flex-shrink-0 w-24">{label}</span>
                            <span className="font-mono font-semibold text-emerald-800 break-all">{value}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Documents */}
                    <div className="mt-4 space-y-3">
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Documents</p>

                      {selected.photo_path ? (
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <p className="text-xs font-medium text-gray-600">Passport Photo</p>
                            <a
                              href={`/uploads/${selected.photo_path}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs font-medium hover:underline"
                              style={{ color: '#1a2744' }}
                            >
                              Open ↗
                            </a>
                          </div>
                          <img
                            src={`/uploads/${selected.photo_path}`}
                            alt="Passport photo"
                            className="w-full rounded-xl border border-gray-200 bg-gray-100"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                              (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                            }}
                          />
                          <p className="hidden text-xs text-red-400 mt-1">
                            Image failed to load —{' '}
                            <a href={`/uploads/${selected.photo_path}`} target="_blank" rel="noreferrer" className="underline">open directly</a>
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs text-red-400 bg-red-50 p-2 rounded-lg">No photo uploaded</p>
                      )}

                      {selected.id_document_path ? (
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <p className="text-xs font-medium text-gray-600">ID Document</p>
                            <a
                              href={`/uploads/${selected.id_document_path}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs font-medium hover:underline"
                              style={{ color: '#1a2744' }}
                            >
                              Open ↗
                            </a>
                          </div>
                          {selected.id_document_path.endsWith('.pdf') ? (
                            <a
                              href={`/uploads/${selected.id_document_path}`}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-2 text-xs font-medium p-3 bg-blue-50 rounded-xl border border-blue-100 hover:bg-blue-100 transition"
                              style={{ color: '#1a2744' }}
                            >
                              📄 View PDF Document
                            </a>
                          ) : (
                            <>
                              <img
                                src={`/uploads/${selected.id_document_path}`}
                                alt="ID document"
                                className="w-full rounded-xl border border-gray-200 bg-gray-100"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                  (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                                }}
                              />
                              <p className="hidden text-xs text-red-400 mt-1">
                                Image failed —{' '}
                                <a href={`/uploads/${selected.id_document_path}`} target="_blank" rel="noreferrer" className="underline">open directly</a>
                              </p>
                            </>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-red-400 bg-red-50 p-2 rounded-lg">No ID document uploaded</p>
                      )}
                    </div>

                    {/* ── AI Review ── */}
                    <div className="mt-4">
                      <button
                        onClick={runAIReview}
                        disabled={aiLoading}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition disabled:opacity-50"
                        style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', color: '#fff' }}
                      >
                        {aiLoading ? (
                          <>
                            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Analysing...
                          </>
                        ) : (
                          <><span>🤖</span> {selected && aiResults[selected.id] ? 'Re-run AI Review' : 'Run AI Risk Review'}</>
                        )}
                      </button>

                      {(() => {
                        const ar = selected ? aiResults[selected.id] : null;
                        if (!ar) return null;
                        if (ar.error) return (
                          <div className="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl p-2">
                            {ar.error}
                          </div>
                        );
                        const riskColor: Record<string, { bg: string; text: string; border: string }> = {
                          LOW:      { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
                          MEDIUM:   { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200'   },
                          HIGH:     { bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200'  },
                          CRITICAL: { bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200'     },
                        };
                        const recIcon: Record<string, string> = { APPROVE: '✅', REVIEW: '⚠️', REJECT: '❌' };
                        const c = riskColor[ar.riskLevel] || riskColor.MEDIUM;
                        return (
                          <div className={`mt-3 rounded-xl border p-3 ${c.bg} ${c.border}`}>
                            <div className="flex items-center justify-between mb-2">
                              <span className={`text-xs font-bold uppercase tracking-wider ${c.text}`}>
                                🤖 AI · {ar.riskLevel} RISK
                              </span>
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${c.bg} ${c.border} ${c.text}`}>
                                {recIcon[ar.recommendation]} {ar.recommendation}
                              </span>
                            </div>
                            <p className="text-xs text-gray-700 mb-2 leading-relaxed">{ar.summary}</p>
                            {ar.dataConsistency && (
                              <p className="text-xs text-gray-500 italic mb-2">Consistency: {ar.dataConsistency}</p>
                            )}
                            {ar.findings.length > 0 && (
                              <ul className="space-y-1">
                                {ar.findings.map((f: string, i: number) => (
                                  <li key={i} className={`text-xs flex gap-1.5 ${c.text}`}>
                                    <span className="flex-shrink-0 mt-0.5">•</span>
                                    <span>{f}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                            <p className="text-xs text-gray-400 mt-2 text-right">
                              Confidence {ar.confidence}% · {new Date(ar.reviewedAt).toLocaleTimeString()}
                            </p>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Messaging thread */}
                    <div className="mt-5">
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Messages</p>
                      <div className="space-y-2 max-h-40 overflow-y-auto mb-2 pr-0.5">
                        {panelMessages.length === 0 && (
                          <p className="text-xs text-gray-400 text-center py-3">No messages yet</p>
                        )}
                        {panelMessages.map((msg) => (
                          <div key={msg.id} className={`flex ${msg.sender_role === 'admin' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs ${msg.sender_role === 'admin' ? 'text-white rounded-br-sm' : 'bg-gray-100 text-gray-700 rounded-bl-sm'}`}
                              style={msg.sender_role === 'admin' ? { background: 'linear-gradient(135deg, #1a2744, #243660)' } : {}}>
                              {msg.sender_role !== 'admin' && <p className="font-bold text-amber-600 mb-0.5">{msg.sender_name}</p>}
                              <p>{msg.content}</p>
                              <p className={`text-[10px] mt-1 ${msg.sender_role === 'admin' ? 'text-blue-300' : 'text-gray-400'}`}>
                                {new Date(msg.created_at.replace(' ', 'T') + 'Z').toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          value={panelMsgInput}
                          onChange={(e) => setPanelMsgInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); sendPanelMessage(); } }}
                          placeholder="Reply to applicant..."
                          className="flex-1 border border-gray-200 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:border-yellow-400 transition"
                        />
                        <button
                          onClick={sendPanelMessage}
                          disabled={!panelMsgInput.trim() || panelMsgSending}
                          className="flex-shrink-0 text-white px-3 py-2 rounded-lg text-xs font-bold transition disabled:opacity-40"
                          style={{ background: 'linear-gradient(135deg, #1a2744, #243660)' }}
                        >
                          {panelMsgSending ? '...' : 'Send'}
                        </button>
                      </div>
                    </div>

                    {/* Processing tier + Payment */}
                    {(selected as any).processing_tier === 'express' && (
                      <div className="mt-4 rounded-xl border overflow-hidden"
                        style={{ borderColor: (selected as any).payment_status === 'paid' ? '#6ee7b7' : '#fbbf24' }}>
                        {/* Header row */}
                        <div className="flex items-center gap-2 px-3 py-2.5"
                          style={{ background: (selected as any).payment_status === 'paid'
                            ? 'linear-gradient(135deg, #ecfdf5, #d1fae5)'
                            : 'linear-gradient(135deg, #fffbeb, #fef3c7)' }}>
                          <span className="font-bold text-xs" style={{ color: '#c9a227' }}>⚡ EXPRESS TIER</span>
                          <span className="text-xs font-bold ml-auto">
                            {(selected as any).payment_status === 'paid' ? (
                              <span className="text-emerald-700">✅ Paid · $50</span>
                            ) : (
                              <span className="text-amber-700 animate-pulse">💳 Payment Pending · $50</span>
                            )}
                          </span>
                        </div>
                        {/* Admin action: mark payment received */}
                        {(selected as any).payment_status !== 'paid' && (
                          <div className="px-3 py-2.5 bg-white border-t border-amber-100">
                            <p className="text-xs text-gray-500 mb-2">
                              Payment not yet recorded. Mark as received once cash is collected.
                            </p>
                            <button
                              onClick={async () => {
                                try {
                                  const { data } = await api.patch(`/admin/applications/${selected!.id}/mark-payment`);
                                  setApplications((prev) => prev.map((a) => a.id === data.id ? { ...a, ...data } : a));
                                  setSelected((prev) => prev ? { ...prev, ...data } : prev);
                                } catch (err: any) {
                                  alert(err.response?.data?.message || 'Could not update payment');
                                }
                              }}
                              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold text-white transition hover:opacity-90"
                              style={{ background: 'linear-gradient(135deg, #d97706, #f59e0b)' }}
                            >
                              ✅ Mark Payment as Received
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Agent badge */}
                    {(selected as any).agent_name && (
                      <div className="mt-3 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-purple-50 border border-purple-100">
                        <span className="text-xs font-bold text-purple-700">🤝 Submitted by Agent</span>
                        <span className="text-xs text-purple-600 ml-auto">{(selected as any).agent_name}</span>
                      </div>
                    )}

                    {/* Live Support Toggle */}
                    <div className="mt-4">
                      <button
                        onClick={async () => {
                          const { data } = await api.post(`/admin/applications/${selected!.id}/toggle-support`);
                          setApplications((prev) => prev.map((a) => a.id === data.id ? { ...a, ...data } : a));
                          setSelected((prev) => prev ? { ...prev, ...data } : prev);
                        }}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white transition"
                        style={{
                          background: (selected as any).support_chat_open
                            ? 'linear-gradient(135deg, #dc2626, #ef4444)'
                            : 'linear-gradient(135deg, #065f46, #059669)',
                        }}
                      >
                        {(selected as any).support_chat_open ? '⏹ Close Live Support' : '💬 Open Live Support'}
                      </button>
                    </div>

                    {/* Assignment */}
                    <div className="mt-5">
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Assigned To</label>
                      <select
                        value={(selected as any).assigned_to || ''}
                        onChange={async (e) => {
                          const { data } = await api.patch(`/admin/applications/${selected!.id}/assign`, { assigned_to: e.target.value || null });
                          setApplications((prev) => prev.map((a) => a.id === data.id ? { ...a, ...data } : a));
                          setSelected((prev) => prev ? { ...prev, ...data } : prev);
                        }}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100 transition"
                      >
                        <option value="">— Unassigned —</option>
                        {users.filter((u) => u.role === 'admin').map((u) => (
                          <option key={u.id} value={u.id}>{u.full_name}</option>
                        ))}
                      </select>
                      {(selected as any).assigned_name && (
                        <p className="text-xs text-blue-600 mt-1 font-medium">Assigned to {(selected as any).assigned_name}</p>
                      )}
                    </div>

                    {/* Review controls */}
                    <div className="mt-5 space-y-3">
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Update Status</label>
                        <select
                          value={status}
                          onChange={(e) => setStatus(e.target.value)}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100 transition"
                        >
                          <option value="pending">⏳ Pending</option>
                          <option value="processing">🔄 Processing</option>
                          <option value="approved">✅ Approved</option>
                          <option value="rejected">❌ Rejected</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Admin Notes</label>
                        <textarea
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          rows={3}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100 transition resize-none"
                          placeholder="Optional notes for applicant..."
                        />
                      </div>
                      <button
                        onClick={handleReview}
                        disabled={updating}
                        className="w-full text-white py-2.5 rounded-xl font-semibold text-sm transition disabled:opacity-50 flex items-center justify-center gap-2"
                        style={{ background: 'linear-gradient(135deg, #1a2744, #243660)' }}
                      >
                        {updating ? (
                          <>
                            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Updating...
                          </>
                        ) : 'Update Status'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Users Tab ───────────────────────────────────────────────────── */}
        {tab === 'users' && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-card overflow-hidden">
            <div
              className="px-6 py-4 flex items-center gap-3"
              style={{ background: 'linear-gradient(135deg, #f8faff, #f0f4ff)', borderBottom: '1px solid #e5e7eb' }}
            >
              <div className="relative flex-1 max-w-sm">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  type="text"
                  placeholder="Search by name or email..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100 transition"
                />
              </div>
              {isSuperAdmin && (
                <div className="ml-auto flex items-center gap-2">
                  <button
                    onClick={() => { setShowCreateAgent(true); setAgentFormError(''); setAgentForm({ email: '', full_name: '', password: '' }); }}
                    className="flex-shrink-0 text-white text-sm px-4 py-2 rounded-xl font-semibold transition hover:shadow-lg flex items-center gap-1.5"
                    style={{ background: 'linear-gradient(135deg, #7c3aed, #8b5cf6)' }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                    </svg>
                    Create Agent
                  </button>
                  <button
                    onClick={() => { setShowCreateAdmin(true); setAdminFormError(''); setAdminForm({ email: '', full_name: '', password: '' }); }}
                    className="flex-shrink-0 text-white text-sm px-4 py-2 rounded-xl font-semibold transition hover:shadow-lg flex items-center gap-1.5"
                    style={{ background: 'linear-gradient(135deg, #c9a227, #f0c84a)', color: '#0f1b3a' }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                    </svg>
                    Create Admin
                  </button>
                </div>
              )}
            </div>
            <table className="w-full text-sm">
              <thead style={{ background: 'linear-gradient(135deg, #f8faff, #f0f4ff)', borderBottom: '1px solid #e5e7eb' }}>
                <tr>
                  {['Full Name', 'Email', 'Role', 'Registered', 'Last Login', 'Applications', 'Actions'].map((h) => (
                    <th key={h} className="text-left px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {users
                  .filter((u) => {
                    const q = userSearch.toLowerCase();
                    return !q || u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
                  })
                  .map((user) => {
                    const userApps = applications.filter((a) => a.user_id === user.id);
                    const isLoading = userActionLoading === user.id;
                    return (
                      <tr key={user.id} className={`hover:bg-blue-50/30 transition ${user.suspended ? 'opacity-50' : ''}`}>
                        <td className="px-6 py-4 font-semibold text-gray-800">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                              style={{ background: user.role === 'admin' ? 'linear-gradient(135deg, #7c3aed, #8b5cf6)' : 'linear-gradient(135deg, #1a2744, #243660)', color: '#fff' }}
                            >
                              {user.full_name.charAt(0).toUpperCase()}
                            </div>
                            {user.full_name}
                            {user.suspended === 1 && (
                              <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-bold">Suspended</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-gray-500">{user.email}</td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
                            <span
                              className={`text-xs font-bold px-2.5 py-1 rounded-full capitalize w-fit ${
                                user.role === 'admin'
                                  ? 'bg-purple-100 text-purple-700 border border-purple-200'
                                  : 'bg-blue-100 text-blue-700 border border-blue-200'
                              }`}
                            >
                              {user.role}
                            </span>
                            {user.role === 'admin' && user.is_super_admin === 1 && (
                              <span className="text-xs font-bold px-2 py-0.5 rounded-full w-fit" style={{ background: 'linear-gradient(135deg, #c9a227, #f0c84a)', color: '#0f1b3a' }}>
                                ⭐ Super Admin
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-gray-500 text-xs">{new Date(user.created_at).toLocaleDateString()}</td>
                        <td className="px-6 py-4">
                          <div className="text-xs">
                            {user.last_login_at ? (
                              <>
                                <div className="text-gray-700 font-medium">
                                  {new Date(user.last_login_at.replace(' ', 'T') + 'Z').toLocaleDateString()}
                                </div>
                                <div className="text-gray-400 font-mono">{user.last_login_ip || '—'}</div>
                              </>
                            ) : (
                              <span className="text-gray-400">No login yet</span>
                            )}
                            <button
                              onClick={() => openLoginHistory(user)}
                              className="block mt-1 text-blue-500 hover:text-blue-700 underline text-xs"
                            >
                              View History
                            </button>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {userApps.length === 0 ? (
                            <span className="text-gray-400 text-xs">None</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {userApps.map((a) => {
                                const cfg = statusConfig[a.status] || statusConfig.pending;
                                return (
                                  <span key={a.id} className={`text-xs px-2 py-0.5 rounded-full font-semibold capitalize ${cfg.badge}`}>
                                    {a.status}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            {/* Suspend/Unsuspend — all admins can moderate applicants */}
                            {user.role !== 'admin' && (
                              <button
                                disabled={isLoading}
                                onClick={async () => {
                                  setUserActionLoading(user.id);
                                  await api.patch(`/admin/users/${user.id}/suspend`, { suspended: !user.suspended });
                                  await fetchData();
                                  setUserActionLoading(null);
                                }}
                                className={`text-xs px-3 py-1 rounded-lg font-semibold transition disabled:opacity-50 ${
                                  user.suspended
                                    ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                    : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                                }`}
                              >
                                {isLoading ? '...' : user.suspended ? 'Unsuspend' : 'Suspend'}
                              </button>
                            )}
                            {/* Delete — Super Admin only; cannot delete another super admin or self */}
                            {isSuperAdmin && user.id !== currentUser.id && user.is_super_admin !== 1 && (
                              <button
                                disabled={isLoading}
                                onClick={async () => {
                                  if (!confirm(`Delete ${user.full_name} and all their data? This cannot be undone.`)) return;
                                  setUserActionLoading(user.id);
                                  try {
                                    await api.delete(`/admin/users/${user.id}`);
                                    await fetchData();
                                  } catch (err: any) {
                                    alert(err.response?.data?.message || 'Delete failed. Please try again.');
                                  } finally {
                                    setUserActionLoading(null);
                                  }
                                }}
                                className="text-xs px-3 py-1 rounded-lg font-semibold bg-red-100 text-red-700 hover:bg-red-200 transition disabled:opacity-50"
                              >
                                Delete
                              </button>
                            )}
                            {/* Promote / Demote — Super Admin only, on admin accounts */}
                            {user.role === 'admin' && isSuperAdmin && user.id !== currentUser.id && (
                              <button
                                disabled={isLoading}
                                onClick={async () => {
                                  const action = user.is_super_admin ? 'demote' : 'promote';
                                  if (!confirm(`${action === 'promote' ? 'Promote' : 'Demote'} ${user.full_name} ${action === 'promote' ? 'to Super Admin' : 'to Regular Admin'}?`)) return;
                                  setUserActionLoading(user.id);
                                  try {
                                    await api.patch(`/admin/users/${user.id}/set-super-admin`);
                                    await fetchData();
                                  } catch (err: any) {
                                    alert(err.response?.data?.message || 'Action failed. Please try again.');
                                  } finally {
                                    setUserActionLoading(null);
                                  }
                                }}
                                className={`text-xs px-3 py-1 rounded-lg font-semibold transition disabled:opacity-50 ${
                                  user.is_super_admin
                                    ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    : 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                                }`}
                              >
                                {isLoading ? '...' : user.is_super_admin ? 'Demote' : 'Promote'}
                              </button>
                            )}
                            {/* No actions available for non-super-admin viewing admin accounts */}
                            {user.role === 'admin' && !isSuperAdmin && (
                              <span className="text-xs text-gray-400 italic">No actions</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
            {users.filter((u) => {
              const q = userSearch.toLowerCase();
              return !q || u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
            }).length === 0 && (
              <div className="text-center py-12 text-gray-400">No users found</div>
            )}
          </div>
        )}

        {/* ── Create Admin Modal ───────────────────────────────────────────── */}
        {showCreateAdmin && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
              <div
                className="px-6 py-5"
                style={{ background: 'linear-gradient(135deg, #0f1b3a, #1a2744)' }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-white">Create Admin Account</h2>
                    <p className="text-blue-300 text-xs mt-0.5">Grant admin privileges to a new user</p>
                  </div>
                  <button
                    onClick={() => setShowCreateAdmin(false)}
                    className="text-blue-300 hover:text-white transition text-2xl leading-none"
                  >
                    ×
                  </button>
                </div>
              </div>
              <div className="px-6 py-5">
                {adminFormError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 mb-4 text-sm">
                    {adminFormError}
                  </div>
                )}
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setAdminFormError('');
                    setAdminFormLoading(true);
                    try {
                      await api.post('/admin/users/create-admin', adminForm);
                      setShowCreateAdmin(false);
                      fetchData();
                    } catch (err: any) {
                      setAdminFormError(err.response?.data?.message || 'Failed to create admin');
                    } finally {
                      setAdminFormLoading(false);
                    }
                  }}
                  className="space-y-4"
                >
                  {[
                    { label: 'Full Name', key: 'full_name', type: 'text', placeholder: 'Admin Full Name' },
                    { label: 'Email Address', key: 'email', type: 'email', placeholder: 'admin@example.com' },
                    { label: 'Password', key: 'password', type: 'password', placeholder: 'Min. 8 characters' },
                  ].map(({ label, key, type, placeholder }) => (
                    <div key={key}>
                      <label className="block text-sm font-semibold text-gray-700 mb-1.5">{label}</label>
                      <input
                        type={type}
                        value={adminForm[key as keyof typeof adminForm]}
                        onChange={(e) => setAdminForm({ ...adminForm, [key]: e.target.value })}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100 transition"
                        placeholder={placeholder}
                        required
                        minLength={key === 'password' ? 8 : undefined}
                      />
                    </div>
                  ))}
                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowCreateAdmin(false)}
                      className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-50 transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={adminFormLoading}
                      className="flex-1 text-white py-2.5 rounded-xl text-sm font-bold transition disabled:opacity-50"
                      style={{ background: 'linear-gradient(135deg, #1a2744, #243660)' }}
                    >
                      {adminFormLoading ? 'Creating...' : 'Create Admin'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* ── Create Agent Modal ──────────────────────────────────────────── */}
        {showCreateAgent && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
              <div className="px-6 py-5" style={{ background: 'linear-gradient(135deg, #4c1d95, #6d28d9)' }}>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-white">Create Agent Account</h2>
                    <p className="text-purple-200 text-xs mt-0.5">Grant travel agent / partner access</p>
                  </div>
                  <button onClick={() => setShowCreateAgent(false)} className="text-purple-200 hover:text-white transition text-2xl leading-none">×</button>
                </div>
              </div>
              <div className="px-6 py-5">
                {agentFormError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 mb-4 text-sm">{agentFormError}</div>
                )}
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setAgentFormError('');
                    setAgentFormLoading(true);
                    try {
                      await api.post('/admin/users/create-agent', agentForm);
                      setShowCreateAgent(false);
                      fetchData();
                    } catch (err: any) {
                      setAgentFormError(err.response?.data?.message || 'Failed to create agent');
                    } finally {
                      setAgentFormLoading(false);
                    }
                  }}
                  className="space-y-4"
                >
                  {[
                    { label: 'Full Name', key: 'full_name', type: 'text', placeholder: 'Agent Full Name' },
                    { label: 'Email Address', key: 'email', type: 'email', placeholder: 'agent@travelagency.com' },
                    { label: 'Password', key: 'password', type: 'password', placeholder: 'Min. 8 characters' },
                  ].map(({ label, key, type, placeholder }) => (
                    <div key={key}>
                      <label className="block text-sm font-semibold text-gray-700 mb-1.5">{label}</label>
                      <input
                        type={type}
                        value={agentForm[key as keyof typeof agentForm]}
                        onChange={(e) => setAgentForm({ ...agentForm, [key]: e.target.value })}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition"
                        placeholder={placeholder}
                        required
                        minLength={key === 'password' ? 8 : undefined}
                      />
                    </div>
                  ))}
                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={() => setShowCreateAgent(false)}
                      className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-50 transition">
                      Cancel
                    </button>
                    <button type="submit" disabled={agentFormLoading}
                      className="flex-1 text-white py-2.5 rounded-xl text-sm font-bold transition disabled:opacity-50"
                      style={{ background: 'linear-gradient(135deg, #6d28d9, #8b5cf6)' }}>
                      {agentFormLoading ? 'Creating...' : 'Create Agent'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* ── Analytics Tab ────────────────────────────────────────────────── */}
        {tab === 'analytics' && analytics && (
          <div className="space-y-6">

            {/* ── Batch Report Generator ── */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-card overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between" style={{ background: 'linear-gradient(135deg, #f8faff, #f0f4ff)' }}>
                <div>
                  <h2 className="font-bold text-gray-800 flex items-center gap-2">
                    <span className="text-base">📄</span> Batch Processing Report
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">Generate a printable PDF summary for any date range</p>
                </div>
              </div>
              <div className="p-6">
                <div className="flex flex-wrap items-end gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">From</label>
                    <input type="date" value={reportFrom} onChange={(e) => setReportFrom(e.target.value)}
                      className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100 transition" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">To</label>
                    <input type="date" value={reportTo} onChange={(e) => setReportTo(e.target.value)}
                      className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100 transition" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Include Statuses</label>
                    <div className="flex gap-2 flex-wrap">
                      {['approved', 'rejected', 'processing', 'pending'].map((s) => {
                        const checked = reportStatuses.includes(s);
                        const colors: Record<string, string> = { approved: '#059669', rejected: '#dc2626', processing: '#2563eb', pending: '#d97706' };
                        return (
                          <label key={s} className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl cursor-pointer border transition select-none ${checked ? 'text-white border-transparent' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                            style={checked ? { background: colors[s] } : {}}>
                            <input type="checkbox" className="sr-only" checked={checked}
                              onChange={() => setReportStatuses((prev) =>
                                prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
                              )} />
                            {s.charAt(0).toUpperCase() + s.slice(1)}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  {/* Agent filter */}
                  {users.some((u) => u.role === 'agent') && (
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Agent</label>
                      <select
                        value={reportAgentFilter}
                        onChange={(e) => setReportAgentFilter(e.target.value)}
                        className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100 transition"
                      >
                        <option value="all">All agents & direct</option>
                        {users.filter((u) => u.role === 'agent').map((u) => (
                          <option key={u.id} value={u.id}>🤝 {u.full_name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <button
                    onClick={generateReport}
                    disabled={reportLoading || reportStatuses.length === 0}
                    className="flex items-center gap-2 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition disabled:opacity-50 flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg, #1a2744, #243660)' }}
                  >
                    {reportLoading ? (
                      <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Generating...</>
                    ) : (
                      <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>Generate Report</>
                    )}
                  </button>
                  {reportData && (
                    <button
                      onClick={() => setShowReport(true)}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition border border-gray-200 text-gray-700 hover:bg-gray-50"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                      View Last Report ({reportData.summary.total} records)
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Key metric cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Total Applicants',    value: analytics.totalUsers, icon: '👥', grad: 'linear-gradient(135deg, #1a2744, #243660)' },
                { label: 'Approved Passports',  value: analytics.statusDist.find((s) => s.status === 'approved')?.count ?? 0, icon: '✅', grad: 'linear-gradient(135deg, #065f46, #059669)' },
                { label: 'Pending Review',      value: analytics.statusDist.find((s) => s.status === 'pending')?.count ?? 0, icon: '⏳', grad: 'linear-gradient(135deg, #92400e, #d97706)' },
                { label: 'Avg. Processing',     value: analytics.avgProcessingDays !== null ? `${analytics.avgProcessingDays}d` : '—', icon: '⚡', grad: 'linear-gradient(135deg, #5b21b6, #8b5cf6)' },
              ].map(({ label, value, icon, grad }) => (
                <div
                  key={label}
                  className="rounded-2xl p-5 text-white relative overflow-hidden"
                  style={{ background: grad }}
                >
                  <div className="absolute -top-3 -right-3 text-5xl opacity-20">{icon}</div>
                  <p className="text-3xl font-bold">{value}</p>
                  <p className="text-xs font-medium mt-1 opacity-80">{label}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Monthly bar chart */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-card p-6">
                <h3 className="font-bold text-gray-800 mb-5 flex items-center gap-2">
                  <span className="w-1 h-5 rounded-full inline-block" style={{ background: 'linear-gradient(180deg, #c9a227, #f0c84a)' }} />
                  Monthly Submissions
                </h3>
                {analytics.monthly.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-8">No data yet</p>
                ) : (() => {
                  const maxCount = Math.max(...analytics.monthly.map((m) => m.count), 1);
                  return (
                    <div className="flex items-end gap-3 h-40">
                      {analytics.monthly.map((m) => {
                        const heightPct = Math.round((m.count / maxCount) * 100);
                        const [year, month] = m.month.split('-');
                        const label = new Date(Number(year), Number(month) - 1).toLocaleString('default', { month: 'short', year: '2-digit' });
                        return (
                          <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                            <span className="text-xs font-bold" style={{ color: '#1a2744' }}>{m.count}</span>
                            <div className="w-full flex items-end" style={{ height: '100px' }}>
                              <div
                                className="w-full rounded-t-lg transition-all"
                                style={{
                                  height: `${Math.max(heightPct, 4)}%`,
                                  background: 'linear-gradient(180deg, #c9a227, #1a2744)',
                                }}
                              />
                            </div>
                            <span className="text-xs text-gray-400">{label}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* Status distribution */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-card p-6">
                <h3 className="font-bold text-gray-800 mb-5 flex items-center gap-2">
                  <span className="w-1 h-5 rounded-full inline-block" style={{ background: 'linear-gradient(180deg, #059669, #34d399)' }} />
                  Status Distribution
                </h3>
                {analytics.statusDist.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-8">No data yet</p>
                ) : (() => {
                  const total = analytics.statusDist.reduce((s, d) => s + d.count, 0) || 1;
                  const barGrads: Record<string, string> = {
                    pending:    'linear-gradient(90deg, #f59e0b, #fbbf24)',
                    processing: 'linear-gradient(90deg, #3b82f6, #60a5fa)',
                    approved:   'linear-gradient(90deg, #059669, #34d399)',
                    rejected:   'linear-gradient(90deg, #dc2626, #f87171)',
                  };
                  return (
                    <div className="space-y-3">
                      {analytics.statusDist.map((d) => {
                        const pct = Math.round((d.count / total) * 100);
                        return (
                          <div key={d.status}>
                            <div className="flex justify-between text-xs mb-1.5">
                              <span className="font-semibold text-gray-700 capitalize">{d.status}</span>
                              <span className="text-gray-500">{d.count} ({pct}%)</span>
                            </div>
                            <div className="w-full bg-gray-100 rounded-full h-3">
                              <div
                                className="h-3 rounded-full transition-all"
                                style={{ width: `${pct}%`, background: barGrads[d.status] || 'linear-gradient(90deg, #94a3b8, #cbd5e1)' }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* Passport type distribution */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-card p-6">
                <h3 className="font-bold text-gray-800 mb-5 flex items-center gap-2">
                  <span className="w-1 h-5 rounded-full inline-block" style={{ background: 'linear-gradient(180deg, #7c3aed, #a78bfa)' }} />
                  Passport Type Distribution
                </h3>
                {analytics.typeDist.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-8">No data yet</p>
                ) : (() => {
                  const total = analytics.typeDist.reduce((s, d) => s + d.count, 0) || 1;
                  const typeGrads: Record<string, string> = {
                    regular:    'linear-gradient(90deg, #3b82f6, #60a5fa)',
                    official:   'linear-gradient(90deg, #6366f1, #818cf8)',
                    diplomatic: 'linear-gradient(90deg, #7c3aed, #a78bfa)',
                  };
                  return (
                    <div className="space-y-3">
                      {analytics.typeDist.map((d) => {
                        const pct = Math.round((d.count / total) * 100);
                        return (
                          <div key={d.passport_type}>
                            <div className="flex justify-between text-xs mb-1.5">
                              <span className="font-semibold text-gray-700 capitalize">{d.passport_type}</span>
                              <span className="text-gray-500">{d.count} ({pct}%)</span>
                            </div>
                            <div className="w-full bg-gray-100 rounded-full h-3">
                              <div
                                className="h-3 rounded-full transition-all"
                                style={{ width: `${pct}%`, background: typeGrads[d.passport_type] || 'linear-gradient(90deg, #94a3b8, #cbd5e1)' }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* Outcome summary */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-card p-6">
                <h3 className="font-bold text-gray-800 mb-5 flex items-center gap-2">
                  <span className="w-1 h-5 rounded-full inline-block" style={{ background: 'linear-gradient(180deg, #1a2744, #243660)' }} />
                  Outcome Summary
                </h3>
                {stats && (() => {
                  const reviewed = stats.approved + stats.rejected;
                  const approvalRate = reviewed > 0 ? Math.round((stats.approved / reviewed) * 100) : 0;
                  const rejectionRate = reviewed > 0 ? Math.round((stats.rejected / reviewed) * 100) : 0;
                  return (
                    <div className="space-y-4">
                      <div
                        className="flex items-center justify-between p-4 rounded-2xl"
                        style={{ background: 'linear-gradient(135deg, #ecfdf5, #d1fae5)', border: '1px solid #a7f3d0' }}
                      >
                        <div>
                          <p className="text-xs text-emerald-600 font-bold uppercase tracking-wider">Approval Rate</p>
                          <p className="text-3xl font-bold text-emerald-700 mt-0.5">{approvalRate}%</p>
                        </div>
                        <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 flex items-center justify-center text-2xl">✅</div>
                      </div>
                      <div
                        className="flex items-center justify-between p-4 rounded-2xl"
                        style={{ background: 'linear-gradient(135deg, #fff1f2, #ffe4e6)', border: '1px solid #fecdd3' }}
                      >
                        <div>
                          <p className="text-xs text-red-600 font-bold uppercase tracking-wider">Rejection Rate</p>
                          <p className="text-3xl font-bold text-red-700 mt-0.5">{rejectionRate}%</p>
                        </div>
                        <div className="w-12 h-12 rounded-2xl bg-red-500/20 flex items-center justify-center text-2xl">❌</div>
                      </div>
                      <p className="text-xs text-gray-400 text-center">{reviewed} applications reviewed in total</p>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* ── CSAT / Customer Satisfaction ── */}
            {csatData && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-card overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100" style={{ background: 'linear-gradient(135deg, #f8faff, #f0f4ff)' }}>
                  <h2 className="font-bold text-gray-800 flex items-center gap-2">
                    <span className="text-base">⭐</span> Customer Satisfaction (CSAT)
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">Ratings submitted by applicants after their application is decided</p>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className="text-center">
                      <p className="text-3xl font-bold" style={{ color: '#c9a227' }}>
                        {csatData.avg_rating ? `${csatData.avg_rating}/5` : '—'}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Average Rating</p>
                      {csatData.avg_rating && (
                        <p className="text-base mt-0.5">
                          {'★'.repeat(Math.round(csatData.avg_rating))}{'☆'.repeat(5 - Math.round(csatData.avg_rating))}
                        </p>
                      )}
                    </div>
                    <div className="text-center">
                      <p className="text-3xl font-bold text-gray-800">{csatData.total_responses}</p>
                      <p className="text-xs text-gray-500 mt-1">Total Responses</p>
                    </div>
                    <div className="text-center">
                      <p className="text-3xl font-bold text-emerald-600">{csatData.response_rate}%</p>
                      <p className="text-xs text-gray-500 mt-1">Response Rate</p>
                    </div>
                  </div>
                  {/* Star distribution */}
                  <div className="space-y-2 mb-6">
                    {[5, 4, 3, 2, 1].map((star) => {
                      const count = csatData[`${['one','two','three','four','five'][star - 1]}_star`] ?? 0;
                      const pct = csatData.total_responses > 0 ? Math.round((count / csatData.total_responses) * 100) : 0;
                      return (
                        <div key={star} className="flex items-center gap-2 text-xs">
                          <span className="w-8 text-right font-semibold text-gray-600">{star}★</span>
                          <div className="flex-1 bg-gray-100 rounded-full h-2.5">
                            <div className="h-2.5 rounded-full transition-all" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #c9a227, #f0c84a)' }} />
                          </div>
                          <span className="w-10 text-gray-400">{count} ({pct}%)</span>
                        </div>
                      );
                    })}
                  </div>
                  {/* Recent comments */}
                  {csatData.recent && csatData.recent.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Recent Feedback</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-gray-100">
                              {['Rating', 'Application', 'User', 'Comment', 'Date'].map((h) => (
                                <th key={h} className="text-left px-3 py-2 text-gray-400 font-semibold uppercase tracking-wide">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {csatData.recent.map((r: any, i: number) => (
                              <tr key={i} className="hover:bg-gray-50 transition">
                                <td className="px-3 py-2 font-bold" style={{ color: '#c9a227' }}>
                                  {'★'.repeat(r.rating)}
                                </td>
                                <td className="px-3 py-2 font-mono text-gray-500">{r.application_number}</td>
                                <td className="px-3 py-2 text-gray-700">{r.user_name}</td>
                                <td className="px-3 py-2 text-gray-500 max-w-xs truncate">{r.comment || <span className="text-gray-300 italic">No comment</span>}</td>
                                <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{new Date(r.submitted_at).toLocaleDateString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  {csatData.total_responses === 0 && (
                    <p className="text-center text-gray-400 text-sm py-4">No ratings yet — surveys appear after applications are approved or rejected</p>
                  )}
                </div>
              </div>
            )}

            {/* ── Data Retention Policy ── */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-card overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100" style={{ background: 'linear-gradient(135deg, #f8faff, #f0f4ff)' }}>
                <h2 className="font-bold text-gray-800 flex items-center gap-2">
                  <span className="text-base">🗑️</span> Data Retention Policy
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">Auto-deletion of rejected applications after a configurable period</p>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="rounded-2xl p-5 text-white relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #1a2744, #243660)' }}>
                    <p className="text-xs font-semibold uppercase tracking-wider text-blue-200 mb-1">Policy Status</p>
                    <p className="text-2xl font-bold">Active</p>
                    <p className="text-xs text-blue-300 mt-1">Hourly background job</p>
                  </div>
                  <div className="rounded-2xl p-5 border border-gray-100 bg-gray-50">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Retention Period</p>
                    <p className="text-2xl font-bold text-gray-800">Configurable</p>
                    <p className="text-xs text-gray-400 mt-1">Set <code className="bg-gray-100 px-1 rounded">DATA_RETENTION_DAYS</code> in backend .env</p>
                  </div>
                  <div className="rounded-2xl p-5 border border-amber-100 bg-amber-50">
                    <p className="text-xs font-semibold uppercase tracking-wider text-amber-600 mb-1">What Gets Deleted</p>
                    <ul className="text-xs text-amber-800 space-y-0.5 mt-1">
                      <li>• Rejected application records</li>
                      <li>• Uploaded photo &amp; ID files</li>
                      <li>• Associated messages &amp; history</li>
                      <li>• Audit entry kept for compliance</li>
                    </ul>
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-4 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Deletion events are permanently recorded in the Audit Log tab for compliance. Set <code className="bg-gray-100 px-1 rounded">DATA_RETENTION_DAYS=0</code> to disable.
                </p>
              </div>
            </div>

          </div>
        )}

        {/* ── Appointments Tab ─────────────────────────────────────────────── */}
        {tab === 'appointments' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                {adminAppointments.length} Appointment{adminAppointments.length !== 1 ? 's' : ''}
                {apptPendingCount > 0 && (
                  <span className="ml-2 text-amber-600">· {apptPendingCount} pending</span>
                )}
              </p>
              <button
                onClick={fetchAdminAppointments}
                className="text-xs text-blue-500 hover:text-blue-700 font-medium transition"
              >
                ↻ Refresh
              </button>
            </div>

            {adminAppointments.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-card p-16 text-center">
                <div className="text-5xl mb-3">📅</div>
                <p className="font-semibold text-gray-700">No appointment requests yet</p>
                <p className="text-sm text-gray-400 mt-1">Requests from applicants will appear here</p>
              </div>
            ) : (
              <div className="space-y-3">
                {adminAppointments.map((appt) => {
                  type ApptStatus = 'pending' | 'approved' | 'rejected' | 'completed';
                  const statusColor: Record<ApptStatus, { bar: string; badge: string }> = {
                    pending:   { bar: 'linear-gradient(180deg,#fbbf24,#f59e0b)', badge: 'bg-amber-50 border-amber-200 text-amber-700' },
                    approved:  { bar: 'linear-gradient(180deg,#34d399,#10b981)', badge: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
                    rejected:  { bar: 'linear-gradient(180deg,#f87171,#ef4444)', badge: 'bg-red-50 border-red-200 text-red-700' },
                    completed: { bar: 'linear-gradient(180deg,#94a3b8,#64748b)', badge: 'bg-gray-50 border-gray-200 text-gray-600' },
                  };
                  const sc = statusColor[appt.status as ApptStatus] ?? statusColor.pending;

                  return (
                    <div key={appt.id} className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden flex">
                      <div className="w-1.5 flex-shrink-0 rounded-l-2xl" style={{ background: sc.bar }} />
                      <div className="flex-1 p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <p className="font-bold text-gray-800">{appt.subject}</p>
                              <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${sc.badge}`}>
                                {appt.status.charAt(0).toUpperCase() + appt.status.slice(1)}
                              </span>
                            </div>
                            <p className="text-sm font-medium text-blue-700">{appt.user_name}</p>
                            <p className="text-xs text-gray-400">{appt.user_email}</p>
                            {appt.description && (
                              <p className="text-sm text-gray-600 mt-1.5 line-clamp-2">{appt.description}</p>
                            )}
                            {appt.status === 'approved' && appt.scheduled_date && (
                              <div className="mt-2 flex flex-wrap gap-2">
                                <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-lg">
                                  📅 {appt.scheduled_date}{appt.scheduled_time ? ` · ${appt.scheduled_time}` : ''}
                                </span>
                                {appt.location && (
                                  <span className="text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-lg">
                                    📍 {appt.location}
                                  </span>
                                )}
                              </div>
                            )}
                            {appt.admin_notes && (
                              <p className="text-xs text-gray-500 mt-1 italic">Note: {appt.admin_notes}</p>
                            )}
                            <p className="text-xs text-gray-400 mt-1.5">
                              Requested {new Date(appt.requested_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              {appt.arranged_by_name && ` · Arranged by ${appt.arranged_by_name}`}
                            </p>
                          </div>
                          <div className="flex flex-col gap-2 flex-shrink-0">
                            {appt.status !== 'completed' && appt.status !== 'rejected' && (
                              <button
                                onClick={() => {
                                  setArrangeAppt(appt);
                                  setArrangeForm({
                                    status: appt.status === 'approved' ? 'approved' : 'approved',
                                    scheduled_date: appt.scheduled_date || '',
                                    scheduled_time: appt.scheduled_time || '',
                                    location: appt.location || '',
                                    admin_notes: appt.admin_notes || '',
                                  });
                                  setArrangeError('');
                                }}
                                className="text-xs px-3 py-1.5 rounded-xl font-semibold text-white transition hover:shadow-md"
                                style={{ background: 'linear-gradient(135deg, #1a2744, #243660)' }}
                              >
                                {appt.status === 'pending' ? 'Arrange' : 'Edit'}
                              </button>
                            )}
                            {appt.status === 'approved' && (
                              <button
                                onClick={async () => {
                                  await api.patch(`/appointments/${appt.id}`, { ...appt, status: 'completed' });
                                  fetchAdminAppointments();
                                }}
                                className="text-xs px-3 py-1.5 rounded-xl font-semibold bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition"
                              >
                                Done
                              </button>
                            )}
                            {appt.status === 'pending' && (
                              <button
                                onClick={async () => {
                                  if (!confirm('Reject this appointment request?')) return;
                                  await api.patch(`/appointments/${appt.id}`, { status: 'rejected', admin_notes: '' });
                                  fetchAdminAppointments();
                                }}
                                className="text-xs px-3 py-1.5 rounded-xl font-semibold bg-red-100 text-red-700 hover:bg-red-200 transition"
                              >
                                Reject
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Arrange Modal */}
            {arrangeAppt && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-slide-up">
                  <div className="px-6 py-5" style={{ background: 'linear-gradient(135deg, #0f1b3a, #1a2744)' }}>
                    <h2 className="text-white font-bold text-lg">📅 Arrange Appointment</h2>
                    <p className="text-blue-300 text-xs mt-0.5">{arrangeAppt.user_name} — {arrangeAppt.subject}</p>
                  </div>
                  <div className="p-6 space-y-4">
                    {arrangeError && (
                      <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-2.5 text-sm">{arrangeError}</div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Date <span className="text-red-500">*</span></label>
                        <input
                          type="date"
                          value={arrangeForm.scheduled_date}
                          onChange={(e) => setArrangeForm((f) => ({ ...f, scheduled_date: e.target.value }))}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100 transition"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Time</label>
                        <input
                          type="time"
                          value={arrangeForm.scheduled_time}
                          onChange={(e) => setArrangeForm((f) => ({ ...f, scheduled_time: e.target.value }))}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100 transition"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Location / Branch</label>
                      <input
                        type="text"
                        value={arrangeForm.location}
                        onChange={(e) => setArrangeForm((f) => ({ ...f, location: e.target.value }))}
                        placeholder="e.g. Main Passport Office, Counter 3"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100 transition"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Notes to Applicant</label>
                      <textarea
                        rows={2}
                        value={arrangeForm.admin_notes}
                        onChange={(e) => setArrangeForm((f) => ({ ...f, admin_notes: e.target.value }))}
                        placeholder="Any instructions, documents to bring, etc."
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100 transition"
                      />
                    </div>
                    <div className="flex gap-3 pt-1">
                      <button
                        type="button"
                        onClick={() => setArrangeAppt(null)}
                        className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl font-semibold text-sm hover:bg-gray-50 transition"
                      >
                        Cancel
                      </button>
                      <button
                        disabled={arrangeLoading || !arrangeForm.scheduled_date}
                        onClick={async () => {
                          if (!arrangeForm.scheduled_date) { setArrangeError('Date is required.'); return; }
                          setArrangeLoading(true);
                          setArrangeError('');
                          try {
                            await api.patch(`/appointments/${arrangeAppt.id}`, { ...arrangeForm });
                            setArrangeAppt(null);
                            fetchAdminAppointments();
                          } catch (err: any) {
                            setArrangeError(err.response?.data?.message || 'Failed to save');
                          } finally {
                            setArrangeLoading(false);
                          }
                        }}
                        className="flex-1 text-white py-2.5 rounded-xl font-semibold text-sm transition disabled:opacity-60"
                        style={{ background: 'linear-gradient(135deg, #c9a227, #f0c84a)', color: '#0f1b3a' }}
                      >
                        {arrangeLoading ? 'Saving…' : 'Confirm Appointment'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Audit Log Tab ────────────────────────────────────────────────── */}
        {tab === 'audit' && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-card overflow-hidden">
            <div
              className="px-6 py-4 flex items-center justify-between"
              style={{ background: 'linear-gradient(135deg, #f8faff, #f0f4ff)', borderBottom: '1px solid #e5e7eb' }}
            >
              <div>
                <h2 className="font-bold text-gray-800 flex items-center gap-2">
                  <span className="text-base">🔍</span> Admin Audit Log
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">{auditTotal} total actions recorded</p>
              </div>
              <button
                onClick={loadAuditLogs}
                className="text-xs font-semibold px-3 py-1.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </button>
            </div>

            {auditLoading ? (
              <div className="flex items-center justify-center py-16">
                <svg className="animate-spin w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="text-center py-16 text-gray-400 text-sm">No audit entries yet</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {auditLogs.map((entry) => {
                  const cfg = auditActionConfig[entry.action] || { icon: '📝', color: 'text-gray-700' };
                  return (
                    <div key={entry.id} className="flex items-start gap-4 px-6 py-4 hover:bg-blue-50/20 transition">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-gray-50 border border-gray-100 text-lg mt-0.5">
                        {cfg.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className={`text-sm font-semibold ${cfg.color}`}>{entry.details}</p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <span className="text-xs text-gray-400">by</span>
                              <span className="text-xs font-bold text-gray-600">{entry.admin_name}</span>
                              <span className="text-xs text-gray-300">·</span>
                              <span className="text-xs font-mono text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100">{entry.action}</span>
                              {entry.target_type && entry.target_id && (
                                <>
                                  <span className="text-xs text-gray-300">·</span>
                                  <span className="text-xs text-gray-400 capitalize">{entry.target_type}</span>
                                </>
                              )}
                            </div>
                          </div>
                          <span className="text-xs text-gray-400 flex-shrink-0 mt-0.5 whitespace-nowrap">
                            {new Date(entry.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Floating Bulk Action Bar */}
      {checkedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 animate-fade-in">
          <div
            className="flex items-center gap-4 px-5 py-3 rounded-2xl shadow-2xl border border-white/10"
            style={{ background: 'linear-gradient(135deg, #0f1b3a, #1a2744)' }}
          >
            <span className="text-white text-sm font-semibold whitespace-nowrap">
              {checkedIds.size} selected
            </span>
            <div className="w-px h-5 bg-white/20 flex-shrink-0" />
            <select
              value={bulkStatus}
              onChange={(e) => setBulkStatus(e.target.value)}
              className="text-sm rounded-xl px-3 py-1.5 border border-white/20 focus:outline-none focus:ring-2 focus:ring-yellow-400"
              style={{ background: 'rgba(255,255,255,0.1)', color: '#fff' }}
            >
              <option value="pending" style={{ color: '#111', background: '#fff' }}>⏳ Set Pending</option>
              <option value="processing" style={{ color: '#111', background: '#fff' }}>🔄 Set Processing</option>
              <option value="approved" style={{ color: '#111', background: '#fff' }}>✅ Set Approved</option>
              <option value="rejected" style={{ color: '#111', background: '#fff' }}>❌ Set Rejected</option>
            </select>
            <button
              onClick={handleBulkReview}
              disabled={bulkLoading}
              className="text-sm font-bold px-4 py-1.5 rounded-xl transition disabled:opacity-50 flex items-center gap-2 flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #c9a227, #f0c84a)', color: '#0f1b3a' }}
            >
              {bulkLoading ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Applying...
                </>
              ) : 'Apply to All'}
            </button>
            <button
              onClick={() => setCheckedIds(new Set())}
              className="text-blue-300 hover:text-white transition text-xl leading-none ml-1 flex-shrink-0"
              title="Clear selection"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* ── Login History Modal ───────────────────────────────────────────── */}
      {loginHistoryUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,27,58,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 flex items-center justify-between border-b border-gray-100"
              style={{ background: 'linear-gradient(135deg, #0f1b3a, #1a2744)' }}>
              <div>
                <p className="text-xs text-blue-300 uppercase tracking-widest font-semibold">Login History</p>
                <p className="text-white font-bold">{loginHistoryUser!.full_name}</p>
                <p className="text-blue-300 text-xs">{loginHistoryUser!.email}</p>
              </div>
              <button onClick={() => setLoginHistoryUser(null)}
                className="text-blue-300 hover:text-white text-2xl leading-none transition">×</button>
            </div>
            <div className="max-h-96 overflow-y-auto divide-y divide-gray-50">
              {loginLogsLoading ? (
                <div className="flex items-center justify-center py-10">
                  <svg className="animate-spin w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </div>
              ) : loginLogs.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-gray-400 text-sm">No login records found.</p>
                  <p className="text-gray-300 text-xs mt-1">Records are only kept from when IP logging was enabled.</p>
                </div>
              ) : loginLogs.map((log) => (
                <div key={log.id} className="px-6 py-3 flex items-center gap-4">
                  <span className={`text-lg flex-shrink-0 ${log.success ? 'text-emerald-500' : 'text-red-400'}`}>
                    {log.success ? '✔' : '✘'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${log.success ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                        {log.success ? 'Success' : 'Failed'}
                      </span>
                      <span className="text-xs font-mono text-gray-600">{log.ip || '—'}</span>
                    </div>
                    <p className="text-xs text-gray-400 truncate mt-0.5">{log.user_agent}</p>
                  </div>
                  <span className="text-xs text-gray-400 flex-shrink-0">
                    {new Date(log.created_at.replace(' ', 'T') + 'Z').toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
            <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 text-right">
              <button onClick={() => setLoginHistoryUser(null)}
                className="text-sm font-semibold text-gray-500 hover:text-gray-800 transition">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Batch Report Print Modal ──────────────────────────────────────── */}
      {showReport && reportData && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-white print:bg-white" id="report-print-area">
          {/* Toolbar — hidden on print */}
          <div className="flex items-center justify-between px-8 py-4 border-b border-gray-200 print:hidden"
            style={{ background: 'linear-gradient(135deg, #0f1b3a, #1a2744)' }}>
            <div>
              <p className="text-xs text-blue-300 uppercase tracking-widest font-semibold">Batch Processing Report</p>
              <p className="text-white font-bold text-lg">
                {reportFrom} — {reportTo}
              </p>
              <p className="text-blue-300 text-xs mt-0.5">
                Generated by {storedUser.full_name} · {new Date().toLocaleString()}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={exportReportCSV}
                className="flex items-center gap-2 text-sm font-bold px-4 py-2 rounded-xl transition bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export CSV
              </button>
              <button
                onClick={() => window.print()}
                className="flex items-center gap-2 text-sm font-bold px-4 py-2 rounded-xl transition"
                style={{ background: 'linear-gradient(135deg, #c9a227, #f0c84a)', color: '#0f1b3a' }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4H9v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Print / PDF
              </button>
              <button
                onClick={() => setShowReport(false)}
                className="text-blue-300 hover:text-white transition text-2xl leading-none font-bold"
              >×</button>
            </div>
          </div>

          {/* Report body */}
          <div className="max-w-5xl mx-auto px-8 py-8">
            {/* Print header — only shown on print */}
            <div className="hidden print:block mb-6">
              <h1 className="text-2xl font-bold text-gray-900">E-Passport System — Batch Processing Report</h1>
              <p className="text-sm text-gray-600 mt-1">
                Period: {reportFrom} to {reportTo} · Generated: {new Date().toLocaleString()} · By: {storedUser.full_name}
              </p>
              <hr className="mt-3 border-gray-300" />
            </div>

            {/* Summary stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
              {[
                { label: 'Total', value: reportData.summary.total, color: '#1a2744' },
                { label: 'Approved', value: reportData.summary.byStatus.approved ?? 0, color: '#059669' },
                { label: 'Rejected', value: reportData.summary.byStatus.rejected ?? 0, color: '#dc2626' },
                { label: 'Approval Rate', value: `${reportData.summary.approvalRate}%`, color: '#c9a227' },
                { label: 'Avg Processing', value: `${reportData.summary.avgProcessingDays}d`, color: '#7c3aed' },
              ].map((s) => (
                <div key={s.label} className="bg-gray-50 rounded-xl p-4 border border-gray-100 text-center print:border-gray-300">
                  <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-1">{s.label}</p>
                  <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* Express / payment summary — shown only when express apps exist */}
            {(reportData.summary.expressCount ?? 0) > 0 && (
              <div className="grid grid-cols-3 gap-4 mb-8">
                {[
                  { label: 'Express Apps', value: reportData.summary.expressCount, color: '#d97706', icon: '⚡' },
                  { label: 'Total Revenue', value: `$${reportData.summary.totalRevenue ?? 0}`, color: '#059669', icon: '💰' },
                  { label: 'Pending Payments', value: reportData.summary.pendingPayments ?? 0, color: '#dc2626', icon: '💳' },
                ].map((s) => (
                  <div key={s.label} className="rounded-xl p-4 border text-center print:border-gray-300"
                    style={{ background: 'linear-gradient(135deg, #fffbeb, #fef3c7)', borderColor: '#fde68a' }}>
                    <p className="text-xs text-amber-700 uppercase tracking-wide font-semibold mb-1">{s.icon} {s.label}</p>
                    <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
                  </div>
                ))}
              </div>
            )}

            {/* By-type breakdown */}
            {Object.keys(reportData.summary.byType || {}).length > 0 && (
              <div className="mb-6">
                <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">By Passport Type</h2>
                <div className="flex flex-wrap gap-3">
                  {Object.entries(reportData.summary.byType as Record<string, number>).map(([type, count]) => (
                    <div key={type} className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 print:border-gray-300">
                      <span className="font-semibold text-gray-700 capitalize">{type}</span>
                      <span className="text-sm text-gray-500">{count as number}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* By-agent breakdown */}
            {Object.keys(reportData.summary.byAgent || {}).length > 0 && (
              <div className="mb-8">
                <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">By Agent</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {Object.entries(reportData.summary.byAgent as Record<string, number>).map(([agentName, count]) => (
                    <div key={agentName} className="flex items-center justify-between bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-2.5 print:border-gray-300">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-indigo-400">👤</span>
                        <span className="font-medium text-gray-700 text-sm truncate max-w-[120px]">{agentName}</span>
                      </div>
                      <span className="text-sm font-bold text-indigo-700 flex-shrink-0">{count as number} apps</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Applications table */}
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">Applications</h2>
            {reportData.applications.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <p className="text-4xl mb-3">📋</p>
                <p>No applications in this date range / status filter.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-200 print:border-gray-300">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: '#f8fafc' }} className="border-b border-gray-200">
                      {['App #', 'Applicant', 'Nationality', 'Type', 'Tier', 'Payment', 'Agent', 'Status', 'Submitted', 'Passport #', 'Expires'].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {reportData.applications.map((app: any) => (
                      <tr key={app.id} className="hover:bg-gray-50 print:hover:bg-transparent">
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-700 whitespace-nowrap">{app.application_number}</td>
                        <td className="px-4 py-2.5">
                          <p className="font-medium text-gray-800 truncate max-w-[130px]">{app.full_name}</p>
                          <p className="text-xs text-gray-400 truncate max-w-[130px]">{app.email}</p>
                        </td>
                        <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{app.nationality}</td>
                        <td className="px-4 py-2.5">
                          <span className="text-xs capitalize bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-100 print:border-blue-200 whitespace-nowrap">
                            {app.passport_type}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          {app.processing_tier === 'express' ? (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full border border-yellow-300 bg-amber-50 text-amber-700 whitespace-nowrap">⚡ Express</span>
                          ) : (
                            <span className="text-xs px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-gray-500 whitespace-nowrap">Standard</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {app.processing_tier === 'express' ? (
                            app.payment_status === 'paid' ? (
                              <span className="text-xs font-bold px-2 py-0.5 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 whitespace-nowrap">✅ Paid</span>
                            ) : (
                              <span className="text-xs font-bold px-2 py-0.5 rounded-full border border-amber-300 bg-amber-50 text-amber-700 whitespace-nowrap">💳 Pending</span>
                            )
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {app.agent_name ? (
                            <span className="text-xs text-indigo-700 font-medium truncate max-w-[100px] block">👤 {app.agent_name}</span>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${
                            app.status === 'approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            app.status === 'rejected' ? 'bg-red-50 text-red-600 border-red-200' :
                            app.status === 'processing' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                            'bg-amber-50 text-amber-700 border-amber-200'
                          }`}>
                            {app.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                          {app.submitted_at ? new Date(app.submitted_at.replace(' ', 'T') + 'Z').toLocaleDateString() : '—'}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-700 whitespace-nowrap">{app.passport_number || '—'}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{app.expires_at || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Footer */}
            <div className="mt-8 pt-4 border-t border-gray-200 text-xs text-gray-400 flex justify-between print:border-gray-300">
              <span>E-Passport Management System — Confidential</span>
              <span>{reportData.applications.length} record(s)</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
