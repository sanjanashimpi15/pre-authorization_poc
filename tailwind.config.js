/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./App.tsx",
    "./index.tsx"
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'opd-primary': '#06b6d4',
        'opd-primary-dark': '#0891b2',
        'opd-accent': '#a855f7',
        'primary-tint': 'rgba(6, 182, 212, 0.1)',
        'opd-bg': '#070a13',
        'opd-surface': '#0f172a',
        'opd-border': 'rgba(255, 255, 255, 0.08)',
        'opd-input-bg': '#1e293b',
        'opd-text-primary': '#f1f5f9',
        'opd-text-secondary': '#94a3b8',
        'opd-text-muted': '#64748b',
        'opd-success': '#10b981',
        'opd-error': '#ef4444',
        'veda-purple': '#a855f7',
        'aivana-accent': '#06b6d4',
        'aivana-dark': '#070a13',
        'aivana-grey': '#0f172a',
        'aivana-light-grey': 'rgba(255, 255, 255, 0.08)',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        serif: ['Inter', 'sans-serif'],
      },
      boxShadow: {
        'card': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
        'glow': '0 0 15px rgba(6, 182, 212, 0.15)',
      },
      keyframes: {
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        waveform: {
          '0%, 100%': { height: '20%' },
          '50%': { height: '100%' },
        }
      },
      animation: {
        fadeInUp: 'fadeInUp 0.4s ease-out forwards',
        waveform: 'waveform 1s ease-in-out infinite',
      }
    },
  },
  plugins: [],
}
