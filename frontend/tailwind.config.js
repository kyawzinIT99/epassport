/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        passport: {
          navy: '#1a2744',
          'navy-light': '#243660',
          'navy-dark': '#0f1b3a',
          gold: '#c9a227',
          'gold-light': '#f0c84a',
          'gold-dark': '#a07d1a',
          green: '#2d6a4f',
          'green-light': '#40916c',
          cyan: '#0ea5e9',
          purple: '#8b5cf6',
          rose: '#f43f5e',
        },
      },
      backgroundImage: {
        'gradient-navy': 'linear-gradient(135deg, #0f1b3a 0%, #1a2744 50%, #1e3a6e 100%)',
        'gradient-gold': 'linear-gradient(135deg, #c9a227 0%, #f0c84a 100%)',
        'gradient-hero': 'linear-gradient(135deg, #0f1b3a 0%, #1a2744 40%, #1e3a6e 70%, #243660 100%)',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 6s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-12px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      boxShadow: {
        'navy': '0 4px 24px rgba(26, 39, 68, 0.25)',
        'gold': '0 4px 16px rgba(201, 162, 39, 0.35)',
        'glow-gold': '0 0 30px rgba(201, 162, 39, 0.2)',
        'glow-navy': '0 0 40px rgba(26, 39, 68, 0.4)',
        'card': '0 2px 16px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04)',
        'card-hover': '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
};
