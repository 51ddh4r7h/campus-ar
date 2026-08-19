/**
 * Campus Film Hunt — design tokens (see DESIGN.md).
 *
 * One source of truth for color, type, radii, depth and motion. Components
 * reference these tokens only — no ad-hoc arbitrary values.
 */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Cinema stage — see DESIGN.md §2 for roles.
        night: '#070A12', // cinema-navy base
        abyss: '#04060B', // deepest inset
        screen: '#101624', // panel surface
        gold: '#F3B93F', // marquee-lamp accent
        brass: '#B97E1E', // burnished gold
        spotlight: '#FFE9AE', // warm projecter highlight / success
        ember: '#D94838', // marquee red (sparingly)
        chalk: '#EAE4D5', // primary text
        fog: '#8B93A5', // muted text
        line: '#232B3C', // hairline seams on panels
      },

      fontFamily: {
        display: ['"Bebas Neue"', '"Arial Narrow"', 'Impact', 'sans-serif'],
        sans: ['"Instrument Sans"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['ui-monospace', '"SF Mono"', 'Menlo', 'Consolas', 'monospace'],
      },

      borderRadius: {
        panel: '18px',
        tile: '14px',
        chip: '10px',
      },

      boxShadow: {
        raise:
          '0 18px 48px -12px rgba(2, 4, 9, 0.85), 0 6px 16px -10px rgba(2, 4, 9, 0.6)',
        lamp:
          '0 0 0 1px rgba(243, 185, 63, 0.35), 0 10px 34px -8px rgba(243, 185, 63, 0.55), inset 0 1px 0 rgba(255, 233, 174, 0.4)',
        hot: '0 0 26px -4px rgba(243, 185, 63, 0.7)',
        haze: 'inset 0 1px 0 rgba(35, 43, 60, 0.7)',
      },

      keyframes: {
        'panel-rise': {
          '0%': {transform: 'translate3d(0, 100%, 0)', opacity: '0'},
          '100%': {transform: 'translate3d(0, 0, 0)', opacity: '1'},
        },
        'fade-in': {
          '0%': {opacity: '0'},
          '100%': {opacity: '1'},
        },
        'pulse-lamp': {
          '0%, 100%': {opacity: '1'},
          '50%': {opacity: '0.55'},
        },
        'tick': {
          '0%': {opacity: '1'},
          '100%': {opacity: '0.4'},
        },
      },

      animation: {
        'panel-rise': 'panel-rise 420ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-in': 'fade-in 320ms ease-out both',
        'pulse-lamp': 'pulse-lamp 2.4s ease-in-out infinite',
        'tick': 'tick 1s steps(2, start) infinite',
      },
    },
  },
  plugins: [],
}