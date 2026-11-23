import { useState } from 'react';
import { Pressable, Switch, Text, View, useWindowDimensions } from 'react-native';
import { useSaveSite, useSite } from '../../src/api/hooks';
import { LOOKS } from '../../src/engine/browse';
import type { SiteConfig } from '../../src/content/types';
import { useAccount } from '../../src/store/account';
import { Button, Card, EmptyState, Field, IconButton, LookPhoto, Screen, Small, Strong, fonts, radius, toast, useTheme } from '../../src/ui';

export default function SiteSettings() {
  const admin = useAccount(s => !!s.user?.admin);
  const site = useSite();
  if (!admin) return <Screen edges={[]}><EmptyState title="Admins only." /></Screen>;
  return <Editor key={JSON.stringify(site)} initial={site} />;
}

function Editor({ initial }: { initial: SiteConfig }) {
  const t = useTheme();
  const save = useSaveSite();
  const [s, setS] = useState<SiteConfig>(initial);
  const { width } = useWindowDimensions();
  const tile = (width - 32 - 24) / 4;
  const move = (i: number, d: number) => { const f = [...s.featured]; const j = i + d; if (j < 0 || j >= f.length) return; [f[i], f[j]] = [f[j], f[i]]; setS({ ...s, featured: f }); };
  return (
    <Screen edges={[]} contentStyle={{ padding: 16, gap: 12 }}>
      <Card>
        <Strong>Announcement</Strong>
        <Field label="Text" value={s.announce} onChangeText={announce => setS({ ...s, announce })} maxLength={200} />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Small>Show the announcement</Small>
          <Switch value={s.announceOn} onValueChange={announceOn => setS({ ...s, announceOn })} trackColor={{ true: t.rani }} accessibilityLabel="Show the announcement" />
        </View>
      </Card>
      <Card>
        <Strong>Featured looks ({s.featured.length}/8)</Strong>
        <Small>Shown in the Discover carousel, in this order. Tap a photo below to add or remove.</Small>
        {s.featured.map((id, i) => (
          <View key={id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ flex: 1, fontFamily: fonts.bodySemi, color: t.ink }}>{i + 1}. {LOOKS.find(l => l.id === id)?.name ?? id}</Text>
            <IconButton icon="arrow-up" label="Move up" size={36} onPress={() => move(i, -1)} />
            <IconButton icon="arrow-down" label="Move down" size={36} onPress={() => move(i, 1)} />
          </View>
        ))}
        <PhotoGrid tile={tile} selected={s.featured} onToggle={id => {
          if (s.featured.includes(id)) setS({ ...s, featured: s.featured.filter(x => x !== id) });
          else if (s.featured.length < 8) setS({ ...s, featured: [...s.featured, id] });
          else toast('Pick up to 8 featured looks');
        }} />
      </Card>
      <Card>
        <Strong>Hidden looks ({s.hidden.length})</Strong>
        <Small>Hidden looks disappear from every list, the quiz and search, on the website and the app.</Small>
        <PhotoGrid tile={tile} selected={s.hidden} onToggle={id => setS({ ...s, hidden: s.hidden.includes(id) ? s.hidden.filter(x => x !== id) : [...s.hidden, id] })} />
      </Card>
      <Button label="Save for the website and every app" busy={save.isPending} onPress={() => save.mutate(s, { onSuccess: () => toast('Site settings saved'), onError: e => toast(e.message) })} />
    </Screen>
  );
}

function PhotoGrid({ tile, selected, onToggle }: { tile: number; selected: string[]; onToggle(id: string): void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {LOOKS.map(l => {
        const on = selected.includes(l.id);
        return (
          <Pressable key={l.id} accessibilityRole="checkbox" accessibilityLabel={l.name} accessibilityState={{ checked: on }} onPress={() => onToggle(l.id)}
            style={{ width: tile, height: tile * 1.33, borderRadius: radius.input, borderWidth: 3, borderColor: on ? t.rani : 'transparent', overflow: 'hidden' }}>
            <LookPhoto look={l} rounded={0} style={{ flex: 1, opacity: on ? 1 : 0.75 }} />
          </Pressable>
        );
      })}
    </View>
  );
}
