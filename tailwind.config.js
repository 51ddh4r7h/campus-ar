/**
 * Campus Film Hunt — Tactical Telemetry & CRT Terminal design tokens.
 * Archetype: dark-mode telemetry hunt — deactivated CRT substrate,
 * phosphor foreground, hazard-red alert, single terminal-green status.
 */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── Tactical Telemetry substrate ──
        background: '#0A0A0A', // deactivated CRT
        surface: '#141414', // panel surface
        raised: '#1A1A1A', // raised compartment
        foreground: '#EAEAEA', // white phosphor
        muted: '#8A8A8A', // dim phosphor / secondary
        line: '#2A2A2A', // compartment dividers
        lineStrong: '#3A3A3A', // emphasized divider
        hazard: '#FF2A2A', // aviation / hazard red — critical only
        hazardDim: 'rgba(255,42,42,0.12)', // hazard tint
        terminal: '#4AF626', // phosphor green — ONE element only
        // legacy aliases so existing TS class strings still resolve if missed
        night: '#0A0A0A',
        abyss: '#0A0A0A',
        screen: '#141414',
        chalk: '#EAEAEA',
        fog: '#8A8A8A',
        ember: '#FF2A2A',
        gold: '#EAEAEA',
        brass: '#8A8A8A',
        spotlight: '#EAEAEA',
        glass: 'rgba(255,255,255,0.04)',
        glassBorder: 'rgba(255,255,255,0.08)',
      },

      fontFamily: {
        display: ['"Avenir Next"', 'ui-sans-serif', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
        sans: ['"Avenir Next"', 'ui-sans-serif', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },

      borderRadius: {
        none: '0px',
        panel: '0px',
        tile: '0px',
        chip: '0px',
        DEFAULT: '0px',
      },

      borderWidth: {
        DEFAULT: '1px',
      },

      boxShadow: {
        none: 'none',
        // hard 1px borders replace soft shadows — brutalist determinism
        hard: '0 0 0 1px #2A2A2A',
        'hard-strong': '0 0 0 1px #3A3A3A',
        raise: 'none',
        lamp: 'none',
        hot: 'none',
        haze: 'none',
      },

      backgroundImage: {
        // heat ramp re-mapped to monochrome + hazard terminus
        heat: 'linear-gradient(90deg, #2A2A2A 0%, #4A4A4A 40%, #8A8A8A 65%, #EAEAEA 82%, #FF2A2A 100%)',
        scanlines:
          'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.12) 2px, rgba(0,0,0,0.12) 4px)',
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
          '50%': {opacity: '0.4'},
        },
        tick: {
          '0%': {opacity: '1'},
          '100%': {opacity: '0.35'},
        },
        radar: {
          '0%': {transform: 'scale(0.35)', opacity: '0.7'},
          '100%': {transform: 'scale(1.6)', opacity: '0'},
        },
        shake: {
          '0%, 100%': {transform: 'translate3d(0, 0, 0)'},
          '20%': {transform: 'translate3d(-4px, 2px, 0)'},
          '40%': {transform: 'translate3d(3px, -2px, 0)'},
          '60%': {transform: 'translate3d(-2px, -1px, 0)'},
          '80%': {transform: 'translate3d(2px, 1px, 0)'},
        },
        scanline: {
          '0%': {transform: 'translateY(-100%)'},
          '100%': {transform: 'translateY(100%)'},
        },
        flicker: {
          '0%, 100%': {opacity: '1'},
          '50%': {opacity: '0.96'},
        },
      },

      animation: {
        'panel-rise': 'panel-rise 360ms steps(8, end) both',
        'fade-in': 'fade-in 280ms ease-out both',
        'pulse-lamp': 'pulse-lamp 2.2s ease-in-out infinite',
        tick: 'tick 1s steps(2, start) infinite',
        radar: 'radar 2.2s cubic-bezier(0.2, 0.6, 0.4, 1) infinite',
        shake: 'shake 360ms ease-in-out both',
        scanline: 'scanline 8s linear infinite',
        flicker: 'flicker 0.15s steps(2, end) infinite',
      },
    },
  },
  plugins: [],
}
