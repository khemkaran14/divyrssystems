import { useMemo, useState } from 'react';
import { FlatList, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSite } from '../../src/api/hooks';
import { CATEGORY_NAME, matchLook, NO_FILTERS, OCCASIONS, REGIONS, type Filters } from '../../src/engine/browse';
import { LOOKS } from '../../src/engine/browse';
import { useSaved } from '../../src/store/saved';
import { Chip, ChipRow, EmptyState, Eyebrow, PhotoCard, Small, Title, fonts, radius, useTheme } from '../../src/ui';

export default function Lookbook() {
  const t = useTheme();
  const site = useSite();
  const saved = useSaved(s => s.ids);
  const [F, setF] = useState<Filters>(NO_FILTERS);
  const { width } = useWindowDimensions();
  const cols = width > 700 ? 3 : 2;
  const cardW = (width - 32 - 12 * (cols - 1)) / cols;
  const data = useMemo(() => LOOKS.filter(l => matchLook(l, F, site, saved)), [F, site, saved]);
  const set = (p: Partial<Filters>) => setF(f => ({ ...f, ...p }));

  const header = (
    <View style={{ gap: 10, paddingBottom: 12, backgroundColor: t.bg }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
        <Eyebrow>Lookbook</Eyebrow>
        <Title>Every look</Title>
      </View>
      <View style={{ paddingHorizontal: 16 }}>
        <TextInput value={F.q} onChangeText={q => set({ q })} placeholder="Search silk, wedding, navy…" placeholderTextColor={t.muted} accessibilityLabel="Search looks"
          returnKeyType="search" clearButtonMode="while-editing"
          style={{ minHeight: 48, borderRadius: radius.input, backgroundColor: t.surface2, paddingHorizontal: 14, fontFamily: fonts.body, fontSize: 15, color: t.ink }} />
      </View>
      <ChipRow>
        {(['all', 'ethnic', 'fusion', 'western'] as const).map(c => <Chip key={c} label={c === 'all' ? 'All' : CATEGORY_NAME[c]} selected={F.cat === c} onPress={() => set({ cat: c })} />)}
        <Chip label="Saved only" selected={F.saved} onPress={() => set({ saved: !F.saved })} />
      </ChipRow>
      <ChipRow>
        {['all', ...REGIONS].map(r => <Chip key={r} label={r === 'all' ? 'All regions' : r} selected={F.reg === r} onPress={() => set({ reg: r })} />)}
      </ChipRow>
      <ChipRow>
        <Chip label="Any occasion" selected={F.occ === 'all'} onPress={() => set({ occ: 'all' })} />
        {OCCASIONS.map(o => <Chip key={o.id} label={o.name} tint={o.colour} selected={F.occ === o.id} onPress={() => set({ occ: F.occ === o.id ? 'all' : o.id })} />)}
      </ChipRow>
      <Small style={{ paddingHorizontal: 16 }}>{data.length} looks</Small>
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.bg }}>
      <FlatList
        data={data}
        key={cols}
        numColumns={cols}
        keyExtractor={l => l.id}
        ListHeaderComponent={header}
        stickyHeaderIndices={[0]}
        columnWrapperStyle={{ gap: 12, paddingHorizontal: 16 }}
        contentContainerStyle={{ gap: 12, paddingBottom: 40 }}
        renderItem={({ item }) => <PhotoCard look={item} width={cardW} />}
        ListEmptyComponent={<EmptyState title="No looks match." action={{ label: 'Clear filters', onPress: () => setF(NO_FILTERS) }} />}
        initialNumToRender={6}
        windowSize={7}
        keyboardDismissMode="on-drag"
      />
    </SafeAreaView>
  );
}
