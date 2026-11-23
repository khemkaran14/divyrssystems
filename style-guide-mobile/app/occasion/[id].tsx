import { Stack, useLocalSearchParams } from 'expo-router';
import { Text, View, useWindowDimensions } from 'react-native';
import { useSite } from '../../src/api/hooks';
import { OCC_BY_ID, visibleLooks } from '../../src/engine/browse';
import { Body, Card, EmptyState, Eyebrow, PhotoCard, Screen, Section, fonts, radius } from '../../src/ui';

export default function OccasionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const o = OCC_BY_ID[String(id)];
  const site = useSite();
  const { width } = useWindowDimensions();
  if (!o) return <Screen edges={[]}><EmptyState title="Occasion not found." /></Screen>;
  const looks = visibleLooks(site).filter(l => l.occasions.includes(o.id));
  const cardW = (width - 32 - 12) / 2;
  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: o.name }} />
      <View style={{ margin: 16, backgroundColor: o.colour, borderRadius: radius.photo, padding: 20, gap: 6 }}>
        <Text style={{ fontFamily: fonts.monoMedium, fontSize: 11, letterSpacing: 1.3, textTransform: 'uppercase', color: 'rgba(255,255,255,0.9)' }}>{o.subtitle}</Text>
        <Text accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 34, color: '#fff' }}>{o.name}</Text>
        <Text style={{ fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: '#fff' }}>{o.dressing}</Text>
      </View>
      <View style={{ paddingHorizontal: 16, gap: 12 }}>
        <Card><Eyebrow>What to wear</Eyebrow><Body>{o.whatToWear}</Body></Card>
        <Card><Eyebrow>What to skip</Eyebrow><Body>{o.avoid}</Body></Card>
        <Card><Eyebrow>Colours that work</Eyebrow><Body>{o.colours}</Body></Card>
        <Section>{looks.length} looks for {o.name.toLowerCase()}</Section>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, padding: 16 }}>
        {looks.map(l => <PhotoCard key={l.id} look={l} width={cardW} />)}
      </View>
    </Screen>
  );
}
