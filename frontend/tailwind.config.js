/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  // next-themes adds data-theme attribute to <html>
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      // ── Editorial Indigo design system — all resolved via CSS vars ─────────
      colors: {
        // These map to CSS vars so they respond to data-theme attribute changes
        void: 'var(--color-void)',
        surface: {
          DEFAULT: 'var(--color-surface)',
          2: 'var(--color-surface-2)',
          3: 'var(--color-surface-3)',
        },
        border: 'var(--color-border)',
        accent: {
          DEFAULT: 'var(--color-accent)',
          hover: 'var(--color-accent-hover)',
          warm: 'var(--color-accent-warm)',
        },
        risk: {
          high: 'var(--color-risk-high)',
          medium: 'var(--color-risk-medium)',
          low: 'var(--color-risk-low)',
        },
        text: {
          primary: 'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
          muted: 'var(--color-text-muted)',
        },
      },
      fontFamily: {
        display: ['Outfit', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
      boxShadow: {
        'accent-glow': '0 0 20px rgba(99, 102, 241, 0.3)',
        'warm-glow':   '0 0 20px rgba(245, 158, 11, 0.3)',
        'card-hover':  '0 8px 32px rgba(0, 0, 0, 0.4)',
        'card':        '0 2px 8px rgba(0, 0, 0, 0.3)',
      },
      animation: {
        'fade-in':   'fadeIn 0.5s cubic-bezier(0.4, 0, 0.2, 1) both',
        'slide-up':  'slideUp 0.45s cubic-bezier(0.34, 1.2, 0.64, 1) both',
        'slide-down':'slideDown 0.3s cubic-bezier(0.4, 0, 0.2, 1) both',
        'scale-in':  'scaleIn 0.3s cubic-bezier(0.34, 1.2, 0.64, 1) both',
        'pulse-ring':'pulseRing 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'draw-path': 'drawPath 2.5s cubic-bezier(0.4, 0, 0.2, 1) forwards',
        'count-up':  'countUp 0.8s cubic-bezier(0.4, 0, 0.2, 1) forwards',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%':   { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%':   { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%':   { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        pulseRing: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(99, 102, 241, 0.4)' },
          '50%':       { boxShadow: '0 0 0 8px rgba(99, 102, 241, 0)' },
        },
        drawPath: {
          '0%':   { strokeDashoffset: '1000' },
          '100%': { strokeDashoffset: '0' },
        },
        countUp: {
          '0%':   { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
      },
      transitionTimingFunction: {
        'spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'smooth': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
    },
  },
  plugins: [],
};
