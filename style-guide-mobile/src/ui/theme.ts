import { useColorScheme } from 'react-native';

/** Design tokens (SPEC 8). */
export const light = {
  bg: '#FFF4F8', surface: '#FFFFFF', surface2: '#FCE6EF', ink: '#2A0F2E', muted: '#76566F',
  line: 'rgba(42,15,46,0.13)', rani: '#D6246E', marigold: '#F2A100', emerald: '#13795B',
  peacock: '#00838F', indigo: '#3A3FB5', onAccent: '#FFFFFF', canvas: '#000000',
};
export type Tokens = typeof light;
export const dark: Tokens = {
  bg: '#170B1A', surface: '#25132B', surface2: '#31193A', ink: '#FBEAF3', muted: '#C9A8C3',
  line: 'rgba(251,234,243,0.14)', rani: '#FF4F93', marigold: '#FFC233', emerald: '#3FCB98',
  peacock: '#2BC4D4', indigo: '#8C90FF', onAccent: '#1A0B1D', canvas: '#000000',
};

export const fonts = {
  display: 'BodoniModa_700Bold',
  displayHeavy: 'BodoniModa_800ExtraBold',
  displayItalic: 'BodoniModa_600SemiBold_Italic',
  body: 'Manrope_400Regular',
  bodyMedium: 'Manrope_500Medium',
  bodySemi: 'Manrope_600SemiBold',
  bodyBold: 'Manrope_700Bold',
  bodyHeavy: 'Manrope_800ExtraBold',
  mono: 'DMMono_400Regular',
  monoMedium: 'DMMono_500Medium',
};
export const size = { title: 34, section: 26, card: 15, body: 15, small: 13, eyebrow: 11 };
export const radius = { card: 18, photo: 24, pill: 999, input: 12 };
export const space = (n: number) => n * 8;
export const GUTTER = 16;

export function useTheme(): Tokens & { dark: boolean } {
  const scheme = useColorScheme();
  return scheme === 'dark' ? { ...dark, dark: true } : { ...light, dark: false };
}

/** Category tint (ethnic emerald, fusion peacock, western indigo). */
export const categoryTint = (t: Tokens, c: string) => (c === 'ethnic' ? t.emerald : c === 'fusion' ? t.peacock : t.indigo);
