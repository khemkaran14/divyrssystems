import { useState } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { fonts, useTheme } from '../ui/theme';

/** Simple accessible slider for the flood-fill "selection size" (15–70). */
export function FineSlider({ value, min = 15, max = 70, onChange }: { value: number; min?: number; max?: number; onChange(v: number): void }) {
  const t = useTheme();
  const [w, setW] = useState(1);
  const pos = ((value - min) / (max - min)) * w;
  const set = (x: number) => onChange(Math.round(min + Math.max(0, Math.min(1, x / w)) * (max - min)));
  const g = Gesture.Pan().minDistance(0).onBegin(e => runOnJS(set)(e.x)).onUpdate(e => runOnJS(set)(e.x));
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: t.muted }}>Fine selection size</Text>
        <Text style={{ fontFamily: fonts.mono, fontSize: 13, color: t.ink }}>{value}</Text>
      </View>
      <GestureDetector gesture={g}>
        <View onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)} style={{ height: 44, justifyContent: 'center' }}
          accessible accessibilityRole="adjustable" accessibilityLabel="Fine selection size" accessibilityValue={{ min, max, now: value }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={e => onChange(Math.max(min, Math.min(max, value + (e.nativeEvent.actionName === 'increment' ? 5 : -5))))}>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: t.surface2 }}>
            <View style={{ width: pos, height: 6, borderRadius: 3, backgroundColor: t.rani }} />
          </View>
          <View style={{ position: 'absolute', left: pos - 12, width: 24, height: 24, borderRadius: 12, backgroundColor: t.rani, borderWidth: 3, borderColor: t.surface }} />
        </View>
      </GestureDetector>
    </View>
  );
}
