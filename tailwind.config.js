/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: '#0B1F4B',
          'navy-light': '#162C66',
          'navy-dark': '#061330',
          orange: '#FF7A1A',
          'orange-hover': '#E6690D',
          'orange-tint': '#FFF1E4',
          'grey-blue': '#F4F6FB',
          'grey-blue-border': '#E2E8F0',
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Playfair Display"', 'Georgia', 'serif'],
      },
      minHeight: {
        touch: '44px',
      },
      minWidth: {
        touch: '44px',
      },
      boxShadow: {
        'soft': '0 4px 20px -2px rgba(11, 31, 75, 0.06)',
        'card': '0 2px 12px 0 rgba(11, 31, 75, 0.05)',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        scaleUp: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 0.2s ease-out forwards',
        scaleUp: 'scaleUp 0.2s ease-out forwards',
      },
    },
  },
  plugins: [],
}
