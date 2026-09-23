/**
 * Tokens de diseño — "Modular Architectural Luxury"
 * Portados 1:1 desde modular_architectural_luxury/DESIGN.md (export de Stitch).
 *
 * Esta es la ÚNICA fuente de verdad para colores, tipografía, espaciado y
 * radios en toda la app. Ninguna pantalla debe declarar su propia paleta
 * (a diferencia del export original de Stitch, donde cada code.html traía
 * su propio tailwind.config con nombres distintos para los mismos colores).
 *
 * En JS plano (no .ts) a propósito: tailwind.config.js lo carga con
 * require() normal de Node, que no sabe interpretar TypeScript. El código
 * de la app (.tsx) lo sigue importando igual gracias a "allowJs" en
 * tsconfig.json, así que no se pierde el autocompletado.
 */

const colors = {
  // Superficies
  surface: '#f8f9ff',
  surfaceDim: '#d7dae3',
  surfaceBright: '#f8f9ff',
  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#f1f3fc',
  surfaceContainer: '#ebeef7',
  surfaceContainerHigh: '#e5e8f1',
  surfaceContainerHighest: '#dfe2eb',
  surfaceBlueprint: '#F1F5F9',
  technicalIvory: '#F8FAFC',

  // Texto sobre superficie
  onSurface: '#181c22',
  onSurfaceVariant: '#44474c',
  inverseSurface: '#2d3137',
  inverseOnSurface: '#eef0fa',

  // Bordes
  outline: '#75777d',
  outlineVariant: '#c5c6cd',
  borderStructural: 'rgba(11, 25, 44, 0.08)',

  // Marca — Primary (Navy Arquitectónico Profundo)
  primary: '#0B192C',
  onPrimary: '#ffffff',
  primaryContainer: '#0e1c2f',
  onPrimaryContainer: '#77849c',

  // Marca — Secondary (Steel Navy)
  secondary: '#426086',
  onSecondary: '#ffffff',
  secondaryContainer: '#b3d1fd',
  onSecondaryContainer: '#3b5a7f',

  // Marca — Tertiary (Precision Cobalt)
  tertiary: '#2563EB',
  tertiaryLight: '#3B82F6',
  onTertiary: '#ffffff',

  // Acentos
  accentTerracotta: '#F25A2A',
  accentGold: '#D4AF37',
  accentGoldLight: '#F5E6AB',

  // Semántico
  success: '#10B981',
  error: '#BA1A1A',
  onError: '#ffffff',
  errorContainer: '#ffdad6',
  onErrorContainer: '#93000a',

  // Graphite / dark surfaces
  slateGraphite: '#121820',
  onBackground: '#181c22',
  background: '#f8f9ff',
};

/** Semántica de estado — mapea directamente a los badges vistos en el diseño */
const stateColors = {
  homologado: colors.success,
  partnerOro: colors.accentGold,
  informativo: colors.tertiary,
  urgente: colors.accentTerracotta,
};

const typography = {
  displayXl: { fontSize: 56, fontWeight: '800', lineHeight: 64, letterSpacing: -0.03 * 16 },
  displayXlMobile: { fontSize: 36, fontWeight: '800', lineHeight: 44, letterSpacing: -0.02 * 16 },
  headlineLg: { fontSize: 40, fontWeight: '700', lineHeight: 48, letterSpacing: -0.025 * 16 },
  headlineLgMobile: { fontSize: 28, fontWeight: '700', lineHeight: 36, letterSpacing: -0.015 * 16 },
  headlineMd: { fontSize: 28, fontWeight: '600', lineHeight: 36, letterSpacing: -0.02 * 16 },
  headlineSm: { fontSize: 22, fontWeight: '600', lineHeight: 28, letterSpacing: -0.01 * 16 },
  titleMd: { fontSize: 18, fontWeight: '600', lineHeight: 24, letterSpacing: -0.01 * 16 },
  bodyLg: { fontSize: 18, fontWeight: '400', lineHeight: 28, letterSpacing: -0.005 * 16 },
  bodyMd: { fontSize: 15, fontWeight: '400', lineHeight: 24, letterSpacing: 0 },
  bodySm: { fontSize: 13, fontWeight: '400', lineHeight: 20, letterSpacing: 0.005 * 16 },
  labelMd: { fontSize: 13, fontWeight: '600', lineHeight: 16, letterSpacing: 0.04 * 16 },
  labelSm: { fontSize: 11, fontWeight: '700', lineHeight: 14, letterSpacing: 0.08 * 16 },
};

const fontFamily = {
  sans: 'PlusJakartaSans-Regular',
  sansMedium: 'PlusJakartaSans-Medium',
  sansSemiBold: 'PlusJakartaSans-SemiBold',
  sansBold: 'PlusJakartaSans-Bold',
  sansExtraBold: 'PlusJakartaSans-ExtraBold',
};

/** Radios — en px, para React Native (no rem) */
const radius = {
  sm: 2,
  default: 4,
  md: 6,
  lg: 8,
  xl: 12,
  full: 9999,
};

/** Espaciado — en px, para React Native (no rem) */
const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 40,
  gutter: 24,
  gutterMobile: 16,
  margin: 48,
  marginMobile: 20,
};

/** Elevación — sombras de React Native (iOS shadow* / Android elevation) */
const elevation = {
  level1: {
    shadowColor: '#0B192C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  level2: {
    shadowColor: '#0B192C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 4,
  },
  level3: {
    shadowColor: '#0B192C',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.16,
    shadowRadius: 32,
    elevation: 8,
  },
};

const designSystem = { colors, stateColors, typography, fontFamily, radius, spacing, elevation };

module.exports = { colors, stateColors, typography, fontFamily, radius, spacing, elevation, designSystem };
module.exports.default = designSystem;
