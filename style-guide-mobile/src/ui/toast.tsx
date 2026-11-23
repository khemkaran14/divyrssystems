import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';
import { fonts, useTheme } from './theme';

type ToastState = { msg: string | null; id: number; show(msg: string): void; hide(): void };
export const useToast = create<ToastState>(set => ({
  msg: null, id: 0,
  show: msg => set(s => ({ msg, id: s.id + 1 })),
  hide: () => set({ msg: null }),
}));
export const toast = (msg: string) => useToast.getState().show(msg);

export function ToastHost() {
  const { msg, id, hide } = useToast();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (!msg) return;
    const h = setTimeout(hide, 2000);
    return () => clearTimeout(h);
  }, [msg, id, hide]);
  if (!msg) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 72, alignItems: 'center' }}>
      <Animated.View key={id} entering={FadeInDown.duration(160)} exiting={FadeOutDown.duration(160)} accessibilityLiveRegion="polite"
        style={{ backgroundColor: t.ink, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 999, maxWidth: 520 }}>
        <Text style={{ color: t.bg, fontFamily: fonts.bodySemi, fontSize: 14, textAlign: 'center' }}>{msg}</Text>
      </Animated.View>
    </View>
  );
}
