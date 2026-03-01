import { useEffect, useState, useRef, FormEvent } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import api from '../services/api';
import { Application } from '../types';

interface HistoryEntry {
  id: string;
  application_id: string;
  status: string;
  admin_notes: string | null;
  changed_by_name: string;
  changed_at: string;
}

const historyStatusConfig: Record<string, { icon: string; color: string; dot: string }> = {
  pending:    { icon: '⏳', color: 'text-amber-700',   dot: 'bg-amber-400' },
  processing: { icon: '🔄', color: 'text-blue-700',    dot: 'bg-blue-500' },
  approved:   { icon: '✅', color: 'text-emerald-700', dot: 'bg-emerald-500' },
  rejected:   { icon: '❌', color: 'text-red-700',     dot: 'bg-red-500' },
};

const statusSteps = ['pending', 'processing', 'approved'];

const statusConfig: Record<string, { color: string; bg: string; icon: string; grad: string }> = {
  pending:    { color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200',   icon: '⏳', grad: 'linear-gradient(135deg, #92400e, #d97706)' },
  processing: { color: 'text-blue-700',    bg: 'bg-blue-50 border-blue-200',     icon: '🔄', grad: 'linear-gradient(135deg, #1d4ed8, #2563eb)' },
  approved:   { color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', icon: '✅', grad: 'linear-gradient(135deg, #065f46, #059669)' },
  rejected:   { color: 'text-red-700',     bg: 'bg-red-50 border-red-200',       icon: '❌', grad: 'linear-gradient(135deg, #991b1b, #dc2626)' },
};

// Fields that should NOT be text-transformed (preserve original casing)
const rawFields = new Set(['Email', 'Phone', 'Submitted', 'Reviewed']);

function PassportCertificate({ application }: { application: Application }) {
  const [copied, setCopied] = useState(false);
  const verifyUrl = `${window.location.origin}/verify/${application.passport_number}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(verifyUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3 no-print">
        <h2 className="font-bold text-lg" style={{ color: '#1a2744' }}>Digital Passport Certificate</h2>
        <button
          onClick={() => window.print()}
          className="text-xs text-white px-3 py-1.5 rounded-lg transition flex items-center gap-1.5"
          style={{ background: 'linear-gradient(135deg, #1a2744, #243660)' }}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          Print / Save PDF
        </button>
      </div>

      {/* Passport card */}
      <div
        id="passport-card"
        className="rounded-2xl overflow-hidden shadow-xl border-4 border-passport-gold"
        style={{ background: 'linear-gradient(135deg, #1a2744 0%, #0d1b3e 60%, #1a3a2e 100%)' }}
      >
        {/* Header */}
        <div className="px-6 pt-5 pb-3 border-b border-white/10 flex items-center justify-between">
          <div>
            <p className="text-passport-gold font-bold text-xs tracking-[0.3em] uppercase">Republic — E-Passport</p>
            <p className="text-white/50 text-xs tracking-widest mt-0.5">PASSEPORT · PASAPORTE · REISEPASS</p>
          </div>
          <div className="text-right">
            <p className="text-passport-gold text-3xl font-bold tracking-widest">🛂</p>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 flex gap-5">
          {/* Photo */}
          <div className="flex-shrink-0">
            {application.photo_path ? (
              <img
                src={`/uploads/${application.photo_path}`}
                alt="Passport photo"
                className="w-24 h-28 object-cover rounded-lg border-2 border-passport-gold/60"
              />
            ) : (
              <div className="w-24 h-28 bg-white/10 rounded-lg border-2 border-passport-gold/40 flex items-center justify-center">
                <span className="text-white/30 text-3xl">👤</span>
              </div>
            )}
            <div className="mt-2 text-center">
              <p className="text-passport-gold text-xs font-mono tracking-wider">
                {application.passport_type?.toUpperCase()}
              </p>
            </div>
          </div>

          {/* Details */}
          <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            {[
              ['Passport No.', application.passport_number],
              ['Nationality', application.nationality],
              ['Surname / Given Names', application.full_name],
              ['Gender', application.gender?.toUpperCase()],
              ['Date of Birth', application.date_of_birth],
              ['Place of Birth', application.place_of_birth],
              ['Date of Issue', application.issued_at],
              ['Date of Expiry', application.expires_at],
            ].map(([label, value]) => (
              <div key={label} className={label === 'Surname / Given Names' ? 'col-span-2' : ''}>
                <p className="text-white/40 text-xs uppercase tracking-wider">{label}</p>
                <p className="text-white font-semibold font-mono tracking-wide mt-0.5">{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* MRZ strip + QR code */}
        <div className="px-6 pb-5 pt-1 flex gap-3 items-end">
          <div className="flex-1 bg-black/30 rounded-lg px-4 py-2 border border-white/10">
            <p className="text-green-400 font-mono text-xs tracking-[0.15em] leading-relaxed select-all">
              {'P<' + application.nationality?.toUpperCase().slice(0, 3).padEnd(3, '<') +
                application.full_name?.toUpperCase().replace(/\s+/g, '<').padEnd(39, '<').slice(0, 39)}
            </p>
            <p className="text-green-400 font-mono text-xs tracking-[0.15em] leading-relaxed select-all">
              {(application.passport_number || '').padEnd(9, '<') +
                application.nationality?.toUpperCase().slice(0, 3).padEnd(3, '<') +
                (application.date_of_birth || '').replace(/-/g, '').slice(2) +
                (application.gender?.[0]?.toUpperCase() || 'X') +
                (application.expires_at || '').replace(/-/g, '').slice(2) +
                '<<<<<<<<<<<<<<'.slice(0, 14)}
            </p>
          </div>
          {/* QR Code */}
          <div className="flex-shrink-0 bg-white rounded-lg p-1.5">
            <QRCodeSVG
              value={`${window.location.origin}/verify/${application.passport_number}`}
              size={72}
              level="M"
              includeMargin={false}
            />
            <p className="text-center text-gray-400 text-[9px] mt-0.5">SCAN TO VERIFY</p>
          </div>
        </div>
      </div>

      {/* Verification link panel */}
      <div className="mt-4 rounded-xl p-4 no-print border border-emerald-200" style={{ background: 'linear-gradient(135deg, #ecfdf5, #d1fae5)' }}>
        <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-1">Your Verification Link</p>
        <p className="text-xs text-emerald-600 mb-3">
          Share this link or QR code — anyone can verify your passport without logging in.
        </p>
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-white border border-emerald-200 rounded-lg px-3 py-2 text-xs font-mono text-gray-600 truncate">
            {verifyUrl}
          </div>
          <button
            onClick={handleCopy}
            className={`flex-shrink-0 px-3 py-2 rounded-lg text-xs font-bold transition ${
              copied ? 'bg-emerald-500 text-white' : 'text-white'
            }`}
            style={copied ? {} : { background: 'linear-gradient(135deg, #1a2744, #243660)' }}
          >
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
          <a
            href={verifyUrl}
            target="_blank"
            rel="noreferrer"
            className="flex-shrink-0 px-3 py-2 rounded-lg text-xs font-bold bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-100 transition"
          >
            Open ↗
          </a>
        </div>
      </div>
    </div>
  );
}

export default function ApplicationStatus() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const [application, setApplication] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  // Messaging state
  const [messages, setMessages] = useState<any[]>([]);
  const [msgInput, setMsgInput] = useState('');
  const [msgSending, setMsgSending] = useState(false);
  const [msgError, setMsgError] = useState('');
  const [liveFlash, setLiveFlash] = useState(false);
  const currentUser = JSON.parse(sessionStorage.getItem('user') || '{}');

  // CSAT state
  const [csatRating, setCsatRating] = useState<number | null>(null);
  const [csatHover, setCsatHover] = useState<number | null>(null);
  const [csatComment, setCsatComment] = useState('');
  const [csatSubmitted, setCsatSubmitted] = useState(false);
  const [csatLoading, setCsatLoading] = useState(false);

  // Live support chat state
  const [supportChatOpen, setSupportChatOpen] = useState(false);
  const [supportMsgInput, setSupportMsgInput] = useState('');
  const [supportMsgSending, setSupportMsgSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Re-apply state
  const [showReapply, setShowReapply] = useState(false);
  const [reapplyStep, setReapplyStep] = useState(1);
  const [reapplyLoading, setReapplyLoading] = useState(false);
  const [reapplyError, setReapplyError] = useState('');
  const [reapplyPhoto, setReapplyPhoto] = useState<File | null>(null);
  const [reapplyIdDoc, setReapplyIdDoc] = useState<File | null>(null);
  const [reapplyForm, setReapplyForm] = useState({
    full_name: '', date_of_birth: '', nationality: '', gender: '',
    place_of_birth: '', address: '', phone: '', email: '', passport_type: 'regular',
    existing_passport_number: '',
  });

  // Lightbox state
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // Queue position state
  const [queuePos, setQueuePos] = useState<{ position: number | null; total: number | null; tier: string } | null>(null);

  // Document re-upload state
  const [showDocUpload, setShowDocUpload] = useState(false);
  const [uploadPhoto, setUploadPhoto] = useState<File | null>(null);
  const [uploadIdDoc, setUploadIdDoc] = useState<File | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState(false);

  // Tier downgrade state
  const [downgradingTier, setDowngradingTier] = useState(false);
  const [downgradeError, setDowngradeError] = useState('');

  const loadData = async () => {
    const [appRes, histRes, msgRes] = await Promise.all([
      api.get(`/applications/${id}`),
      api.get(`/applications/${id}/history`),
      api.get(`/applications/${id}/messages`),
    ]);
    setApplication(appRes.data);
    setHistory(histRes.data);
    setMessages(msgRes.data);
    setLoading(false);
    // Check CSAT if applicable (approved/rejected only)
    if (['approved', 'rejected'].includes(appRes.data.status)) {
      api.get(`/applications/${id}/csat`).then(({ data }) => {
        if (data) setCsatSubmitted(true);
      }).catch(() => {});
    }
    // Auto-open support chat if ?chat=1
    if (searchParams.get('chat') === '1') {
      setSupportChatOpen(true);
    }
    // Fetch queue position for active applications
    if (['pending', 'processing'].includes(appRes.data.status)) {
      api.get(`/applications/${id}/queue-position`)
        .then(({ data }) => setQueuePos(data))
        .catch(() => {});
    } else {
      setQueuePos(null);
    }
  };

  const sendMessage = async () => {
    if (!msgInput.trim() || msgSending) return;
    setMsgSending(true);
    setMsgError('');
    try {
      const { data } = await api.post(`/applications/${id}/messages`, { content: msgInput.trim() });
      setMessages((prev) => [...prev, data]);
      setMsgInput('');
    } catch (err: any) {
      setMsgError(err.response?.data?.message || 'Failed to send message.');
    } finally {
      setMsgSending(false);
    }
  };

  useEffect(() => { loadData(); }, [id]);

  // Live status updates pushed by admin via SSE → Navbar dispatches CustomEvent
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail.application_id !== id) return;
      setApplication((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          status:          detail.status,
          passport_number: detail.passport_number ?? prev.passport_number,
          issued_at:       detail.issued_at       ?? (prev as any).issued_at,
          expires_at:      detail.expires_at      ?? (prev as any).expires_at,
          admin_notes:     detail.admin_notes     ?? prev.admin_notes,
        } as Application;
      });
      // Append a synthetic history entry
      setHistory((prev) => [
        ...prev,
        {
          id: `live-${Date.now()}`,
          application_id: id!,
          status:          detail.status,
          admin_notes:     detail.admin_notes ?? null,
          changed_by_name: detail.admin_name ?? 'Admin',
          changed_at:      new Date().toISOString(),
        },
      ]);
      // Brief green flash to signal the live update
      setLiveFlash(true);
      setTimeout(() => setLiveFlash(false), 2500);
    };
    window.addEventListener('app:status_change', handler);
    return () => window.removeEventListener('app:status_change', handler);
  }, [id]);

  // Live support activated by admin via SSE
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail.application_id !== id) return;
      setApplication((prev) => prev ? { ...prev, support_chat_open: 1 } : prev);
      setSupportChatOpen(true);
    };
    window.addEventListener('app:support_activated', handler);
    return () => window.removeEventListener('app:support_activated', handler);
  }, [id]);

  // Live incoming messages from the other party via SSE → no reload needed
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail.application_id !== id) return;
      const msg = detail.message;
      if (msg.sender_id === currentUser.id) return; // already added optimistically by sender
      setMessages((prev) => {
        if (prev.find((m) => m.id === msg.id)) return prev; // deduplicate
        return [...prev, msg];
      });
    };
    window.addEventListener('app:new_message', handler);
    return () => window.removeEventListener('app:new_message', handler);
  }, [id]);

  // ESC key closes lightbox
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightboxUrl(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Auto-scroll support chat to bottom when messages change
  useEffect(() => {
    if (supportChatOpen && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, supportChatOpen]);

  const openReapply = () => {
    if (!application) return;
    setReapplyForm({
      full_name: application.full_name,
      date_of_birth: application.date_of_birth,
      nationality: application.nationality,
      gender: application.gender,
      place_of_birth: application.place_of_birth,
      address: application.address,
      phone: application.phone,
      email: application.email,
      passport_type: application.passport_type,
      existing_passport_number: (application as any).existing_passport_number || '',
    });
    setReapplyStep(1);
    setReapplyError('');
    setShowReapply(true);
  };

  const handleReapplySubmit = async (e: FormEvent) => {
    e.preventDefault();
    setReapplyError('');
    // Require photo if no existing one on file
    if (!application?.photo_path && !reapplyPhoto) {
      setReapplyError('Passport photo is required — please upload one.');
      return;
    }
    // Require ID document if no existing one on file
    if (!application?.id_document_path && !reapplyIdDoc) {
      setReapplyError('ID document is required — please upload one.');
      return;
    }
    setReapplyLoading(true);
    try {
      const formData = new FormData();
      Object.entries(reapplyForm).forEach(([k, v]) => formData.append(k, v));
      if (reapplyPhoto) formData.append('photo', reapplyPhoto);
      if (reapplyIdDoc) formData.append('id_document', reapplyIdDoc);
      await api.put(`/applications/${id}/reapply`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setShowReapply(false);
      await loadData();
    } catch (err: any) {
      setReapplyError(err.response?.data?.message || 'Resubmission failed');
    } finally {
      setReapplyLoading(false);
    }
  };

  const handleDocUpload = async () => {
    if (!uploadPhoto && !uploadIdDoc) return;
    setUploadLoading(true);
    setUploadError('');
    try {
      const fd = new FormData();
      if (uploadPhoto) fd.append('photo', uploadPhoto);
      if (uploadIdDoc) fd.append('id_document', uploadIdDoc);
      const { data } = await api.patch(`/applications/${id}/documents`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setApplication(data);
      setShowDocUpload(false);
      setUploadPhoto(null);
      setUploadIdDoc(null);
      setUploadSuccess(true);
      setTimeout(() => setUploadSuccess(false), 4000);
    } catch (err: any) {
      setUploadError(err.response?.data?.message || 'Upload failed');
    } finally {
      setUploadLoading(false);
    }
  };

  const handleDowngrade = async () => {
    if (!application) return;
    setDowngradingTier(true);
    setDowngradeError('');
    try {
      const { data } = await api.patch(`/applications/${application.id}/downgrade-tier`);
      setApplication(data);
    } catch (err: any) {
      setDowngradeError(err.response?.data?.message || 'Could not switch tier. Please try again.');
    } finally {
      setDowngradingTier(false);
    }
  };

  const handleCsatSubmit = async () => {
    if (!csatRating) return;
    setCsatLoading(true);
    try {
      await api.post(`/applications/${id}/csat`, { rating: csatRating, comment: csatComment });
      setCsatSubmitted(true);
    } catch {
      // silently fail — non-critical
    } finally {
      setCsatLoading(false);
    }
  };

  const sendSupportMessage = async () => {
    if (!supportMsgInput.trim() || supportMsgSending) return;
    setSupportMsgSending(true);
    try {
      const { data } = await api.post(`/applications/${id}/messages`, { content: supportMsgInput.trim() });
      setMessages((prev) => [...prev, data]);
      setSupportMsgInput('');
    } catch {
      // silently fail
    } finally {
      setSupportMsgSending(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: 'linear-gradient(160deg, #f0f4ff, #fafbff)' }}>
        <Navbar />
        <div className="flex items-center justify-center py-32">
          <div className="text-center">
            <svg className="animate-spin w-8 h-8 mx-auto mb-3 text-passport-navy" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-gray-500 text-sm">Loading application...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!application) {
    return (
      <div className="min-h-screen" style={{ background: 'linear-gradient(160deg, #f0f4ff, #fafbff)' }}>
        <Navbar />
        <div className="flex items-center justify-center py-32 text-gray-400">Application not found</div>
      </div>
    );
  }

  const config = statusConfig[application.status] || statusConfig.pending;
  const currentStep = statusSteps.indexOf(application.status);

  const details: [string, string][] = [
    ['Full Name',     application.full_name],
    ['Date of Birth', application.date_of_birth],
    ['Nationality',   application.nationality],
    ['Gender',        application.gender],
    ['Place of Birth', application.place_of_birth],
    ['Passport Type', application.passport_type],
    ['Phone',         application.phone],
    ['Email',         application.email],
    ['Submitted',     new Date(application.submitted_at).toLocaleString()],
    ['Reviewed',      application.reviewed_at ? new Date(application.reviewed_at).toLocaleString() : 'Not yet'],
  ];

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(160deg, #f0f4ff 0%, #f8faff 50%, #fafbff 100%)' }}>
      <Navbar />

      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Back link */}
        <div className="mb-5 no-print">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
            style={{ color: '#1a2744' }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Dashboard
          </Link>
        </div>

        {/* Live update flash */}
        {liveFlash && (
          <div className="mb-4 px-4 py-2.5 rounded-xl text-sm font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 flex items-center gap-2 animate-fade-in">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
            Status updated live — no refresh needed.
          </div>
        )}

        {/* Status banner */}
        <div className="rounded-2xl p-5 mb-6 no-print overflow-hidden relative" style={{ background: config.grad }}>
          <div
            className="absolute top-[-30%] right-[-5%] w-40 h-40 rounded-full opacity-20 pointer-events-none"
            style={{ background: 'radial-gradient(circle, #fff, transparent 70%)' }}
          />
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center text-3xl flex-shrink-0">
              {config.icon}
            </div>
            <div>
              <p className="text-xs text-white/70 font-mono tracking-widest">{application.application_number}</p>
              <p className="text-2xl font-bold text-white capitalize mt-0.5">{application.status}</p>
            </div>
          </div>
        </div>

        {/* Queue position — shown for pending/processing */}
        {queuePos && queuePos.position != null && (
          <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-5 mb-6 no-print">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg, #1a2744, #243660)' }}
                >
                  🔢
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Queue Position</p>
                  <p className="font-bold text-gray-800">
                    <span className="text-2xl" style={{ color: '#1a2744' }}>#{queuePos.position}</span>
                    <span className="text-gray-400 text-sm ml-1.5">of {queuePos.total} in queue</span>
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                  queuePos.tier === 'express'
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-blue-50 text-blue-700 border-blue-200'
                }`}>
                  {queuePos.tier === 'express' ? '⚡ Express' : '📋 Standard'} track
                </span>
                <p className="text-xs text-gray-400 mt-1">
                  Est. {queuePos.tier === 'express' ? '1–3' : '10–15'} days
                </p>
              </div>
            </div>
            {(queuePos.total ?? 0) > 1 && (
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs text-gray-400 mb-1.5">
                  <span>Your place in the processing queue</span>
                  <span>{queuePos.position} of {queuePos.total} remaining</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-1000"
                    style={{
                      width: `${Math.max(4, ((queuePos.total! - queuePos.position! + 1) / queuePos.total!) * 100)}%`,
                      background: queuePos.tier === 'express'
                        ? 'linear-gradient(90deg, #c9a227, #f0c84a)'
                        : 'linear-gradient(90deg, #1a2744, #243660)',
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Digital passport certificate — only when approved */}
        {application.status === 'approved' && application.passport_number && (
          <PassportCertificate application={application} />
        )}

        {/* Progress bar — not for rejected or approved */}
        {application.status !== 'rejected' && application.status !== 'approved' && (
          <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-6 mb-6">
            <h3 className="font-bold mb-5" style={{ color: '#1a2744' }}>Application Progress</h3>
            <div className="flex items-center">
              {statusSteps.map((step, i) => (
                <div key={step} className="flex items-center flex-1">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition"
                    style={i <= currentStep
                      ? { background: 'linear-gradient(135deg, #1a2744, #243660)', color: '#fff' }
                      : { background: '#e5e7eb', color: '#9ca3af' }
                    }
                  >
                    {i < currentStep ? '✓' : i + 1}
                  </div>
                  <div className="flex-1 flex flex-col items-center">
                    <div
                      className="h-1 w-full rounded-full"
                      style={{ background: i < currentStep ? 'linear-gradient(90deg, #1a2744, #243660)' : '#e5e7eb' }}
                    />
                    <span className="text-xs text-gray-500 mt-1.5 capitalize font-medium">{step}</span>
                  </div>
                </div>
              ))}
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                style={currentStep >= 2
                  ? { background: 'linear-gradient(135deg, #065f46, #059669)', color: '#fff' }
                  : { background: '#e5e7eb', color: '#9ca3af' }
                }
              >
                ✓
              </div>
            </div>
          </div>
        )}

        {/* Express payment panel */}
        {(application as any).processing_tier === 'express' && application.status !== 'rejected' && (
          (application as any).payment_status === 'paid' ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl shadow-card p-5 mb-6 flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-emerald-100 flex items-center justify-center text-2xl flex-shrink-0">✅</div>
              <div>
                <p className="font-bold text-emerald-800">Express Fee Confirmed — $50</p>
                <p className="text-sm text-emerald-700 mt-0.5">Payment received. Your application is being processed on the express track (24–72 hours).</p>
              </div>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl shadow-card p-5 mb-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-11 h-11 rounded-xl bg-amber-100 flex items-center justify-center text-2xl flex-shrink-0 animate-pulse">💳</div>
                <div>
                  <p className="font-bold text-amber-900">Express Fee Due — $50</p>
                  <p className="text-sm text-amber-700 mt-0.5">Your application is on the express track (24–72 hours) but requires payment to begin processing.</p>
                </div>
              </div>
              <div className="bg-white/80 rounded-xl border border-amber-200 p-4 text-sm text-amber-900 space-y-1.5">
                <p className="font-semibold text-amber-800 mb-2">How to pay your $50 express fee:</p>
                <p>1. Visit any authorised passport office counter.</p>
                <p>2. Quote your application number: <span className="font-mono font-bold bg-amber-100 px-1.5 py-0.5 rounded">{application.application_number}</span></p>
                <p>3. Pay $50 by cash or card — staff will confirm your payment immediately.</p>
              </div>
              {application.status === 'pending' && (
                <div className="mt-4 pt-4 border-t border-amber-200">
                  <p className="text-xs text-amber-700 mb-3">Not able to pay the express fee? You can switch back to Standard processing at no cost.</p>
                  {downgradeError && (
                    <p className="text-xs text-red-600 mb-2 font-medium">{downgradeError}</p>
                  )}
                  <button
                    onClick={handleDowngrade}
                    disabled={downgradingTier}
                    className="w-full text-sm font-semibold py-2.5 px-4 rounded-xl border-2 border-amber-300 text-amber-800 bg-white hover:bg-amber-50 transition disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {downgradingTier ? (
                      <><span className="animate-spin">⏳</span> Switching…</>
                    ) : (
                      <>📋 Switch to Standard Processing (Free)</>
                    )}
                  </button>
                </div>
              )}
            </div>
          )
        )}

        {/* Admin notes */}
        {application.admin_notes && (
          <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-6 mb-6">
            <h3 className="font-bold mb-3" style={{ color: '#1a2744' }}>
              Official Notes
            </h3>
            <div className="border-l-4 border-yellow-400 pl-4 py-1 bg-amber-50 rounded-r-xl">
              <p className="text-gray-700 text-sm leading-relaxed">{application.admin_notes}</p>
            </div>
          </div>
        )}

        {/* Update documents — only for pending applications */}
        {application.status === 'pending' && (
          <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-5 mb-6 no-print">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-800">📎 Update Documents</p>
                <p className="text-xs text-gray-400 mt-0.5">Replace your photo or ID document while still in review</p>
              </div>
              <button
                onClick={() => { setShowDocUpload(true); setUploadError(''); setUploadPhoto(null); setUploadIdDoc(null); }}
                className="text-sm font-semibold px-4 py-2 rounded-xl text-white flex-shrink-0 transition hover:opacity-90"
                style={{ background: 'linear-gradient(135deg, #1a2744, #243660)' }}
              >
                Upload New Files
              </button>
            </div>
            {uploadSuccess && (
              <div className="mt-3 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-sm font-medium flex items-center gap-2">
                ✅ Documents updated — admin will review the new files.
              </div>
            )}
          </div>
        )}

        {/* Re-apply button for rejected */}
        {application.status === 'rejected' && !showReapply && (
          <div className="bg-white rounded-2xl shadow-card border border-red-100 p-5 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-gray-800">Application Rejected</p>
                <p className="text-sm text-gray-500 mt-0.5">Review the admin notes above, then edit and resubmit.</p>
              </div>
              <button
                onClick={openReapply}
                className="flex items-center gap-2 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition hover:shadow-lg flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #c9a227, #f0c84a)', color: '#0f1b3a' }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Edit &amp; Resubmit
              </button>
            </div>
          </div>
        )}

        {/* Timeline */}
        {history.length > 0 && (
          <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-6 mb-6">
            <h3 className="font-bold mb-5" style={{ color: '#1a2744' }}>Application Timeline</h3>
            <div className="relative">
              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-100" />
              <div className="space-y-4">
                {history.map((entry, i) => {
                  const cfg = historyStatusConfig[entry.status] || historyStatusConfig.pending;
                  const isLast = i === history.length - 1;
                  return (
                    <div key={entry.id} className="flex gap-4 relative">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 z-10 border-2 border-white shadow-sm ${isLast ? cfg.dot : 'bg-gray-200'}`}>
                        {isLast ? <span className="text-white text-xs">●</span> : <span className="text-gray-400 text-xs">✓</span>}
                      </div>
                      <div className="flex-1 pb-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-sm font-bold capitalize ${cfg.color}`}>{cfg.icon} {entry.status}</span>
                          <span className="text-xs text-gray-400">by {entry.changed_by_name}</span>
                          <span className="text-xs text-gray-300">·</span>
                          <span className="text-xs text-gray-400">{new Date(entry.changed_at).toLocaleString()}</span>
                        </div>
                        {entry.admin_notes && (
                          <p className="text-xs text-gray-500 mt-1 italic bg-gray-50 rounded-lg px-3 py-1.5 border-l-2 border-gray-200">
                            {entry.admin_notes}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Uploaded Documents — thumbnail preview */}
        {((application as any).photo_path || (application as any).id_document_path) && (
          <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-6 mb-6 no-print">
            <h3 className="font-bold mb-4" style={{ color: '#1a2744' }}>Uploaded Documents</h3>
            <div className="flex gap-5">
              {(application as any).photo_path && (
                <button
                  onClick={() => setLightboxUrl(`/uploads/${(application as any).photo_path}`)}
                  className="group relative flex-shrink-0 focus:outline-none"
                >
                  <img
                    src={`/uploads/${(application as any).photo_path}`}
                    alt="Passport photo"
                    className="w-24 h-28 object-cover rounded-xl border-2 border-gray-200 group-hover:border-yellow-400 transition shadow-sm"
                  />
                  <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/0 group-hover:bg-black/40 transition">
                    <span className="text-white text-xs font-bold opacity-0 group-hover:opacity-100 transition drop-shadow">🔍 View</span>
                  </div>
                  <p className="text-xs text-gray-400 text-center mt-1.5 font-medium">Photo</p>
                </button>
              )}
              {(application as any).id_document_path && (
                /\.(jpg|jpeg|png)$/i.test((application as any).id_document_path) ? (
                  <button
                    onClick={() => setLightboxUrl(`/uploads/${(application as any).id_document_path}`)}
                    className="group relative flex-shrink-0 focus:outline-none"
                  >
                    <img
                      src={`/uploads/${(application as any).id_document_path}`}
                      alt="ID document"
                      className="w-24 h-28 object-cover rounded-xl border-2 border-gray-200 group-hover:border-yellow-400 transition shadow-sm"
                    />
                    <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/0 group-hover:bg-black/40 transition">
                      <span className="text-white text-xs font-bold opacity-0 group-hover:opacity-100 transition drop-shadow">🔍 View</span>
                    </div>
                    <p className="text-xs text-gray-400 text-center mt-1.5 font-medium">ID Document</p>
                  </button>
                ) : (
                  <a
                    href={`/uploads/${(application as any).id_document_path}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex flex-col items-center gap-1 group"
                  >
                    <div className="w-24 h-28 bg-red-50 border-2 border-red-100 group-hover:border-yellow-400 rounded-xl flex items-center justify-center transition shadow-sm">
                      <span className="text-4xl">📄</span>
                    </div>
                    <p className="text-xs text-gray-400 font-medium group-hover:text-blue-600 transition mt-0.5">ID Doc (PDF) ↗</p>
                  </a>
                )
              )}
            </div>
          </div>
        )}

        {/* Application details */}
        <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-6">
          <h3 className="font-bold mb-5" style={{ color: '#1a2744' }}>Application Details</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {details.map(([label, value]) => (
              <div key={label}>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
                <p className={`text-gray-800 font-medium text-sm ${rawFields.has(label) ? '' : 'capitalize'}`}>
                  {label === 'Email' ? (
                    <a
                      href={`mailto:${value}`}
                      className="text-blue-600 hover:underline font-mono text-xs"
                    >
                      {value}
                    </a>
                  ) : value}
                </p>
              </div>
            ))}
            {/* Address spans full width */}
            <div className="col-span-2">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-0.5">Address</p>
              <p className="text-gray-800 font-medium text-sm">{application.address}</p>
            </div>
          </div>
        </div>

        {/* CSAT Survey — shown for approved or rejected once */}
        {(application.status === 'approved' || application.status === 'rejected') && !csatSubmitted && (
          <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden mt-6 no-print">
            <div
              className="px-6 py-4 border-b border-gray-100"
              style={{ background: 'linear-gradient(135deg, #f8faff, #f0f4ff)' }}
            >
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <span style={{ color: '#c9a227' }}>⭐</span>
                How was your experience?
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">Your feedback helps us improve our service</p>
            </div>
            <div className="p-6">
              {/* Star picker */}
              <div className="flex items-center gap-2 mb-4">
                {[1, 2, 3, 4, 5].map((star) => {
                  const filled = (csatHover ?? csatRating ?? 0) >= star;
                  return (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setCsatRating(star)}
                      onMouseEnter={() => setCsatHover(star)}
                      onMouseLeave={() => setCsatHover(null)}
                      className="text-3xl transition-transform hover:scale-110 focus:outline-none"
                      style={{ color: filled ? '#c9a227' : '#d1d5db', lineHeight: 1 }}
                    >
                      ★
                    </button>
                  );
                })}
                {csatRating && (
                  <span className="ml-2 text-sm text-gray-500 font-medium">
                    {['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'][csatRating]}
                  </span>
                )}
              </div>
              <textarea
                value={csatComment}
                onChange={(e) => setCsatComment(e.target.value)}
                placeholder="Any additional comments? (optional)"
                rows={2}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100 transition resize-none mb-4"
              />
              <button
                onClick={handleCsatSubmit}
                disabled={!csatRating || csatLoading}
                className="flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed text-white"
                style={{ background: 'linear-gradient(135deg, #c9a227, #f0c84a)', color: '#0f1b3a' }}
              >
                {csatLoading ? (
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : '⭐'}
                Submit Feedback
              </button>
            </div>
          </div>
        )}
        {(application.status === 'approved' || application.status === 'rejected') && csatSubmitted && (
          <div className="mt-6 px-4 py-3 rounded-xl text-sm font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 flex items-center gap-2 no-print">
            <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
            Thank you for your feedback! Your response helps us improve our service.
          </div>
        )}

        {/* Messaging thread */}
        <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-6 mt-6">
          <h3 className="font-bold mb-4 flex items-center gap-2" style={{ color: '#1a2744' }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            Messages
          </h3>

          <div className="space-y-3 mb-4 max-h-72 overflow-y-auto pr-1">
            {messages.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">No messages yet. Send a message to the admin team.</p>
            )}
            {messages.map((msg) => {
              const isMe = msg.sender_id === currentUser.id;
              return (
                <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-xs rounded-2xl px-4 py-2.5 text-sm ${isMe ? 'text-white rounded-br-sm' : 'bg-gray-100 text-gray-800 rounded-bl-sm'}`}
                    style={isMe ? { background: 'linear-gradient(135deg, #1a2744, #243660)' } : {}}>
                    {!isMe && <p className="text-xs font-bold mb-0.5" style={{ color: '#c9a227' }}>{msg.sender_name}</p>}
                    <p className="leading-relaxed">{msg.content}</p>
                    <p className={`text-xs mt-1 ${isMe ? 'text-blue-300' : 'text-gray-400'}`}>
                      {new Date(msg.created_at.replace(' ', 'T') + 'Z').toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={msgInput}
              onChange={(e) => setMsgInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder="Type a message..."
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100 transition"
            />
            <button
              onClick={sendMessage}
              disabled={!msgInput.trim() || msgSending}
              className="flex-shrink-0 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition disabled:opacity-50 flex items-center gap-1.5"
              style={{ background: 'linear-gradient(135deg, #1a2744, #243660)' }}
            >
              {msgSending ? (
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              )}
              Send
            </button>
          </div>
          {msgError && (
            <p className="mt-2 text-xs text-red-600 flex items-center gap-1">
              <span>⚠️</span> {msgError}
            </p>
          )}
        </div>
      </div>

      {/* Floating Live Support button — shown when support is open and chat panel is closed */}
      {application.support_chat_open === 1 && !supportChatOpen && (
        <button
          onClick={() => setSupportChatOpen(true)}
          className="fixed bottom-6 right-6 flex items-center gap-2 text-sm font-bold px-4 py-3 rounded-2xl shadow-2xl text-white z-40 no-print"
          style={{ background: 'linear-gradient(135deg, #0f1b3a, #1a2744)' }}
        >
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
          💬 Live Support
        </button>
      )}

      {/* Floating Live Support Chat Panel */}
      {supportChatOpen && (
        <div
          className="fixed bottom-6 right-6 w-80 rounded-2xl shadow-2xl overflow-hidden z-40 flex flex-col no-print"
          style={{ height: '420px', background: '#fff' }}
        >
          {/* Panel header */}
          <div
            className="flex items-center justify-between px-4 py-3 flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #0f1b3a, #1a2744)' }}
          >
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
              <span className="text-white font-bold text-sm">Live Support</span>
              <span className="text-blue-300 text-xs">· {application.application_number}</span>
            </div>
            <button
              onClick={() => setSupportChatOpen(false)}
              className="text-blue-300 hover:text-white transition text-xl leading-none font-bold"
            >
              ×
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {messages.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-8">
                No messages yet. Our team will respond shortly.
              </p>
            )}
            {messages.map((msg) => {
              const isMe = msg.sender_id === currentUser.id;
              return (
                <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[75%] sm:max-w-[220px] rounded-2xl px-3 py-2 text-xs ${isMe ? 'text-white rounded-br-sm' : 'bg-gray-100 text-gray-800 rounded-bl-sm'}`}
                    style={isMe ? { background: 'linear-gradient(135deg, #1a2744, #243660)' } : {}}
                  >
                    {!isMe && <p className="text-xs font-bold mb-0.5" style={{ color: '#c9a227' }}>{msg.sender_name}</p>}
                    <p className="leading-relaxed">{msg.content}</p>
                    <p className={`text-xs mt-0.5 ${isMe ? 'text-blue-300' : 'text-gray-400'}`}>
                      {new Date(msg.created_at.replace(' ', 'T') + 'Z').toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="flex gap-2 p-3 border-t border-gray-100 flex-shrink-0">
            <input
              type="text"
              value={supportMsgInput}
              onChange={(e) => setSupportMsgInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendSupportMessage(); } }}
              placeholder="Type a message..."
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100 transition"
            />
            <button
              onClick={sendSupportMessage}
              disabled={!supportMsgInput.trim() || supportMsgSending}
              className="flex-shrink-0 text-white px-3 py-2 rounded-xl text-xs font-semibold transition disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #1a2744, #243660)' }}
            >
              {supportMsgSending ? (
                <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Re-apply Modal */}
      {showReapply && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg my-8">
            <div className="px-6 py-5 rounded-t-3xl" style={{ background: 'linear-gradient(135deg, #0f1b3a, #1a2744)' }}>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white">Edit &amp; Resubmit Application</h2>
                  <p className="text-blue-300 text-xs mt-0.5">Step {reapplyStep} of 3 — {reapplyStep === 1 ? 'Personal Info' : reapplyStep === 2 ? 'Contact & Type' : 'Documents'}</p>
                </div>
                <button onClick={() => setShowReapply(false)} className="text-blue-300 hover:text-white text-2xl leading-none transition">×</button>
              </div>
              <div className="flex items-center gap-2 mt-4">
                {[1, 2, 3].map((s) => (
                  <div key={s} className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition ${s <= reapplyStep ? 'text-passport-navy-dark' : 'bg-white/10 text-white/40'}`}
                      style={s <= reapplyStep ? { background: 'linear-gradient(135deg, #c9a227, #f0c84a)' } : {}}>
                      {s < reapplyStep ? '✓' : s}
                    </div>
                    {s < 3 && <div className={`h-0.5 w-8 rounded ${s < reapplyStep ? 'bg-passport-gold' : 'bg-white/10'}`} />}
                  </div>
                ))}
              </div>
            </div>
            <form onSubmit={handleReapplySubmit}>
              <div className="px-6 py-5 space-y-4">
                {reapplyError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">{reapplyError}</div>
                )}
                {reapplyStep === 1 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {([
                      { label: 'Full Name', key: 'full_name', colSpan: 2 },
                      { label: 'Date of Birth', key: 'date_of_birth', type: 'date' },
                      { label: 'Place of Birth', key: 'place_of_birth' },
                      { label: 'Nationality', key: 'nationality', placeholder: 'e.g. Malaysian' },
                    ] as { label: string; key: string; colSpan?: number; type?: string; placeholder?: string }[]).map(({ label, key, type, colSpan, placeholder }) => (
                      <div key={key} className={colSpan ? 'col-span-2' : ''}>
                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">{label}</label>
                        <input type={type || 'text'} lang={type === 'date' ? 'en-GB' : undefined} value={reapplyForm[key as keyof typeof reapplyForm]}
                          onChange={(e) => setReapplyForm({ ...reapplyForm, [key]: e.target.value })}
                          placeholder={placeholder}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100 transition" required />
                      </div>
                    ))}
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1.5">Gender</label>
                      <select value={reapplyForm.gender} onChange={(e) => setReapplyForm({ ...reapplyForm, gender: e.target.value })}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100 transition" required>
                        <option value="">Select</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                  </div>
                )}
                {reapplyStep === 2 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="col-span-1 sm:col-span-2">
                      <label className="block text-sm font-semibold text-gray-700 mb-1.5">Address</label>
                      <textarea value={reapplyForm.address} onChange={(e) => setReapplyForm({ ...reapplyForm, address: e.target.value })}
                        rows={3} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100 transition resize-none" required />
                    </div>
                    {[
                      { label: 'Phone', key: 'phone', type: 'tel' },
                      { label: 'Email', key: 'email', type: 'email' },
                    ].map(({ label, key, type }) => (
                      <div key={key}>
                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">{label}</label>
                        <input type={type} value={reapplyForm[key as keyof typeof reapplyForm]}
                          onChange={(e) => setReapplyForm({ ...reapplyForm, [key]: e.target.value })}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100 transition" required />
                      </div>
                    ))}
                    <div className="col-span-2">
                      <label className="block text-sm font-semibold text-gray-700 mb-1.5">Passport Type</label>
                      <select value={reapplyForm.passport_type} onChange={(e) => setReapplyForm({ ...reapplyForm, passport_type: e.target.value })}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100 transition">
                        <option value="regular">Regular</option>
                        <option value="official">Official</option>
                        <option value="diplomatic">Diplomatic</option>
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                        Previous Passport Number <span className="text-red-500">*</span>
                      </label>
                      <input
                        value={reapplyForm.existing_passport_number}
                        onChange={(e) => setReapplyForm({ ...reapplyForm, existing_passport_number: e.target.value.toUpperCase() })}
                        placeholder="e.g. AB1234567"
                        maxLength={20}
                        required
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100 transition font-mono"
                      />
                      {!reapplyForm.existing_passport_number.trim() && (
                        <p className="text-xs text-red-500 mt-1">Required — must be filled to continue</p>
                      )}
                    </div>
                  </div>
                )}
                {reapplyStep === 3 && (
                  <div className="space-y-5">
                    {/* Passport Photo */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                        Passport Photo{' '}
                        {application?.photo_path
                          ? <span className="text-gray-400 font-normal text-xs">(keep or replace)</span>
                          : <span className="text-red-500 font-semibold text-xs">* Required — no photo on file</span>
                        }
                      </label>
                      {/* Existing photo — shown when no new file is selected */}
                      {application?.photo_path && !reapplyPhoto && (
                        <div className="flex items-center gap-3 mb-2 p-2.5 bg-emerald-50 border border-emerald-100 rounded-xl">
                          <img
                            src={`/uploads/${application.photo_path}`}
                            alt="Current passport photo"
                            className="w-12 h-12 object-cover rounded-lg border border-emerald-200 flex-shrink-0"
                          />
                          <div>
                            <p className="text-xs font-semibold text-emerald-700">Current photo on file</p>
                            <p className="text-xs text-gray-400">Will be kept unless you upload a new one</p>
                          </div>
                        </div>
                      )}
                      {/* New photo selected preview */}
                      {reapplyPhoto && (
                        <div className="flex items-center gap-3 mb-2 p-2.5 bg-blue-50 border border-blue-100 rounded-xl">
                          <img
                            src={URL.createObjectURL(reapplyPhoto)}
                            alt="New photo preview"
                            className="w-12 h-12 object-cover rounded-lg border border-blue-200 flex-shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-blue-700">New photo selected</p>
                            <p className="text-xs text-gray-400 truncate">{reapplyPhoto.name}</p>
                          </div>
                          <button type="button" onClick={() => setReapplyPhoto(null)}
                            className="text-red-400 hover:text-red-600 text-lg leading-none font-bold flex-shrink-0">✕</button>
                        </div>
                      )}
                      <input type="file" accept="image/jpeg,image/png"
                        onChange={(e) => setReapplyPhoto(e.target.files?.[0] || null)}
                        className="w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-passport-navy file:text-white hover:file:opacity-90 transition" />
                    </div>

                    {/* ID Document */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                        ID Document{' '}
                        {application?.id_document_path
                          ? <span className="text-gray-400 font-normal text-xs">(keep or replace)</span>
                          : <span className="text-red-500 font-semibold text-xs">* Required — no document on file</span>
                        }
                      </label>
                      <p className="text-xs text-gray-400 mb-1.5">e.g. National Registration Card (NRC), birth certificate, or existing passport</p>
                      {/* Existing ID — shown when no new file is selected */}
                      {application?.id_document_path && !reapplyIdDoc && (
                        <div className="flex items-center gap-3 mb-2 p-2.5 bg-emerald-50 border border-emerald-100 rounded-xl">
                          {/\.(jpg|jpeg|png)$/i.test(application.id_document_path) ? (
                            <img
                              src={`/uploads/${application.id_document_path}`}
                              alt="Current ID document"
                              className="w-12 h-12 object-cover rounded-lg border border-emerald-200 flex-shrink-0"
                            />
                          ) : (
                            <div className="w-12 h-12 bg-red-50 border border-red-100 rounded-lg flex items-center justify-center text-2xl flex-shrink-0">📄</div>
                          )}
                          <div>
                            <p className="text-xs font-semibold text-emerald-700">Current ID on file</p>
                            <p className="text-xs text-gray-400">Will be kept unless you upload a new one</p>
                          </div>
                        </div>
                      )}
                      {/* New ID selected */}
                      {reapplyIdDoc && (
                        <div className="flex items-center gap-3 mb-2 p-2.5 bg-blue-50 border border-blue-100 rounded-xl">
                          <div className="w-12 h-12 bg-blue-100 border border-blue-200 rounded-lg flex items-center justify-center text-2xl flex-shrink-0">📎</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-blue-700">New document selected</p>
                            <p className="text-xs text-gray-400 truncate">{reapplyIdDoc.name}</p>
                          </div>
                          <button type="button" onClick={() => setReapplyIdDoc(null)}
                            className="text-red-400 hover:text-red-600 text-lg leading-none font-bold flex-shrink-0">✕</button>
                        </div>
                      )}
                      <input type="file" accept="image/jpeg,image/png,application/pdf"
                        onChange={(e) => setReapplyIdDoc(e.target.files?.[0] || null)}
                        className="w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-passport-navy file:text-white hover:file:opacity-90 transition" />
                    </div>
                  </div>
                )}
              </div>
              <div className="px-6 pb-6 flex gap-3">
                {reapplyStep > 1 ? (
                  <button type="button" onClick={() => setReapplyStep((s) => s - 1)}
                    className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-50 transition">Back</button>
                ) : (
                  <button type="button" onClick={() => setShowReapply(false)}
                    className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-50 transition">Cancel</button>
                )}
                {reapplyStep < 3 ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (reapplyStep === 2 && !reapplyForm.existing_passport_number.trim()) return;
                      setReapplyStep((s) => s + 1);
                    }}
                    disabled={reapplyStep === 2 && !reapplyForm.existing_passport_number.trim()}
                    className="flex-1 text-white py-2.5 rounded-xl text-sm font-bold transition disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: 'linear-gradient(135deg, #1a2744, #243660)' }}>Next</button>
                ) : (
                  <button type="submit" disabled={reapplyLoading}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold transition disabled:opacity-60 flex items-center justify-center gap-2"
                    style={{ background: 'linear-gradient(135deg, #c9a227, #f0c84a)', color: '#0f1b3a' }}>
                    {reapplyLoading ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Submitting...</> : '🚀 Resubmit Application'}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ zIndex: 9999, background: 'rgba(0,0,0,0.88)' }}
          onClick={() => setLightboxUrl(null)}
        >
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-5 text-white text-4xl leading-none font-light hover:text-gray-300 transition"
            style={{ zIndex: 10000 }}
          >
            ×
          </button>
          <img
            src={lightboxUrl}
            alt="Document full view"
            className="max-w-full max-h-[90vh] rounded-2xl shadow-2xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Document re-upload modal */}
      {showDocUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-slide-up">
            <div className="px-6 py-5" style={{ background: 'linear-gradient(135deg, #0f1b3a, #1a2744)' }}>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white">Update Documents</h2>
                  <p className="text-blue-300 text-xs mt-0.5">Replace your passport photo or ID document</p>
                </div>
                <button onClick={() => setShowDocUpload(false)} className="text-blue-300 hover:text-white text-2xl leading-none transition">×</button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              {uploadError && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">{uploadError}</div>
              )}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Passport Photo <span className="text-gray-400 font-normal text-xs">(optional — replaces current)</span>
                </label>
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  onChange={(e) => setUploadPhoto(e.target.files?.[0] || null)}
                  className="w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-passport-navy file:text-white hover:file:opacity-90 transition"
                />
                {uploadPhoto && <p className="text-xs text-blue-600 mt-1 font-medium">Selected: {uploadPhoto.name}</p>}
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  ID Document <span className="text-gray-400 font-normal text-xs">(optional — replaces current)</span>
                </label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,application/pdf"
                  onChange={(e) => setUploadIdDoc(e.target.files?.[0] || null)}
                  className="w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-passport-navy file:text-white hover:file:opacity-90 transition"
                />
                {uploadIdDoc && <p className="text-xs text-blue-600 mt-1 font-medium">Selected: {uploadIdDoc.name}</p>}
              </div>
              <p className="text-xs text-gray-400">Leave a field blank to keep your existing file for that slot.</p>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={() => setShowDocUpload(false)}
                className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDocUpload}
                disabled={uploadLoading || (!uploadPhoto && !uploadIdDoc)}
                className="flex-1 text-white py-2.5 rounded-xl text-sm font-bold transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(135deg, #1a2744, #243660)' }}
              >
                {uploadLoading ? (
                  <>
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Uploading...
                  </>
                ) : '📎 Update Documents'}
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}
