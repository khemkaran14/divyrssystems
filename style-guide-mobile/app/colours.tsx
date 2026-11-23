import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import combosJson from '../src/content/combos.json';
import type { ColourCombo } from '../src/content/types';
import { lookById } from '../src/engine/browse';
import { useSite } from '../src/api/hooks';
import { Card, LookPhoto, Screen, Small, Strong, fonts, radius, useTheme } from '../src/ui';

const COMBOS = combosJson as ColourCombo[];

export default function Colours() {
  const t = useTheme();
  const site = useSite();
  return (
    <Screen edges={[]} contentStyle={{ padding: 16, gap: 12 }}>
      {COMBOS.map(c => {
        const look = lookById(c.lookId);
        const show = look && !site.hidden.includes(look.id);
        return (
          <Card key={c.name} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <View style={{ flexDirection: 'row' }} accessibilityLabel={`${c.name} swatches`}>
              <View style={{ width: 48, height: 72, borderTopLeftRadius: 14, borderBottomLeftRadius: 14, backgroundColor: c.a, borderWidth: 1, borderColor: t.line }} />
              <View style={{ width: 48, height: 72, borderTopRightRadius: 14, borderBottomRightRadius: 14, backgroundColor: c.b, borderWidth: 1, borderColor: t.line }} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Strong>{c.name}</Strong>
              <Small>{c.usedFor}</Small>
              {show ? <Text style={{ fontFamily: fonts.bodySemi, fontSize: 12, color: t.rani }}>Seen in: {look!.name}</Text> : null}
            </View>
            {show ? (
              <Pressable accessibilityRole="button" accessibilityLabel={`Open ${look!.name}`} onPress={() => router.push(`/look/${look!.id}`)}>
                <LookPhoto look={look!} rounded={radius.input} style={{ width: 66, height: 88 }} />
              </Pressable>
            ) : null}
          </Card>
        );
      })}
    </Screen>
  );
}
