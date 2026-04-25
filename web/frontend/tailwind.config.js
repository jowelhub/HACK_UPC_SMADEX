/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        /** Smadex-style brand purple */
        brand: {
          50: '#f7f0fc',
          100: '#ecdaf7',
          200: '#d9b8ef',
          700: '#5e2d87',
          800: '#4a2269',
          900: '#3c1a56',
          DEFAULT: '#7c3aad',
        },
        /** Warm off-white page canvas (smadex.com hero) */
        canvas: '#fcfaf8',
        ink: {
          950: '#1c1917',
          900: '#292524',
          800: '#44403c',
          700: '#57534e',
        },
        accent: {
          DEFAULT: '#7c3aad',
          dim: '#5e2d87',
          muted: '#9d5ccc',
        },
      },
      boxShadow: {
        card: '0 1px 3px 0 rgb(0 0 0 / 0.04), 0 1px 2px -1px rgb(0 0 0 / 0.04)',
      },
    },
  },
  plugins: [],
}
