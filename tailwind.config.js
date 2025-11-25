/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './components/**/*.{ts,tsx,js,jsx}',
    './services/**/*.{ts,tsx,js,jsx}',
    './src/**/*.{ts,tsx,js,jsx}',
    './App.tsx'
  ],
  theme: {
    extend: {
      colors: {
        accent: '#00f0ff',
        'accent-dark': '#00a0aa'
      },
      fontFamily: {
        mono: ['"Space Mono"', 'monospace'],
        work: ['"Work Sans"', 'sans-serif']
      }
    },
  },
  plugins: [],
};