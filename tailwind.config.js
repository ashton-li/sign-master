/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{vue,js,ts}', './src/pages.json'],
  corePlugins: {
    preflight: false
  },
  theme: {
    extend: {
      colors: {
        brand: 'var(--color-brand)',
        surface: 'var(--color-surface)',
        ink: 'var(--color-ink)',
        muted: 'var(--color-muted)',
        success: 'var(--color-success)',
        danger: 'var(--color-danger)'
      },
      borderRadius: {
        card: '18px',
        btn: '20px',
        nav: '30px'
      },
      boxShadow: {
        'glass-md': 'var(--shadow-glass-md)',
        'glass-lg': 'var(--shadow-glass-lg)',
        'pulse-btn': '0 8px 24px rgba(88, 86, 224, 0.45)'
      },
      keyframes: {
        orbFloat: {
          '0%, 100%': { transform: 'translate3d(0, 0, 0) scale(1)' },
          '25%': { transform: 'translate3d(6%, -4%, 0) scale(1.12)' },
          '50%': { transform: 'translate3d(-3%, 7%, 0) scale(0.92)' },
          '75%': { transform: 'translate3d(-5%, -3%, 0) scale(1.08)' }
        },
        particleRise: {
          '0%': { opacity: '0', transform: 'translateY(100vh) scale(0)' },
          '15%': { opacity: '0.8' },
          '40%': { opacity: '0.5', transform: 'translateY(50vh) scale(1.5)' },
          '85%': { opacity: '0.1', transform: 'translateY(5vh) scale(0.5)' },
          '100%': { opacity: '0', transform: 'translateY(-20vh) scale(0)' }
        },
        haloPulse: {
          '0%': { transform: 'scale(1)', opacity: '0.72' },
          '100%': { transform: 'scale(1.72)', opacity: '0' }
        },
        statusBreathe: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.42', transform: 'scale(1.8)' }
        },
        pageIn: {
          '0%': { opacity: '0', filter: 'blur(10px)', transform: 'translateY(18px)' },
          '100%': { opacity: '1', filter: 'blur(0)', transform: 'translateY(0)' }
        }
      },
      animation: {
        'orb-float': 'orbFloat 16s ease-in-out infinite',
        'particle-rise': 'particleRise 9s ease-in infinite',
        'halo-pulse': 'haloPulse 2.5s ease-out infinite',
        'status-breathe': 'statusBreathe 2s ease-in-out infinite',
        'page-in': 'pageIn 420ms cubic-bezier(0.34, 1.56, 0.64, 1) both'
      }
    }
  },
  plugins: []
}
