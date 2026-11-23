import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { type ReactNode, useEffect } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming, useReducedMotion } from 'react-native-reanimated';
import { fonts, radius, useTheme } from './theme';

type BtnProps = { label: string; onPress?: () => void; kind?: 'primary' | 'secondary' | 'ghost'; icon?: keyof typeof Ionicons.glyphMap; disabled?: boolean; busy?: boolean; style?: ViewStyle; accessibilityLabel?: string };

export function Button({ label, onPress, kind = 'primary', icon, disabled, busy, style, accessibilityLabel }: BtnProps) {
  const t = useTheme();
  const primary = kind === 'primary';
  const fg = primary ? t.onAccent : t.ink;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ disabled: !!disabled }} disabled={disabled || busy} onPress={onPress}
      style={({ pressed }) => [{
        minHeight: 48, paddingHorizontal: 20, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        backgroundColor: primary ? t.rani : kind === 'secondary' ? 'transparent' : t.surface2,
        borderWidth: kind === 'secondary' ? 1.5 : 0, borderColor: t.ink, opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
      }, style]}>
      {busy ? <ActivityIndicator color={fg} /> : icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
      <Text maxFontSizeMultiplier={1.3} style={{ color: fg, fontFamily: fonts.bodyBold, fontSize: 15 }}>{label}</Text>
    </Pressable>
  );
}

export function IconButton({ icon, onPress, label, active, size = 44, tint }: { icon: keyof typeof Ionicons.glyphMap; onPress?: () => void; label: string; active?: boolean; size?: number; tint?: string }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: !!active }} onPress={onPress} hitSlop={6}
      style={({ pressed }) => ({ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? t.rani : t.surface2, opacity: pressed ? 0.8 : 1 })}>
      <Ionicons name={icon} size={size * 0.45} color={active ? t.onAccent : tint ?? t.ink} />
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, tint, style, accessibilityLabel }: { label: string; selected?: boolean; onPress?: () => void; tint?: string; style?: ViewStyle; accessibilityLabel?: string }) {
  const t = useTheme();
  const bg = selected ? (tint ?? t.rani) : t.surface2;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ selected: !!selected }} onPress={onPress}
      style={({ pressed }) => [{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: bg, borderWidth: tint && !selected ? 1.5 : 0, borderColor: tint, opacity: pressed ? 0.85 : 1 }, style]}>
      <Text maxFontSizeMultiplier={1.3} style={{ fontFamily: fonts.bodyBold, fontSize: 13, color: selected ? '#FFFFFF' : t.ink }}>{label}</Text>
    </Pressable>
  );
}

export function ChipRow({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[{ gap: 8, paddingHorizontal: 16 }, style]}>{children}</ScrollView>;
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange(v: T): void }) {
  const t = useTheme();
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: t.surface2, borderRadius: radius.pill, padding: 4 }}>
      {options.map(([k, l]) => (
        <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: value === k }} onPress={() => onChange(k)}
          style={{ flex: 1, minHeight: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: value === k ? t.surface : 'transparent' }}>
          <Text maxFontSizeMultiplier={1.3} style={{ fontFamily: fonts.bodyBold, fontSize: 13, color: value === k ? t.rani : t.muted }}>{l}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Heart that pops with a light haptic. */
export function HeartButton({ on, onToggle, label, size = 44, floating }: { on: boolean; onToggle(): void; label: string; size?: number; floating?: boolean }) {
  const t = useTheme();
  const reduce = useReducedMotion();
  const s = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: on }} hitSlop={6}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        if (!reduce) s.value = withSequence(withTiming(1.3, { duration: 110 }), withSpring(1));
        onToggle();
      }}
      style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: floating ? 'rgba(255,255,255,0.92)' : t.surface2 }}>
      <Animated.View style={style}><Ionicons name={on ? 'heart' : 'heart-outline'} size={size * 0.5} color={on ? t.rani : floating ? '#2A0F2E' : t.ink} /></Animated.View>
    </Pressable>
  );
}

export function Swatch({ hex, name, selected, onPress, size = 44 }: { hex: string; name: string; selected?: boolean; onPress(): void; size?: number }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={name} accessibilityState={{ selected: !!selected }}
      onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress(); }}
      style={{ width: size + 8, height: size + 8, borderRadius: (size + 8) / 2, borderWidth: 2.5, borderColor: selected ? t.rani : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: hex, borderWidth: 1, borderColor: t.line }} />
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label: string }) {
  const t = useTheme();
  const { label, style, ...rest } = props;
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: t.muted }}>{label}</Text>
      <TextInput placeholderTextColor={t.muted} accessibilityLabel={label} {...rest}
        style={[{ minHeight: 48, borderRadius: radius.input, backgroundColor: t.surface2, paddingHorizontal: 14, fontFamily: fonts.body, fontSize: 15, color: t.ink }, style]} />
    </View>
  );
}

export function StatPill({ n, label }: { n: number | string; label: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, backgroundColor: t.surface, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: t.line }}>
      <Text style={{ fontFamily: fonts.displayHeavy, fontSize: 18, color: t.rani }}>{n}</Text>
      <Text style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: t.ink }}>{label}</Text>
    </View>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: { label: string; onPress(): void } }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', padding: 32, gap: 12 }}>
      <Text style={{ fontFamily: fonts.display, fontSize: 22, color: t.ink, textAlign: 'center' }}>{title}</Text>
      {body ? <Text style={{ fontFamily: fonts.body, fontSize: 15, color: t.muted, textAlign: 'center' }}>{body}</Text> : null}
      {action ? <Button label={action.label} kind="secondary" onPress={action.onPress} /> : null}
    </View>
  );
}

export function Skeleton({ style }: { style?: ViewStyle }) {
  const t = useTheme();
  const o = useSharedValue(0.5);
  useEffect(() => { o.value = withTiming(1, { duration: 700 }); }, [o]);
  const a = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ backgroundColor: t.surface2, borderRadius: radius.card }, style, a]} />;
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const t = useTheme();
  return <View style={[{ backgroundColor: t.surface, borderRadius: radius.card, padding: 16, borderWidth: 1, borderColor: t.line, gap: 8 }, style]}>{children}</View>;
}
