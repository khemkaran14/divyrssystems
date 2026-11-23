import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SiteConfig } from '../content/types';
import { persistStorage } from '../store/storage';
import { fonts, useTheme } from './theme';

const useClosed = create<{ text: string; close(t: string): void }>()(persist(set => ({ text: '', close: text => set({ text }) }), { name: 'usg-announce', storage: persistStorage }));

/** Announcement from the site config. Closing it is remembered per announcement text. */
export function AnnouncementBanner({ site }: { site: SiteConfig }) {
  const t = useTheme();
  const { text, close } = useClosed();
  if (!site.announceOn || !site.announce || text === site.announce) return null;
  return (
    <View accessibilityRole="alert" style={{ marginHorizontal: 16, marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.marigold, borderRadius: 16, paddingLeft: 16 }}>
      <Text style={{ flex: 1, paddingVertical: 12, fontFamily: fonts.bodySemi, fontSize: 14, color: '#2A0F2E' }}>{site.announce}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Close announcement" onPress={() => close(site.announce)} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="close" size={20} color="#2A0F2E" />
      </Pressable>
    </View>
  );
}
