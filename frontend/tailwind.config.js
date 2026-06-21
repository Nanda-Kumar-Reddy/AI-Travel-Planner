/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // ── Editorial Indigo design system ──────────────────────────────────────
      colors: {
        void: '#09090F',
        surface: {
          DEFAULT: '#12121C',
          2: '#1C1C2E',
          3: '#252538',
        },
        border: '#2A2A3F',
        accent: {
          DEFAULT: '#6366F1',
          hover: '#818CF8',
          warm: '#F59E0B',
        },
        risk: {
          high: '#EF4444',
          medium: '#F59E0B',
          low: '#22C55E',
        },
        text: {
          primary: '#F8F8FF',
          secondary: '#A0A0B8',
          muted: '#6B6B88',
        },
      },
      fontFamily: {
        display: ['Outfit', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'surface-gradient': 'linear-gradient(135deg, #12121C 0%, #1C1C2E 100%)',
      },
      boxShadow: {
        'accent-glow': '0 0 20px rgba(99, 102, 241, 0.3)',
        'warm-glow': '0 0 20px rgba(245, 158, 11, 0.3)',
        'card-hover': '0 8px 32px rgba(0, 0, 0, 0.4)',
        'card': '0 2px 8px rgba(0, 0, 0, 0.3)',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'scale-in': 'scaleIn 0.3s ease-out',
        'pulse-ring': 'pulseRing 2s ease-in-out infinite',
        'draw-path': 'drawPath 2s ease-in-out forwards',
        'count-up': 'countUp 0.8s ease-out forwards',
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
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        pulseRing: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(99, 102, 241, 0.4)' },
          '50%': { boxShadow: '0 0 0 8px rgba(99, 102, 241, 0)' },
        },
        drawPath: {
          '0%': { strokeDashoffset: '1000' },
          '100%': { strokeDashoffset: '0' },
        },
        countUp: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
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
