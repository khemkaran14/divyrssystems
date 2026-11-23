import { router } from 'expo-router';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { OCCASIONS } from '../src/engine/browse';
import { Screen, fonts, radius } from '../src/ui';

export default function Occasions() {
  const { width } = useWindowDimensions();
  const w = (width - 32 - 12) / 2;
  return (
    <Screen edges={[]}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, padding: 16 }}>
        {OCCASIONS.map(o => (
          <Pressable key={o.id} accessibilityRole="button" accessibilityLabel={o.name} onPress={() => router.push(`/occasion/${o.id}`)}
            style={({ pressed }) => ({ width: w, minHeight: 110, backgroundColor: o.colour, borderRadius: radius.card, padding: 14, justifyContent: 'flex-end', opacity: pressed ? 0.9 : 1 })}>
            <Text style={{ fontFamily: fonts.display, fontSize: 20, color: '#fff' }}>{o.name}</Text>
            <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 12, color: 'rgba(255,255,255,0.9)' }}>{o.subtitle}</Text>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}
