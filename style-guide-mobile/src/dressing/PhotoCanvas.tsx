import { Canvas, Group, Image as SkiaImage, type SkImage } from '@shopify/react-native-skia';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming, runOnJS } from 'react-native-reanimated';
import { fonts } from '../ui/theme';

type Props = {
  frame: SkImage | null;
  frameId: number;
  imgW: number;
  imgH: number;
  dark: boolean;
  busy: boolean;
  hint: string;
  label: string;
  /** called with image pixel coordinates */
  onTap(x: number, y: number): void;
};

/** The photo with pinch-zoom, pan and tap-to-select. Each new frame cross-fades in over 150 ms. */
export function PhotoCanvas({ frame, frameId, imgW, imgH, dark, busy, hint, label, onTap }: Props) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const reduce = useReducedMotion();
  const [prev, setPrev] = useState<SkImage | null>(null);
  const last = useRef<SkImage | null>(null);
  const fade = useSharedValue(1);

  useEffect(() => {
    if (!frame) return;
    setPrev(last.current);
    last.current = frame;
    if (reduce) { fade.value = 1; return; }
    fade.value = 0;
    fade.value = withTiming(1, { duration: 150 });
  }, [frameId]); // eslint-disable-line react-hooks/exhaustive-deps

  // zoom & pan
  const scale = useSharedValue(1), base = useSharedValue(1), tx = useSharedValue(0), ty = useSharedValue(0), sx = useSharedValue(0), sy = useSharedValue(0);
  const W = useSharedValue(0), H = useSharedValue(0);
  const pinch = Gesture.Pinch()
    .onUpdate(e => { scale.value = Math.max(1, Math.min(5, base.value * e.scale)); })
    .onEnd(() => { base.value = scale.value; if (scale.value <= 1.01) { tx.value = withTiming(0); ty.value = withTiming(0); sx.value = 0; sy.value = 0; } });
  const pan = Gesture.Pan().minDistance(8)
    .onUpdate(e => { if (scale.value > 1) { tx.value = sx.value + e.translationX; ty.value = sy.value + e.translationY; } })
    .onEnd(() => { sx.value = tx.value; sy.value = ty.value; });
  const tap = Gesture.Tap().maxDuration(400).onEnd((e, ok) => {
    if (!ok) return;
    // undo the zoom transform (origin = centre), then the contain fit
    const lx = (e.x - W.value / 2 - tx.value) / scale.value + W.value / 2;
    const ly = (e.y - H.value / 2 - ty.value) / scale.value + H.value / 2;
    const fit = Math.min(W.value / imgW, H.value / imgH);
    const ox = (W.value - imgW * fit) / 2, oy = (H.value - imgH * fit) / 2;
    runOnJS(onTap)((lx - ox) / fit, (ly - oy) / fit);
  });
  const zoomStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }] }));

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    W.value = width; H.value = height;
    setSize({ w: width, h: height });
  };

  return (
    <View onLayout={onLayout} style={{ flex: 1, backgroundColor: dark ? '#000' : 'transparent', overflow: 'hidden', borderRadius: 24 }}>
      <GestureDetector gesture={Gesture.Simultaneous(pinch, pan, tap)}>
        <Animated.View style={[{ flex: 1 }, zoomStyle]} accessible accessibilityRole="image" accessibilityLabel={label} accessibilityHint={hint}>
          {size.w > 0 ? (
            <Canvas style={{ width: size.w, height: size.h }}>
              {prev ? <SkiaImage image={prev} fit="contain" x={0} y={0} width={size.w} height={size.h} /> : null}
              {frame ? (
                <Group opacity={fade}>
                  <SkiaImage image={frame} fit="contain" x={0} y={0} width={size.w} height={size.h} />
                </Group>
              ) : null}
            </Canvas>
          ) : null}
        </Animated.View>
      </GestureDetector>
      <View pointerEvents="none" style={{ position: 'absolute', top: 12, left: 0, right: 0, alignItems: 'center' }}>
        <View style={{ backgroundColor: 'rgba(23,11,26,0.72)', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999 }}>
          <Text style={{ color: '#fff', fontFamily: fonts.bodySemi, fontSize: 13 }}>{hint}</Text>
        </View>
      </View>
      {busy || !frame ? <View pointerEvents="none" style={{ position: 'absolute', right: 14, bottom: 14 }}><ActivityIndicator color={dark ? '#fff' : '#D6246E'} /></View> : null}
    </View>
  );
}
