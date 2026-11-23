import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useSite } from '../../src/api/hooks';
import { lookById } from '../../src/engine/browse';
import { openSavedLook } from '../../src/nav';
import { useAccount } from '../../src/store/account';
import { GUEST_MAX, useLooks } from '../../src/store/looks';
import { useSaved } from '../../src/store/saved';
import { EmptyState, Eyebrow, PhotoCard, Screen, Segmented, Small, Title, fonts, radius, toast, useTheme } from '../../src/ui';
import { shareDataUrl } from '../../src/dressing/shareThumb';

type Seg = 'looks' | 'styled';

export default function Saved() {
  const t = useTheme();
  const site = useSite();
  const [seg, setSeg] = useState<Seg>('looks');
  const ids = useSaved(s => s.ids);
  const styled = useLooks(s => s.looks);
  const member = useAccount(s => !!s.user);
  const { width } = useWindowDimensions();
  const cardW = (width - 32 - 12) / 2;
  const hearts = ids.map(lookById).filter(l => l && !site.hidden.includes(l.id));

  function onLong(lid: string) {
    const lk = styled.find(l => l.lid === lid);
    if (!lk) return;
    Alert.alert('Styled photo', undefined, [
      { text: 'Share', onPress: () => shareDataUrl(lk.thumb).catch(e => toast(e.message)) },
      { text: 'Delete', style: 'destructive', onPress: () => useLooks.getState().remove(lid, member).then(() => toast('Look deleted')) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  return (
    <Screen>
      <View style={{ padding: 16, gap: 12 }}>
        <Eyebrow>Saved</Eyebrow>
        <Title>Your looks</Title>
        <Segmented<Seg> value={seg} onChange={setSeg} options={[['looks', `Looks (${hearts.length})`], ['styled', `My styled photos (${styled.length})`]]} />
        {!member ? <Small>Saved on this phone{seg === 'styled' ? ` (up to ${GUEST_MAX} styled photos)` : ''}. Sign in to keep them on every device and the website.</Small> : null}
      </View>
      {seg === 'looks' ? (
        hearts.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 16 }}>
            {hearts.map(l => <PhotoCard key={l!.id} look={l!} width={cardW} />)}
          </View>
        ) : <EmptyState title="No hearts yet" body="Tap the heart on any look to keep it here." action={{ label: 'Browse the lookbook', onPress: () => router.navigate('/lookbook') }} />
      ) : styled.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 16 }}>
          {styled.map((s, i) => (
            <Pressable key={s.lid} accessibilityRole="button" accessibilityLabel={`Saved look ${i + 1}`} accessibilityHint="Opens it in the Dressing Room. Long-press to share or delete."
              onPress={() => openSavedLook(s)} onLongPress={() => onLong(s.lid)} delayLongPress={350}
              style={{ width: cardW, gap: 6 }}>
              <View style={{ width: cardW, height: (cardW * 4) / 3, borderRadius: radius.card, overflow: 'hidden', backgroundColor: t.surface2 }}>
                <Image source={{ uri: s.thumb }} contentFit="contain" style={{ width: '100%', height: '100%' }} />
              </View>
              <Text style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: t.ink }}>{s.who === 'model' ? 'The model' : lookById(s.who)?.name ?? 'Saved look'}</Text>
            </Pressable>
          ))}
        </View>
      ) : <EmptyState title="No styled photos yet" body="Style a look in the Dressing Room and tap the heart to save it." action={{ label: 'Open the Dressing Room', onPress: () => router.navigate('/dressing-room') }} />}
    </Screen>
  );
}
