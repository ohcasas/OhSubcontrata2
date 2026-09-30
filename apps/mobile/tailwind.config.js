/** @type {import('tailwindcss').Config} */
// Configuración NativeWind — consume los tokens de src/design-system/tokens.js
// para que las clases utilitarias (bg-primary, text-onSurface, rounded-lg...)
// usen exactamente los mismos valores que el resto de la app.
const { colors, radius, spacing, colorsRediseno, radiusRediseno, fontFamily } =
  require('./src/design-system/tokens').default;

module.exports = {
  content: ['./App.tsx', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      // colorsRediseno va DESPUÉS de colors: si algún nombre coincidiera,
      // gana el del rediseño. No coinciden hoy (nombres distintos a propósito).
      colors: { ...colors, ...colorsRediseno },
      borderRadius: { ...radius, ...radiusRediseno },
      spacing,
      // font-sans, font-sansMedium, font-sansSemiBold, font-sansBold,
      // font-sansExtraBold — un peso de DM Sans por clase, ya que NativeWind
      // no soporta font-weight por separado del family en RN.
      fontFamily: {
        sans: [fontFamily.sans],
        sansMedium: [fontFamily.sansMedium],
        sansSemiBold: [fontFamily.sansSemiBold],
        sansBold: [fontFamily.sansBold],
        sansExtraBold: [fontFamily.sansExtraBold],
      },
      // Escala de tamaños subida a partir de la petición de Ainhoa ("se ve
      // pequeño, que sea legible para todo el mundo"). Como casi todo el
      // texto de la app usa estas clases con nombre (text-xs, text-sm...) en
      // vez de tamaños sueltos, subir la escala aquí sube el texto en TODA
      // la app de una vez, sin tener que tocar cada pantalla. Los tamaños
      // sueltos en corchetes (text-[10px], text-[11px]...) y los iconos
      // pequeños (size={10}, size={11}...) se han subido aparte, a mano, en
      // cada pantalla, porque esos no pasan por esta escala.
      fontSize: {
        xs: ['14px', { lineHeight: '18px' }],
        sm: ['16px', { lineHeight: '22px' }],
        base: ['17px', { lineHeight: '24px' }],
        lg: ['19px', { lineHeight: '26px' }],
        xl: ['21px', { lineHeight: '28px' }],
        '2xl': ['25px', { lineHeight: '32px' }],
        '3xl': ['31px', { lineHeight: '38px' }],
        '4xl': ['37px', { lineHeight: '44px' }],
      },
    },
  },
  plugins: [],
};