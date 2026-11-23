import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Dimensions, FlatList, Pressable, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import Animated, { interpolate, useAnimatedScrollHandler, useAnimatedStyle, useReducedMotion, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { useSite } from '../../src/api/hooks';
import piecesJson from '../../src/content/pieces.json';
import { CATEGORY_NAME, forYou, heroLooks, OCCASIONS, visibleLooks } from '../../src/engine/browse';
import type { Look } from '../../src/content/types';
import { useAccount } from '../../src/store/account';
import { openInDressingRoom } from '../../src/nav';
import { useSaved } from '../../src/store/saved';
import { Accent, AnnouncementBanner, Body, Button, Chip, ChipRow, Eyebrow, LookPhoto, MiniLook, Screen, Section, StatPill, Title, categoryTint, fonts, radius, useTheme } from '../../src/ui';

const W = Dimensions.get('window').width;
const CARD_W = W - 48;

function HeroCard({ look, index, x }: { look: Look; index: number; x: SharedValue<number> }) {
  const t = useTheme();
  const reduce = useReducedMotion();
  const photo = useAnimatedStyle(() => reduce ? {} : ({ transform: [{ translateX: interpolate(x.value, [(index - 1) * (CARD_W + 12), index * (CARD_W + 12), (index + 1) * (CARD_W + 12)], [-40, 0, 40]) }, { scale: 1.15 }] }));
  return (
    <View style={{ width: CARD_W, height: CARD_W * 1.25, borderRadius: radius.photo, overflow: 'hidden', backgroundColor: '#000' }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Open ${look.name}`} onPress={() => router.push(`/look/${look.id}`)} style={{ flex: 1 }}>
        <Animated.View style={[{ flex: 1 }, photo]}><LookPhoto look={look} rounded={0} style={{ flex: 1 }} /></Animated.View>
      </Pressable>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, gap: 8, backgroundColor: 'rgba(23,11,26,0.62)' }}>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <View style={{ backgroundColor: categoryTint(t, look.category), borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
            <Text style={{ color: '#fff', fontFamily: fonts.bodyBold, fontSize: 12 }}>{CATEGORY_NAME[look.category]}</Text>
          </View>
        </View>
        <Text style={{ color: '#fff', fontFamily: fonts.display, fontSize: 26 }}>{look.name}</Text>
        <Button label="Style it" icon="color-palette" onPress={() => openInDressingRoom(look.id)} style={{ alignSelf: 'flex-start' }} />
      </View>
    </View>
  );
}

export default function Discover() {
  const t = useTheme();
  const site = useSite();
  const profile = useAccount(s => s.profile);
  const saved = useSaved(s => s.ids);
  const hero = useMemo(() => heroLooks(site), [site]);
  const picks = useMemo(() => forYou(profile, saved, site), [profile, saved, site]);
  const x = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler(e => { x.value = e.contentOffset.x; });
  const [page, setPage] = useState(0);
  const list = useRef<FlatList<Look>>(null);
  const looksN = visibleLooks(site).length;

  return (
    <Screen>
      <AnnouncementBanner site={site} />
      <View style={{ paddingHorizontal: 16, paddingTop: 16, gap: 6 }}>
        <Eyebrow>01 · The Ultimate Style Guide</Eyebrow>
        <Title>Style it <Accent>on the photo</Accent></Title>
        <Body color={t.muted}>Indian, fusion and western looks for every occasion, on real photos.</Body>
      </View>
      <Animated.FlatList
        ref={list as never}
        data={hero}
        horizontal
        keyExtractor={l => l.id}
        snapToInterval={CARD_W + 12}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 24, gap: 12, paddingVertical: 16 }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(e: NativeSyntheticEvent<NativeScrollEvent>) => setPage(Math.round(e.nativeEvent.contentOffset.x / (CARD_W + 12)))}
        renderItem={({ item, index }) => <HeroCard look={item} index={index} x={x} />}
      />
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }} accessibilityLabel={`Featured look ${page + 1} of ${hero.length}`}>
        {hero.map((l, i) => <View key={l.id} style={{ width: i === page ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: i === page ? t.rani : t.line }} />)}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingTop: 16 }}>
        <StatPill n={looksN} label="looks" />
        <StatPill n={OCCASIONS.length} label="occasions" />
        <StatPill n={piecesJson.length} label="pieces to try on" />
      </View>

      {picks.length ? (
        <View style={{ paddingTop: 24, gap: 10 }}>
          <View style={{ paddingHorizontal: 16 }}><Eyebrow>Picked for you</Eyebrow><Section>Based on your style profile</Section></View>
          <FlatList horizontal data={picks} keyExtractor={l => l.id} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 16 }} renderItem={({ item }) => <MiniLook look={item} />} />
        </View>
      ) : null}

      <View style={{ paddingTop: 24, gap: 10 }}>
        <View style={{ paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <View><Eyebrow>02 · Occasions</Eyebrow><Section>Shop by occasion</Section></View>
          <Pressable accessibilityRole="link" onPress={() => router.push('/occasions')} style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text style={{ fontFamily: fonts.bodyBold, color: t.rani }}>See all</Text>
          </Pressable>
        </View>
        <ChipRow>{OCCASIONS.map(o => <Chip key={o.id} label={o.name} tint={o.colour} onPress={() => router.push(`/occasion/${o.id}`)} />)}</ChipRow>
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        <Eyebrow>03 · Find your look</Eyebrow>
        <Shortcut title="Take the style quiz" body="Three questions, four looks picked for you." colour={t.rani} onPress={() => router.push('/quiz')} />
        <Shortcut title="Colour combos" body="Twelve pairings that work, seen on real looks." colour={t.peacock} onPress={() => router.push('/colours')} />
        <Shortcut title="Style rules" body="Six rules stylists swear by." colour={t.indigo} onPress={() => router.push('/rules')} />
      </View>
    </Screen>
  );
}

function Shortcut({ title, body, colour, onPress }: { title: string; body: string; colour: string; onPress(): void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => ({ backgroundColor: colour, borderRadius: radius.card, padding: 18, gap: 4, opacity: pressed ? 0.9 : 1 })}>
      <Text style={{ fontFamily: fonts.display, fontSize: 22, color: '#fff' }}>{title}</Text>
      <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 14, color: 'rgba(255,255,255,0.92)' }}>{body}</Text>
    </Pressable>
  );
}
