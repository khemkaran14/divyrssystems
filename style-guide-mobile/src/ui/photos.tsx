import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, Text, View, type ViewStyle } from 'react-native';
import { LOOK_IMAGES } from '../content/images';
import type { Look } from '../content/types';
import { CATEGORY_NAME } from '../engine/browse';
import { useSaved } from '../store/saved';
import { HeartButton } from './controls';
import { categoryTint, fonts, radius, useTheme } from './theme';
import { toast } from './toast';

/** A look's real photo. Looks without a photo are never shown (no placeholders). */
export function LookPhoto({ look, style, rounded = radius.photo }: { look: Look; style?: ViewStyle; rounded?: number }) {
  const t = useTheme();
  const src = LOOK_IMAGES[look.photo];
  if (!src) return null;
  return (
    <View style={[{ borderRadius: rounded, overflow: 'hidden', backgroundColor: look.photoFit === 'contain' ? t.surface2 : '#000' }, style]}>
      <Image source={src} accessibilityLabel={look.name} contentFit={look.photoFit === 'contain' ? 'contain' : 'cover'} contentPosition="top"
        transition={150} style={{ width: '100%', height: '100%' }} />
    </View>
  );
}

export function useHeart(look: Look) {
  const on = useSaved(s => s.ids.includes(look.id));
  const toggle = () => toast(useSaved.getState().toggle(look.id) ? 'Saved to your looks' : 'Removed from saved');
  return { on, toggle };
}

/** Grid card: photo (3:4), name, category and region, palette dots and a heart. */
export function PhotoCard({ look, width }: { look: Look; width: number }) {
  const t = useTheme();
  const heart = useHeart(look);
  if (!LOOK_IMAGES[look.photo]) return null;
  return (
    <View style={{ width, backgroundColor: t.surface, borderRadius: radius.card, overflow: 'hidden', borderWidth: 1, borderColor: t.line }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Open ${look.name}`} onPress={() => router.push(`/look/${look.id}`)}>
        <LookPhoto look={look} rounded={0} style={{ width, height: (width * 4) / 3 }} />
      </Pressable>
      <View style={{ position: 'absolute', top: 8, right: 8 }}>
        <HeartButton on={heart.on} onToggle={heart.toggle} label={`Save ${look.name}`} size={40} floating />
      </View>
      <View style={{ padding: 10, gap: 4, backgroundColor: t.surface }}>
        <Text numberOfLines={2} maxFontSizeMultiplier={1.3} style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: t.ink }}>{look.name}</Text>
        <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={{ fontFamily: fonts.bodySemi, fontSize: 12, color: categoryTint(t, look.category) }}>
          {CATEGORY_NAME[look.category]} · <Text style={{ color: t.muted }}>{look.region}</Text>
        </Text>
        <PaletteDots colours={look.palette} />
      </View>
    </View>
  );
}

export function PaletteDots({ colours, size = 12 }: { colours: string[]; size?: number }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 5 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {colours.slice(0, 3).map((c, i) => <View key={i} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c, borderWidth: 1, borderColor: t.line }} />)}
    </View>
  );
}

/** Small photo tile with a caption, for rails. */
export function MiniLook({ look, width = 120, onPress }: { look: Look; width?: number; onPress?: () => void }) {
  const t = useTheme();
  if (!LOOK_IMAGES[look.photo]) return null;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Open ${look.name}`} onPress={onPress ?? (() => router.push(`/look/${look.id}`))} style={{ width, gap: 6 }}>
      <LookPhoto look={look} rounded={radius.card} style={{ width, height: (width * 4) / 3 }} />
      <Text numberOfLines={2} maxFontSizeMultiplier={1.3} style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: t.ink }}>{look.name}</Text>
    </Pressable>
  );
}
