/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        chainwatch: {
          red: '#dc2626',
          orange: '#ea580c',
          yellow: '#ca8a04',
          blue: '#2563eb',
        },
      },
    },
  },
  plugins: [],
};
