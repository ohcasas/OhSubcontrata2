/** @type {import('tailwindcss').Config} */
// Configuración NativeWind — consume los tokens de src/design-system/tokens.js
// para que las clases utilitarias (bg-primary, text-onSurface, rounded-lg...)
// usen exactamente los mismos valores que el resto de la app.
const { colors, radius, spacing } = require('./src/design-system/tokens').default;

module.exports = {
  content: ['./App.tsx', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors,
      borderRadius: radius,
      spacing,
      fontFamily: {
        sans: ['PlusJakartaSans-Regular'],
      },
    },
  },
  plugins: [],
};
