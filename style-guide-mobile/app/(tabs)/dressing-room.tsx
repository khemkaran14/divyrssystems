import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, Text, View, useWindowDimensions } from 'react-native';
import ColorPicker, { HueSlider, Panel1 } from 'reanimated-color-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { track } from '../../src/analytics';
import { useSite } from '../../src/api/hooks';
import { BASE_IMAGE, PIECE_IMAGES } from '../../src/content/images';
import packCats from '../../src/content/pack-cats.json';
import piecesJson from '../../src/content/pieces.json';
import type { SwapCategory, TryOnPiece } from '../../src/content/types';
import { FineSlider } from '../../src/dressing/FineSlider';
import { PhotoCanvas } from '../../src/dressing/PhotoCanvas';
import { saveImageToPhotos, shareImage } from '../../src/dressing/share';
import { BODY_TYPES } from '../../src/engine/bodyType';
import { visibleLooks } from '../../src/engine/browse';
import { colourName, hexEq, PAL } from '../../src/engine/colour';
import { ORIGINAL, PARTS } from '../../src/engine/layers';
import { partName, regionName, segLabel } from '../../src/engine/regions';
import type { BodyType, Part } from '../../src/engine/types';
import { useAccount } from '../../src/store/account';
import { colourTarget, currentColour, MODEL, useDressingRoom } from '../../src/store/dressingRoom';
import { useLooks } from '../../src/store/looks';
import { Button, Chip, ChipRow, IconButton, LookPhoto, Segmented, Small, Swatch, fonts, radius, toast, useTheme } from '../../src/ui';

const PIECES = piecesJson as TryOnPiece[];
type Tab = 'colour' | 'swap' | 'body' | 'prompt';

export default function DressingRoom() {
  const t = useTheme();
  const site = useSite();
  const dr = useDressingRoom();
  const profileBt = useAccount(s => s.profile?.bt);
  const member = useAccount(s => !!s.user);
  const [tab, setTab] = useState<Tab>('colour');
  const { height } = useWindowDimensions();
  const isModel = dr.who === MODEL;

  useEffect(() => {
    const st = useDressingRoom.getState();
    if (!st.ready && !st.busy) {
      if (profileBt && BODY_TYPES.some(b => b[0] === profileBt)) useDressingRoom.setState({ bt: profileBt as BodyType });
      st.pickSubject(st.who);
    }
  }, [profileBt]);
  useEffect(() => { if (!isModel && tab === 'swap') setTab('colour'); }, [isModel, tab]);
  useEffect(() => { if (dr.error) toast(dr.error); }, [dr.error]);

  const subjects = useMemo(() => visibleLooks(site).filter(l => l.id !== 'ivorytee'), [site]);
  const hint = isModel ? 'Tap the t-shirt, trousers or shoes' : 'Tap a garment to select it';

  const onTap = async (x: number, y: number) => { const m = await dr.tap(x, y); if (m) toast(m); };
  const colour = (hex: string) => { const m = dr.applyColour(hex); if (m) toast(m); };

  async function save() {
    const lk = dr.snapshot();
    if (!lk) return;
    try {
      await useLooks.getState().add(lk, member);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      track('look_saved', { who: lk.who });
      toast('Look saved');
    } catch (e) { toast((e as Error).message); }
  }
  async function share() {
    if (!dr.frame) return;
    Alert.alert('Your styled photo', undefined, [
      { text: 'Share…', onPress: () => shareImage(dr.frame!).catch(e => toast(e.message)) },
      { text: 'Save to Photos', onPress: () => saveImageToPhotos(dr.frame!).then(() => toast('Saved to Photos')).catch(e => toast(e.message)) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ height: height * 0.52, paddingHorizontal: 12, paddingTop: 4 }}>
        <PhotoCanvas frame={dr.frame} frameId={dr.frameId} imgW={dr.w} imgH={dr.h} dark={isModel} busy={dr.busy} hint={hint}
          label={isModel ? 'The model photo' : `Photo of ${subjects.find(s => s.id === dr.who)?.name ?? 'the look'}`} onTap={onTap} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12, paddingVertical: 8 }}>
        <IconButton icon="arrow-undo" label="Undo" onPress={() => { const m = dr.undo(); if (m) toast(m); }} />
        <IconButton icon="refresh" label="Reset" onPress={() => dr.reset()} />
        <IconButton icon="heart" label="Save look" tint={t.rani} onPress={save} />
        <IconButton icon="share-outline" label="Share" onPress={share} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 12, paddingBottom: 8 }} style={{ flexGrow: 0 }}>
        <SubjectTile label="The model" selected={isModel} onPress={() => dr.pickSubject(MODEL)}>
          <Image source={BASE_IMAGE} contentFit="cover" contentPosition="top" style={{ width: '100%', height: '100%' }} accessibilityLabel="The model" />
        </SubjectTile>
        {subjects.map(l => (
          <SubjectTile key={l.id} label={l.name} selected={dr.who === l.id} onPress={() => dr.pickSubject(l.id)}>
            <LookPhoto look={l} rounded={0} style={{ width: '100%', height: '100%' }} />
          </SubjectTile>
        ))}
      </ScrollView>
      <View style={{ flex: 1, backgroundColor: t.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, borderWidth: 1, borderColor: t.line }}>
        <View style={{ paddingHorizontal: 12 }}>
          <Segmented<Tab> value={tab} onChange={setTab}
            options={isModel ? [['colour', 'Colour'], ['swap', 'Swap pieces'], ['body', 'Body type'], ['prompt', 'Prompt']] : [['colour', 'Colour'], ['body', 'Body type'], ['prompt', 'Prompt']]} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 12, gap: 12, paddingBottom: 32 }}>
          {tab === 'colour' ? <ColourTab onColour={colour} /> : null}
          {tab === 'swap' && isModel ? <SwapTab /> : null}
          {tab === 'body' ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {BODY_TYPES.map(([k, n]) => <Chip key={k} label={n} selected={dr.bt === k} onPress={() => dr.setBodyType(k)} />)}
              <Small style={{ width: '100%' }}>Body type reshapes the finished photo. The face stays the same.</Small>
            </View>
          ) : null}
          {tab === 'prompt' ? <PromptTab /> : null}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

function SubjectTile({ label, selected, onPress, children }: { label: string; selected: boolean; onPress(): void; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }} onPress={onPress}
      style={{ width: 54, height: 72, borderRadius: 14, overflow: 'hidden', borderWidth: 2.5, borderColor: selected ? t.rani : 'transparent', backgroundColor: '#000' }}>
      {children}
    </Pressable>
  );
}

function ColourTab({ onColour }: { onColour(hex: string): void }) {
  const t = useTheme();
  const dr = useDressingRoom();
  const isModel = dr.who === MODEL;
  const cur = currentColour(dr);
  const [custom, setCustom] = useState(false);
  const segs = [...new Set(dr.regions.filter(r => r.pid).map(r => r.seg!))].filter(s => dr.regions.filter(r => r.seg === s).length > 1);
  return (
    <View style={{ gap: 12 }}>
      <ChipRow style={{ paddingHorizontal: 0 }}>
        {isModel
          ? PARTS.map(([k]) => <Chip key={k} label={`${partName(k, dr.variant)}${dr.parts[k] ? ` · ${colourName(dr.parts[k]!)}` : ''}`} selected={dr.sel === k} onPress={() => dr.selectPart(k as Part)} />)
          : (
            <>
              {segs.map(s => <Chip key={`g${s}`} label={`Entire ${segLabel(dr.who, s).toLowerCase()}`} selected={dr.sel === `g:${s}`} onPress={() => dr.selectGroup(s)} />)}
              {dr.regions.map((r, i) => <Chip key={i} label={`${regionName(dr.who, dr.regions, r)}${r.col ? ` → ${colourName(r.col)}` : ''}`} selected={dr.sel === i} onPress={() => dr.selectRegion(i)} />)}
              {!dr.regions.length ? <Small>Tap the garment on the photo.</Small> : null}
            </>
          )}
      </ChipRow>
      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: t.ink }}>{colourTarget(dr)}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 2 }}>
        {PAL.map(p => <Swatch key={p.hex} hex={p.hex} name={p.name} selected={hexEq(p.hex, cur)} onPress={() => onColour(p.hex)} size={36} />)}
        <Pressable accessibilityRole="button" accessibilityLabel="Pick any colour" onPress={() => setCustom(c => !c)}
          style={{ width: 44, height: 44, borderRadius: 22, margin: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: t.surface2 }}>
          <Ionicons name="color-filter-outline" size={20} color={t.ink} />
        </Pressable>
      </View>
      {custom ? (
        <ColorPicker value={cur || '#1F2A55'} onCompleteJS={c => onColour(c.hex.slice(0, 7))} style={{ gap: 12 }}>
          <Panel1 style={{ height: 140, borderRadius: radius.input }} />
          <HueSlider style={{ borderRadius: radius.input }} />
        </ColorPicker>
      ) : null}
      {!isModel ? <FineSlider value={dr.tol} onChange={dr.setTol} /> : null}
    </View>
  );
}

function SwapTab() {
  const t = useTheme();
  const dr = useDressingRoom();
  const cat = dr.swapCat;
  const items = PIECES.filter(p => p.category === cat && PIECE_IMAGES[p.id]);
  const base = ['top', 'bottom', 'shoes'].includes(cat);
  const firstName = base ? `Original ${ORIGINAL[cat as Part]}` : 'None';
  const { width } = useWindowDimensions();
  const tileW = (width - 24 - 16) / 3;
  return (
    <View style={{ gap: 12 }}>
      <ChipRow style={{ paddingHorizontal: 0 }}>
        {(packCats as { id: SwapCategory; label: string }[]).map(c => <Chip key={c.id} label={c.label} selected={cat === c.id} onPress={() => dr.setSwapCat(c.id)} />)}
      </ChipRow>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <SwapTile width={tileW} name={firstName} selected={!dr.variant[cat]} onPress={() => { Haptics.selectionAsync().catch(() => {}); dr.swap(''); }}>
          <Text style={{ fontFamily: fonts.bodyBold, color: t.muted }}>{base ? 'Original' : 'None'}</Text>
        </SwapTile>
        {items.map(p => (
          <SwapTile key={p.id} width={tileW} name={p.name} selected={dr.variant[cat] === p.id} onPress={() => { Haptics.selectionAsync().catch(() => {}); dr.swap(p.id); }}>
            <Image source={PIECE_IMAGES[p.id].img} contentFit="cover" style={{ width: '100%', height: '100%' }} accessibilityLabel={p.name} />
          </SwapTile>
        ))}
      </View>
    </View>
  );
}

function SwapTile({ width, name, selected, onPress, children }: { width: number; name: string; selected: boolean; onPress(): void; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={name} accessibilityState={{ selected }} onPress={onPress}
      style={{ width, borderRadius: 14, borderWidth: 2.5, borderColor: selected ? t.rani : t.line, backgroundColor: t.surface2, overflow: 'hidden' }}>
      <View style={{ height: width, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' }}>{children}</View>
      <Text numberOfLines={2} style={{ padding: 6, fontFamily: fonts.bodySemi, fontSize: 12, color: t.ink }}>{name}</Text>
    </Pressable>
  );
}

function PromptTab() {
  const t = useTheme();
  const prompt = useDressingRoom(s => s.prompt);
  return (
    <View style={{ gap: 10 }}>
      <Text style={{ fontFamily: fonts.monoMedium, fontSize: 11, letterSpacing: 1.3, color: t.muted }}>MAKE IT A REAL PHOTO</Text>
      <Small>Attach the photo to Gemini or ChatGPT with this prompt to make a real photo of exactly what’s on screen.</Small>
      <View style={{ backgroundColor: t.surface2, borderRadius: radius.input, padding: 12 }}>
        <Text selectable style={{ fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: t.ink }}>{prompt}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button label="Copy" icon="copy-outline" onPress={async () => { await Clipboard.setStringAsync(prompt); track('prompt_copied'); toast('Prompt copied'); }} style={{ flex: 1 }} />
        <Button label="Share" kind="secondary" icon="share-outline" onPress={() => Share.share({ message: prompt })} style={{ flex: 1 }} />
      </View>
    </View>
  );
}
