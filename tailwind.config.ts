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
        mfu: {
          primary: '#7c1f2e',  // MFU maroon
          accent:  '#f0b323',  // MFU gold
        },
      },
    },
  },
  plugins: [typography],
};

export default config;
