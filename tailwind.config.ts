import type { Config } from 'tailwindcss';
import typography from '@tailwindcss/typography';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Sarabun"', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Theme tokens — see docs/THEME.md. Names kept as `mfu.*` so the
        // components using `mfu-primary` re-theme without markup changes.
        mfu: {
          primary: '#00704A',  // Starbucks green
          accent:  '#1E3932',  // Starbucks house green
        },
      },
    },
  },
  plugins: [typography],
};

export default config;
