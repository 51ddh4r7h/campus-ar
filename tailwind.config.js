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
        // Gold is now a muted champagne (was #F3B93F saturated yellow) for glassmorphism.
        night: '#070A12', // cinema-navy base
        abyss: '#04060B', // deepest inset
        screen: '#101624', // panel surface
        gold: '#D8C4A0', // muted champagne — restrained accent, not saturated yellow
        brass: '#A6906B', // muted warm stone
        spotlight: '#F0E6D3', // soft warm highlight
        ember: '#D94838', // marquee red (sparingly)
        chalk: '#EAE4D5', // warm paper-white — primary text
        fog: '#8B93A5', // dusk-muted secondary text
        line: '#232B3C', // hairline seams on panels
        glass: 'rgba(255,255,255,0.06)', // glassmorphism surface
        glassBorder: 'rgba(255,255,255,0.08)', // glass hairline
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
          '0 0 0 1px rgba(216, 196, 160, 0.22), 0 10px 34px -8px rgba(216, 196, 160, 0.28), inset 0 1px 0 rgba(255,255,255,0.06)',
        hot: '0 0 24px -4px rgba(216, 196, 160, 0.45)',
        haze: 'inset 0 1px 0 rgba(255,255,255,0.06)',
      },

      backgroundImage: {
        // Cold → hot ramp for the continuous heat track (token colors only).
        heat: 'linear-gradient(90deg, #232B3C 0%, #4A3F1E 38%, #B97E1E 62%, #F3B93F 82%, #D94838 100%)',
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
        // Sonar ping ring: expands + fades from the signal radar.
        'radar': {
          '0%': {transform: 'scale(0.35)', opacity: '0.7'},
          '100%': {transform: 'scale(1.6)', opacity: '0'},
        },
        // Clap impact — tiny screen shake on the AR view.
        'shake': {
          '0%, 100%': {transform: 'translate3d(0, 0, 0)'},
          '20%': {transform: 'translate3d(-5px, 3px, 0)'},
          '40%': {transform: 'translate3d(4px, -3px, 0)'},
          '60%': {transform: 'translate3d(-3px, -2px, 0)'},
          '80%': {transform: 'translate3d(2px, 2px, 0)'},
        },
      },

      animation: {
        'panel-rise': 'panel-rise 420ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-in': 'fade-in 320ms ease-out both',
        'pulse-lamp': 'pulse-lamp 2.4s ease-in-out infinite',
        'tick': 'tick 1s steps(2, start) infinite',
        'radar': 'radar 2.2s cubic-bezier(0.2, 0.6, 0.4, 1) infinite',
        'shake': 'shake 380ms ease-in-out both',
      },
    },
  },
  plugins: [],
}