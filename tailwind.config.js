/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Semantic theme tokens (see :root / [data-theme='white'] in index.css).
        // Short, collision-free keys so utilities read cleanly:
        //   bg-page/card/raised/field, text-ink/ink-soft/ink-muted, border-line/line-strong
        page: 'rgb(var(--surface-page) / <alpha-value>)',
        card: 'rgb(var(--surface-card) / <alpha-value>)',
        raised: 'rgb(var(--surface-raised) / <alpha-value>)',
        sunken: 'rgb(var(--surface-sunken) / <alpha-value>)',
        field: 'rgb(var(--surface-input) / <alpha-value>)',
        overlay: 'rgb(var(--surface-overlay) / <alpha-value>)',
        ink: 'rgb(var(--text-primary) / <alpha-value>)',
        'ink-soft': 'rgb(var(--text-secondary) / <alpha-value>)',
        'ink-muted': 'rgb(var(--text-muted) / <alpha-value>)',
        'ink-disabled': 'rgb(var(--text-disabled) / <alpha-value>)',
        line: 'rgb(var(--border-default) / <alpha-value>)',
        'line-strong': 'rgb(var(--border-strong) / <alpha-value>)',
        action: 'rgb(var(--action-primary) / <alpha-value>)',
        'action-hover': 'rgb(var(--action-primary-hover) / <alpha-value>)',
        'on-action': 'rgb(var(--action-on-primary) / <alpha-value>)',
        accent: 'rgb(var(--action-accent) / <alpha-value>)',
        'accent-hover': 'rgb(var(--action-primary-hover) / <alpha-value>)',
        'on-accent': 'rgb(var(--action-on-primary) / <alpha-value>)',
        focus: 'rgb(var(--focus-ring) / <alpha-value>)',
        state: {
          success: 'rgb(var(--state-success) / <alpha-value>)',
          warning: 'rgb(var(--state-warning) / <alpha-value>)',
          danger: 'rgb(var(--state-danger) / <alpha-value>)',
          info: 'rgb(var(--state-info) / <alpha-value>)',
        },
        category: {
          health: 'rgb(var(--category-health) / <alpha-value>)',
          work: 'rgb(var(--category-work) / <alpha-value>)',
          personal: 'rgb(var(--category-personal) / <alpha-value>)',
          fitness: 'rgb(var(--category-fitness) / <alpha-value>)',
          grocery: 'rgb(var(--category-grocery) / <alpha-value>)',
          nutrition: 'rgb(var(--category-nutrition) / <alpha-value>)',
        },
        primary: {
          50: '#ecfeff',
          100: '#cffafe',
          200: '#a5f3fc',
          300: '#67e8f9',
          400: '#22d3ee',
          500: '#06b6d4',
          600: '#0891b2',
          700: '#0e7490',
          800: '#155e75',
          900: '#164e63',
        },
        success: {
          50: '#f0fdf4',
          100: '#dcfce7',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
        },
        warning: {
          50: '#fffbeb',
          100: '#fef3c7',
          500: '#f59e0b',
          600: '#d97706',
        }
      },
      animation: {
        'bounce-in': 'bounceIn 0.6s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        bounceIn: {
          '0%': { transform: 'scale(0.3)', opacity: '0' },
          '50%': { transform: 'scale(1.05)' },
          '70%': { transform: 'scale(0.9)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
      boxShadow: {
        section: 'var(--shadow-section)',
        overlay: 'var(--shadow-overlay)',
      },
      borderRadius: {
        control: 'var(--radius-control)',
        section: 'var(--radius-section)',
        overlay: 'var(--radius-overlay)',
      },
      spacing: {
        'safe-area-inset-top': 'env(safe-area-inset-top)',
        'safe-area-inset-bottom': 'env(safe-area-inset-bottom)',
        'safe-area-inset-left': 'env(safe-area-inset-left)',
        'safe-area-inset-right': 'env(safe-area-inset-right)',
      },
      minHeight: {
        'screen-safe': 'calc(100vh - env(safe-area-inset-top) - env(safe-area-inset-bottom))',
      },
      screens: {
        'xs': '475px',
        'tall': { 'raw': '(min-height: 800px)' },
        'short': { 'raw': '(max-height: 600px)' },
      }
    },
  },
  plugins: [],
}
