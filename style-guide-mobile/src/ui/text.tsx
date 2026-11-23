import { Text, type TextProps, type TextStyle } from 'react-native';
import { fonts, size, useTheme } from './theme';

type P = TextProps & { color?: string; style?: TextStyle | TextStyle[] };

export function Title({ style, color, ...p }: P) {
  const t = useTheme();
  return <Text accessibilityRole="header" maxFontSizeMultiplier={1.3} {...p} style={[{ fontFamily: fonts.display, fontSize: size.title, lineHeight: 40, color: color ?? t.ink }, style as TextStyle]} />;
}
export function Section({ style, color, ...p }: P) {
  const t = useTheme();
  return <Text accessibilityRole="header" maxFontSizeMultiplier={1.3} {...p} style={[{ fontFamily: fonts.display, fontSize: size.section, lineHeight: 32, color: color ?? t.ink }, style as TextStyle]} />;
}
/** Rani italic accent inside a Title ("Style it *on the photo*"). */
export function Accent({ style, ...p }: P) {
  const t = useTheme();
  return <Text {...p} style={[{ fontFamily: fonts.displayItalic, color: t.rani }, style as TextStyle]} />;
}
export function Eyebrow({ style, color, ...p }: P) {
  const t = useTheme();
  return <Text maxFontSizeMultiplier={1.3} {...p} style={[{ fontFamily: fonts.monoMedium, fontSize: size.eyebrow, letterSpacing: 1.3, textTransform: 'uppercase', color: color ?? t.muted }, style as TextStyle]} />;
}
export function Body({ style, color, ...p }: P) {
  const t = useTheme();
  return <Text maxFontSizeMultiplier={1.3} {...p} style={[{ fontFamily: fonts.body, fontSize: size.body, lineHeight: 22, color: color ?? t.ink }, style as TextStyle]} />;
}
export function Strong({ style, color, ...p }: P) {
  const t = useTheme();
  return <Text maxFontSizeMultiplier={1.3} {...p} style={[{ fontFamily: fonts.bodyBold, fontSize: size.body, color: color ?? t.ink }, style as TextStyle]} />;
}
export function Small({ style, color, ...p }: P) {
  const t = useTheme();
  return <Text maxFontSizeMultiplier={1.3} {...p} style={[{ fontFamily: fonts.body, fontSize: size.small, lineHeight: 18, color: color ?? t.muted }, style as TextStyle]} />;
}
