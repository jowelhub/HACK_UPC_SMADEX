/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        display: ['Sora', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: {
          950: '#0b0f17',
          900: '#111827',
          800: '#1f2937',
          700: '#374151',
        },
        accent: {
          DEFAULT: '#22d3ee',
          dim: '#0891b2',
        },
      },
    },
  },
  plugins: [],
}
