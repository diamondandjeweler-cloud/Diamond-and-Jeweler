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

        // ─────────────────────────────────────────────────────────────────
        // Marketing / public-funnel palette — ADDITIVE design tokens.
        // These name the exact hex literals currently hand-coded across the
        // ~17 public marketing files (About / Start / Careers / Pricing / …)
        // so a later pass can migrate `#0B1220` → `navy-900`, `#C9A24D` →
        // `gold-500`, etc. Nothing references these yet, so Tailwind's
        // on-demand engine emits NO new CSS — the compiled output for every
        // existing utility is byte-for-byte unchanged. Names are chosen to
        // avoid Tailwind's default palette keys (neutral/slate/gray/…), so
        // no default shade is overridden.
        // ─────────────────────────────────────────────────────────────────

        // Deep navy — the hero-gradient stops (#1B2A6B → #0B1742 → #0B1220).
        navy: {
          DEFAULT: '#0B1220',
          700: '#1B2A6B', // gradient top stop · link text on light surfaces
          800: '#0B1742', // page header + gradient mid stop
          900: '#0B1220', // hero base / darkest surface — the "brand-navy"
        },
        // Warm gold — eyebrows, CTAs, sparkles (fills / emphasis) + AA-safe
        // text shades for gold copy on light cards.
        gold: {
          DEFAULT: '#C9A24D',
          500: '#C9A24D', // the "brand-gold" — fills / emphasis
          600: '#a67c27',
          700: '#8a6d1f', // AA-safe gold body/label text on light
          800: '#8a6420', // deeper gold — headings on light cards
        },
        // Dark-neutral scale — cool navy-tinted neutrals for text, hairlines
        // and surfaces layered over the navy hero (periwinkle → midnight).
        midnight: {
          50:  '#f5f7ff',
          100: '#e8edff', // hairline / card border on light
          200: '#dbe4ff', // facet-chip text, soft highlights
          300: '#c7cef0', // body copy on navy hero
          400: '#a6b6ff', // decorative accents, chip borders
          500: '#7b8efc',
          600: '#3e4fd3',
          700: '#1e2d52', // ring on dark info card
          800: '#0d1528', // dark info-card surface
          900: '#0B1220',
        },
        // Explicit aliases matching the brand-navy / brand-gold token spec.
        'brand-navy': '#0B1220',
        'brand-gold': '#C9A24D',

        // ─────────────────────────────────────────────────────────────────
        // Semantic surface/content tokens → CSS variables (src/ui/tokens.css).
        // Flip once under `.dark`; components use bg-surface / text-fg /
        // border-border instead of hand-rolled `dark:` utilities — one source
        // of truth for theming. Additive: nothing references these yet, so the
        // on-demand engine emits no new CSS until a component adopts a token.
        // ─────────────────────────────────────────────────────────────────
        canvas: 'var(--canvas)',
        surface: { DEFAULT: 'var(--surface)', 2: 'var(--surface-2)' },
        border: { DEFAULT: 'var(--border)', strong: 'var(--border-strong)' },
        fg: { DEFAULT: 'var(--fg)', muted: 'var(--fg-muted)', subtle: 'var(--fg-subtle)' },
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
