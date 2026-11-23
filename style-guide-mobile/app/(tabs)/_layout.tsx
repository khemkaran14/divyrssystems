import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { fonts, useTheme } from '../../src/ui';

type IconName = keyof typeof Ionicons.glyphMap;
const icon = (on: IconName, off: IconName) => ({ color, focused }: { color: import("react-native").ColorValue; focused: boolean }) => <Ionicons name={focused ? on : off} size={24} color={color as string} />;

export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: t.rani, tabBarInactiveTintColor: t.muted,
      tabBarStyle: { backgroundColor: t.surface, borderTopColor: t.line },
      tabBarLabelStyle: { fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: -0.1 },
      tabBarAllowFontScaling: false,
      animation: 'shift',
    }}>
      <Tabs.Screen name="index" options={{ title: 'Discover', tabBarIcon: icon('sparkles', 'sparkles-outline') }} />
      <Tabs.Screen name="lookbook" options={{ title: 'Lookbook', tabBarIcon: icon('grid', 'grid-outline') }} />
      <Tabs.Screen name="dressing-room" options={{ title: 'Dressing Room', tabBarIcon: icon('color-palette', 'color-palette-outline') }} />
      <Tabs.Screen name="saved" options={{ title: 'Saved', tabBarIcon: icon('heart', 'heart-outline') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: icon('person-circle', 'person-circle-outline') }} />
    </Tabs>
  );
}
