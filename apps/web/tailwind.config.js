/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Primary brand — deep, serious indigo, not default bright blue
        brand: {
          50:  '#f5f7ff',
          100: '#e8edff',
          200: '#d1daff',
          300: '#a6b6ff',
          400: '#7b8efc',
          500: '#5468ef',
          600: '#3e4fd3',
          700: '#333eab',
          800: '#2d3587',
          900: '#27306e',
          950: '#181d44',
        },
        // Supporting neutrals — warmer than Tailwind default grays
        ink: {
          50:  '#f8f8f7',
          100: '#efefed',
          200: '#dedfda',
          300: '#bbbdb5',
          400: '#898c80',
          500: '#5d5f55',
          600: '#464840',
          700: '#343630',
          800: '#22231f',
          900: '#141511',
        },
        accent: {
          // Warm gold for highlights, badges, emphasis (fills / borders / large display).
          500: '#c79a3b',
          600: '#a67c27',
          // AA-safe text shades on white: 500/600 are only ~2.4:1 / 3.5:1, so small
          // text must use 700+ (≈4.9:1) or 800 (≈7:1). Use text-accent-700 for any
          // accent-coloured body/label text; keep 500/600 for backgrounds + emphasis.
          700: '#8a6d1f',
          800: '#6b5518',
        },
      },
      fontFamily: {
        // 'Inter Variable' / 'Fraunces Variable' are self-hosted via @fontsource
        // (see index.css). Plain 'Inter' / 'Fraunces' kept as fallbacks in case
        // an old SW serves the previous Google Fonts CSS; system fonts after.
        sans: ['"Inter Variable"', 'Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['"Fraunces Variable"', '"Fraunces"', 'Georgia', 'serif'],
      },
      fontSize: {
        // Tighter line-heights for display, more generous for body
        'display-lg': ['3.75rem', { lineHeight: '1.05', letterSpacing: '-0.02em' }],
        'display': ['2.75rem', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
        'display-sm': ['2rem', { lineHeight: '1.15', letterSpacing: '-0.01em' }],
      },
      boxShadow: {
        'soft':  '0 1px 2px rgba(20,21,17,0.04), 0 2px 6px rgba(20,21,17,0.04)',
        'card':  '0 1px 2px rgba(20,21,17,0.05), 0 8px 24px -12px rgba(20,21,17,0.08)',
        'float': '0 8px 30px -4px rgba(20,21,17,0.12), 0 2px 6px rgba(20,21,17,0.05)',
      },
      borderRadius: {
        xl2: '1rem',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'shimmer': 'shimmer 1.6s ease-in-out infinite',
      },
      keyframes: {
        fadeIn:  { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
}
