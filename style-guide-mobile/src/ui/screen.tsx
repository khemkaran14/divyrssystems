import { type ReactNode } from 'react';
import { ScrollView, View, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { useTheme } from './theme';

export function Screen({ children, scroll = true, edges = ['top'], contentStyle }: { children: ReactNode; scroll?: boolean; edges?: Edge[]; contentStyle?: ViewStyle }) {
  const t = useTheme();
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: t.bg }}>
      {scroll ? <ScrollView contentContainerStyle={[{ paddingBottom: 40 }, contentStyle]} keyboardShouldPersistTaps="handled">{children}</ScrollView> : <View style={[{ flex: 1 }, contentStyle]}>{children}</View>}
    </SafeAreaView>
  );
}
