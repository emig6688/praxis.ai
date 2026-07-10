/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Nest brand — Navy
        primary: {
          50:  '#eef1f9',
          100: '#d5ddf0',
          200: '#aabade',
          300: '#7a93c9',
          400: '#4e6db4',
          500: '#2d4f9e',
          600: '#1D3070',   // navy principal
          700: '#162453',
          800: '#101a3c',
          900: '#0a1025',
        },
        // Nest brand — Cyan accent
        accent: {
          50:  '#edf9fb',
          100: '#cceef4',
          200: '#9ddde9',
          300: '#7CC8D8',   // cyan principal
          400: '#5aaabf',
          500: '#3d8da6',
          600: '#2b718d',
          700: '#1e5570',
          800: '#143a52',
          900: '#0a2033',
        },
      },
      fontFamily: {
        gotham:    ['Gotham', 'system-ui', 'sans-serif'],
        sans:      ['Open Sans', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'nest':    '0 2px 12px 0 rgba(29, 48, 112, 0.10)',
        'nest-md': '0 4px 24px 0 rgba(29, 48, 112, 0.15)',
        'nest-lg': '0 8px 40px 0 rgba(29, 48, 112, 0.20)',
      },
      borderRadius: {
        'xl': '0.875rem',
        '2xl': '1.25rem',
      },
    },
  },
  plugins: [],
}
