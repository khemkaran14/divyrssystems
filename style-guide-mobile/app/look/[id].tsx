import * as Clipboard from 'expo-clipboard';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { Asset } from 'expo-asset';
import { FlatList, Share, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSite } from '../../src/api/hooks';
import { LOOK_IMAGES } from '../../src/content/images';
import lookPrompts from '../../src/content/look-prompts.json';
import { CATEGORY_NAME, OCC_BY_ID, visibleLooks, lookById } from '../../src/engine/browse';
import { openInDressingRoom } from '../../src/nav';
import { Body, Button, Card, Chip, EmptyState, Eyebrow, HeartButton, IconButton, LookPhoto, MiniLook, PaletteDots, Screen, Section, Small, Strong, Title, categoryTint, toast, useHeart, useTheme, radius } from '../../src/ui';

export default function LookDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const look = lookById(String(id));
  const site = useSite();
  if (!look || !LOOK_IMAGES[look.photo] || site.hidden.includes(look.id)) return <Screen edges={[]}><EmptyState title="This look isn’t available." action={{ label: 'Back', onPress: () => router.back() }} /></Screen>;
  return <Detail id={look.id} />;
}

function ZoomPhoto({ id }: { id: string }) {
  const look = lookById(id)!;
  const { width } = useWindowDimensions();
  const scale = useSharedValue(1), saved = useSharedValue(1), tx = useSharedValue(0), ty = useSharedValue(0), sx = useSharedValue(0), sy = useSharedValue(0);
  const pinch = Gesture.Pinch().onUpdate(e => { scale.value = Math.max(1, Math.min(4, saved.value * e.scale)); }).onEnd(() => { saved.value = scale.value; if (scale.value <= 1.01) { tx.value = withTiming(0); ty.value = withTiming(0); sx.value = 0; sy.value = 0; } });
  const pan = Gesture.Pan().minPointers(1).averageTouches(true).onUpdate(e => { if (scale.value > 1) { tx.value = sx.value + e.translationX; ty.value = sy.value + e.translationY; } }).onEnd(() => { sx.value = tx.value; sy.value = ty.value; });
  const dbl = Gesture.Tap().numberOfTaps(2).onEnd(() => { const z = scale.value > 1 ? 1 : 2.2; scale.value = withTiming(z); saved.value = z; if (z === 1) { tx.value = withTiming(0); ty.value = withTiming(0); sx.value = 0; sy.value = 0; } });
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }] }));
  const h = Math.min(width * 1.25, 640);
  return (
    <View style={{ height: h, marginHorizontal: 16, borderRadius: radius.photo, overflow: 'hidden' }}>
      <GestureDetector gesture={Gesture.Simultaneous(pinch, pan, dbl)}>
        <Animated.View style={[{ flex: 1 }, style]}><LookPhoto look={look} rounded={0} style={{ flex: 1 }} /></Animated.View>
      </GestureDetector>
    </View>
  );
}

function Detail({ id }: { id: string }) {
  const t = useTheme();
  const site = useSite();
  const look = lookById(id)!;
  const heart = useHeart(look);
  const prompt = (lookPrompts as Record<string, string>)[look.id];
  const more = visibleLooks(site).filter(l => l.id !== look.id && l.occasions.some(o => look.occasions.includes(o))).slice(0, 10);

  async function share() {
    try {
      const a = Asset.fromModule(LOOK_IMAGES[look.photo]);
      if (!a.localUri) await a.downloadAsync();
      if (a.localUri && (await Sharing.isAvailableAsync())) await Sharing.shareAsync(a.localUri, { dialogTitle: look.name, mimeType: 'image/webp' });
      else await Share.share({ message: `${look.name} — The Ultimate Style Guide` });
    } catch { toast('Could not share this look'); }
  }

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: look.name }} />
      <ZoomPhoto id={look.id} />
      <View style={{ padding: 16, gap: 10 }}>
        <Title>{look.name}</Title>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Chip label={CATEGORY_NAME[look.category]} selected tint={categoryTint(t, look.category)} onPress={() => router.push({ pathname: '/lookbook' })} />
          <Chip label={look.region} />
          {look.occasions.map(o => <Chip key={o} label={OCC_BY_ID[o]?.name ?? o} tint={OCC_BY_ID[o]?.colour} onPress={() => router.push(`/occasion/${o}`)} />)}
        </View>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <HeartButton on={heart.on} onToggle={heart.toggle} label={`Save ${look.name}`} />
          <Button label="Style it in the Dressing Room" icon="color-palette" onPress={() => openInDressingRoom(look.id)} style={{ flex: 1 }} />
          <IconButton icon="share-outline" label="Share this look" onPress={share} />
        </View>
        <Body>{look.description}</Body>
        <Card>
          <Eyebrow>What to wear</Eyebrow>
          {look.pieces.map(p => <Body key={p}>• {p}</Body>)}
          <Eyebrow style={{ marginTop: 6 }}>Footwear</Eyebrow>
          <Body>{look.footwear}</Body>
          <Eyebrow style={{ marginTop: 6 }}>Accessories</Eyebrow>
          <Body>{look.accessories}</Body>
          <Eyebrow style={{ marginTop: 6 }}>Colour story</Eyebrow>
          <Body>{look.colourName}</Body>
          <PaletteDots colours={look.palette} size={22} />
        </Card>
        <View style={{ backgroundColor: t.surface2, borderRadius: radius.card, padding: 16, gap: 4 }}>
          <Strong color={t.rani}>Stylist’s tip</Strong>
          <Body>{look.tip}</Body>
        </View>
        {prompt ? (
          <Card>
            <Eyebrow>Prompt used for this photo</Eyebrow>
            <Small selectable>{prompt}</Small>
            <Button kind="ghost" label="Copy prompt" icon="copy-outline" onPress={async () => { await Clipboard.setStringAsync(prompt); toast('Prompt copied'); }} style={{ alignSelf: 'flex-start' }} />
          </Card>
        ) : null}
      </View>
      {more.length ? (
        <View style={{ gap: 10 }}>
          <Section style={{ paddingHorizontal: 16 }}>More for this occasion</Section>
          <FlatList horizontal data={more} keyExtractor={l => l.id} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 16 }} renderItem={({ item }) => <MiniLook look={item} onPress={() => router.push(`/look/${item.id}`)} />} />
        </View>
      ) : null}
    </Screen>
  );
}

