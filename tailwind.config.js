/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html",
  ],
  theme: {
    extend: {
      fontFamily: {
        // v3: setting `sans` and `mono` re-types the whole app through Tailwind's
        // base + every existing `font-mono` (timer, stats) with no markup change.
        // `font-cond` is added to headings/dials incrementally during tab rebuilds.
        sans: ['"IBM Plex Sans"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        cond: ['"IBM Plex Sans Condensed"', '"IBM Plex Sans"', 'sans-serif'],
      },
      colors: {
        primary: 'rgb(var(--bg-primary) / <alpha-value>)',
        surface: 'rgb(var(--bg-surface) / <alpha-value>)',
        card: 'rgb(var(--bg-card) / <alpha-value>)',
        ink: 'rgb(var(--text-primary) / <alpha-value>)',
        'ink-muted': 'rgb(var(--text-muted) / <alpha-value>)',
        border: 'rgb(var(--border-color) / <alpha-value>)',
        accent: 'rgb(var(--accent-fill) / <alpha-value>)',
        'accent-text': 'rgb(var(--accent-text) / <alpha-value>)',
        error: 'rgb(var(--error-fill) / <alpha-value>)',
        'error-text': 'rgb(var(--error-text) / <alpha-value>)',
        success: 'rgb(var(--success-fill) / <alpha-value>)',
        'success-text': 'rgb(var(--success-text) / <alpha-value>)',
        'chart-ror': 'rgb(var(--chart-ror) / <alpha-value>)',
        'chart-heat': 'rgb(var(--chart-heat) / <alpha-value>)',
        'chart-fan': 'rgb(var(--chart-fan) / <alpha-value>)',
        'chart-temp': 'rgb(var(--chart-temp) / <alpha-value>)',
      },
    },
  },
  plugins: [],
};
