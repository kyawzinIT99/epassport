export default function Footer() {
  return (
    <footer
      className="relative overflow-hidden mt-auto"
      style={{ background: 'linear-gradient(135deg, #0f1b3a 0%, #1a2744 60%, #1e3a6e 100%)' }}
    >
      {/* Gold top accent line */}
      <div className="h-px w-full" style={{ background: 'linear-gradient(90deg, transparent, #c9a227, #f0c84a, #c9a227, transparent)' }} />

      {/* Subtle grid overlay */}
      <div
        className="absolute inset-0 opacity-5 pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(#c9a227 1px, transparent 1px), linear-gradient(90deg, #c9a227 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* Orb glow */}
      <div
        className="absolute bottom-[-60%] right-[-5%] w-64 h-64 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(201,162,39,0.12), transparent 70%)' }}
      />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">

          {/* Left — identity */}
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-black flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #c9a227, #f0c84a)', color: '#0f1b3a' }}
            >
              K
            </div>
            <div>
              <p className="text-white font-bold text-sm leading-tight">Kyaw Zin Tun</p>
              <a
                href="mailto:itsolutions.mm@gmail.com"
                className="text-xs font-medium transition hover:text-yellow-300"
                style={{ color: '#c9a227' }}
              >
                itsolutions.mm@gmail.com
              </a>
            </div>
          </div>

          {/* Center — expertise tags */}
          <div className="flex items-center gap-2 flex-wrap justify-center">
            {['AI Automation', 'Cloud', 'Network'].map((tag) => (
              <span
                key={tag}
                className="text-xs font-semibold px-3 py-1 rounded-full border"
                style={{
                  background: 'rgba(201,162,39,0.1)',
                  borderColor: 'rgba(201,162,39,0.3)',
                  color: '#f0c84a',
                }}
              >
                {tag}
              </span>
            ))}
          </div>

          {/* Right — system label */}
          <div className="text-right">
            <p className="text-xs text-blue-300 font-medium">E-Passport Management System</p>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
              © {new Date().getFullYear()} IT Solutions MM
            </p>
          </div>

        </div>
      </div>
    </footer>
  );
}
