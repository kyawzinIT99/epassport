import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';
import { User, Notification } from '../types';
import api from '../services/api';

export default function Navbar() {
  const navigate = useNavigate();
  const userStr = sessionStorage.getItem('user');
  const user: User | null = userStr ? JSON.parse(userStr) : null;
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const unread = notifications.filter((n) => !n.read).length;

  const fetchNotifications = () => {
    if (!user) return;
    api.get('/notifications').then(({ data }) => setNotifications(data)).catch(() => {});
  };

  useEffect(() => {
    if (!user) return;
    fetchNotifications(); // load existing on mount

    const token = sessionStorage.getItem('token');
    if (!token) return;

    const es = new EventSource(`/api/notifications/stream?token=${encodeURIComponent(token)}`);

    es.addEventListener('notification', (e) => {
      const notif = JSON.parse(e.data);
      setNotifications((prev) => {
        if (prev.find((n) => n.id === notif.id)) return prev;
        return [notif, ...prev].slice(0, 20);
      });
    });

    // Relay status_change and new_application events to other pages via window CustomEvents
    es.addEventListener('status_change', (e) => {
      window.dispatchEvent(new CustomEvent('app:status_change', { detail: JSON.parse(e.data) }));
    });

    es.addEventListener('new_application', (e) => {
      window.dispatchEvent(new CustomEvent('app:new_application', { detail: JSON.parse(e.data) }));
    });

    // Relay support_activated event for floating chat panel in ApplicationStatus
    es.addEventListener('support_activated', (e) => {
      window.dispatchEvent(new CustomEvent('app:support_activated', { detail: JSON.parse(e.data) }));
    });

    // Relay new_message so chat panels update without a page reload
    es.addEventListener('new_message', (e) => {
      window.dispatchEvent(new CustomEvent('app:new_message', { detail: JSON.parse(e.data) }));
    });

    // On persistent error fall back to a single retry after 5 s
    es.onerror = () => { es.close(); };

    return () => es.close();
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleBellClick = () => {
    setShowDropdown((v) => !v);
    if (!showDropdown && unread > 0) {
      api.patch('/notifications/read-all').then(fetchNotifications).catch(() => {});
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    navigate('/login');
  };

  const typeIcon = { success: '✅', error: '❌', info: '📋' };

  return (
    <nav
      className="text-white shadow-glow-navy relative"
      style={{ background: 'linear-gradient(135deg, #0f1b3a 0%, #1a2744 55%, #1e3a6e 100%)' }}
    >
      {/* Subtle top accent line */}
      <div
        className="absolute top-0 left-0 right-0 h-0.5"
        style={{ background: 'linear-gradient(90deg, transparent, #c9a227, #f0c84a, #c9a227, transparent)' }}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-8">
            <Link to="/dashboard" className="flex items-center gap-3 group">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center text-xl flex-shrink-0 shadow-gold transition-transform group-hover:scale-110"
                style={{ background: 'linear-gradient(135deg, #c9a227, #f0c84a)' }}
              >
                🛂
              </div>
              <div className="leading-tight">
                <span className="font-bold text-base tracking-wide text-white">E-Passport</span>
                <span className="block text-xs text-blue-300 font-medium tracking-wider">SYSTEM</span>
              </div>
            </Link>

            {user?.role === 'admin' && (
              <Link
                to="/admin"
                className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg transition"
                style={{ color: '#f0c84a' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(201,162,39,0.15)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span>⚡</span>
                <span>Admin Panel</span>
              </Link>
            )}
            {user?.role === 'agent' && (
              <Link
                to="/agent"
                className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg transition"
                style={{ color: '#c4b5fd' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(139,92,246,0.15)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span>🤝</span>
                <span>Agent Portal</span>
              </Link>
            )}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
            {/* User info */}
            <Link
              to="/profile"
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl transition hover:bg-white/10 group"
              title="My Profile"
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 shadow-gold"
                style={{ background: 'linear-gradient(135deg, #c9a227, #f0c84a)', color: '#0f1b3a' }}
              >
                {user?.full_name?.charAt(0).toUpperCase()}
              </div>
              <div className="hidden sm:block leading-tight">
                <span className="text-sm font-medium text-white block">{user?.full_name}</span>
                <span
                  className="text-xs font-bold uppercase tracking-wider"
                  style={{ color: '#f0c84a' }}
                >
                  {user?.role}
                </span>
              </div>
            </Link>

            {/* Notification Bell */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={handleBellClick}
                className="relative p-2 rounded-xl hover:bg-white/10 transition"
                title="Notifications"
              >
                <svg className="w-5 h-5 text-blue-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {unread > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold shadow-sm">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </button>

              {showDropdown && (
                <div className="absolute right-0 top-12 w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 overflow-hidden animate-fade-in">
                  <div
                    className="px-4 py-3 border-b border-gray-100 flex items-center justify-between"
                    style={{ background: 'linear-gradient(135deg, #0f1b3a, #1a2744)' }}
                  >
                    <p className="font-semibold text-white text-sm flex items-center gap-2">
                      <svg className="w-4 h-4 text-yellow-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                      </svg>
                      Notifications
                      {unread > 0 && (
                        <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">{unread}</span>
                      )}
                    </p>
                    {notifications.length > 0 && (
                      <button
                        onClick={() => { api.patch('/notifications/read-all').then(fetchNotifications); }}
                        className="text-xs text-yellow-300 hover:text-yellow-200 transition font-medium"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="py-10 text-center">
                        <div className="text-3xl mb-2">🔔</div>
                        <p className="text-gray-400 text-sm">No notifications yet</p>
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          onClick={() => {
                            if (n.application_id) {
                              navigate(`/applications/${n.application_id}`);
                              setShowDropdown(false);
                            }
                          }}
                          className={`px-4 py-3 border-b border-gray-50 flex gap-3 items-start cursor-pointer hover:bg-blue-50/50 transition ${!n.read ? 'bg-blue-50' : ''}`}
                        >
                          <span className="text-base flex-shrink-0 mt-0.5">{typeIcon[n.type as keyof typeof typeIcon] || '📋'}</span>
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs leading-relaxed ${!n.read ? 'text-gray-800 font-semibold' : 'text-gray-500'}`}>
                              {n.message}
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {new Date(/Z|[+-]\d{2}:\d{2}$/.test(n.created_at) ? n.created_at : n.created_at.replace(' ', 'T') + 'Z').toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                          {!n.read && (
                            <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-1.5" />
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-xl transition text-red-300 hover:text-white hover:bg-red-500/20"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
