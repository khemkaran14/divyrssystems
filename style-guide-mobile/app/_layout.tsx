import { BodoniModa_600SemiBold_Italic, BodoniModa_700Bold, BodoniModa_800ExtraBold } from '@expo-google-fonts/bodoni-moda';
import { DMMono_400Regular, DMMono_500Medium } from '@expo-google-fonts/dm-mono';
import { Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold } from '@expo-google-fonts/manrope';
import { focusManager, onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Alert, AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAccount } from '../src/store/account';
import { useLooks } from '../src/store/looks';
import { useSaved } from '../src/store/saved';
import { fonts, ToastHost, useTheme } from '../src/ui';

SplashScreen.preventAutoHideAsync().catch(() => {});
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 2, networkMode: 'offlineFirst' }, mutations: { networkMode: 'offlineFirst' } } });
onlineManager.setOnline(true);

export default function RootLayout() {
  const [loaded] = useFonts({
    BodoniModa_700Bold, BodoniModa_800ExtraBold, BodoniModa_600SemiBold_Italic,
    Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold,
    DMMono_400Regular, DMMono_500Medium,
  });
  const t = useTheme();
  const offerMove = useAccount(s => s.offerMove);

  useEffect(() => { if (loaded) SplashScreen.hideAsync().catch(() => {}); }, [loaded]);
  useEffect(() => {
    useAccount.getState().init();
    // Retry syncing when the app comes back to the foreground.
    const sub = AppState.addEventListener('change', s => {
      focusManager.setFocused(s === 'active');
      if (s === 'active' && useAccount.getState().user) { useSaved.getState().sync(); useLooks.getState().flush(); }
    });
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (!offerMove) return;
    Alert.alert('Move your saved looks to your account?', `You have ${offerMove} styled photo${offerMove > 1 ? 's' : ''} saved on this phone. Move them to your account to see them on the website and other devices.`, [
      { text: 'Not now', style: 'cancel', onPress: () => useAccount.getState().moveGuestLooks(false) },
      { text: 'Move them', onPress: () => useAccount.getState().moveGuestLooks(true) },
    ]);
  }, [offerMove]);

  if (!loaded) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: t.bg }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style={t.dark ? 'light' : 'dark'} />
          <Stack screenOptions={{
            headerStyle: { backgroundColor: t.bg }, headerTintColor: t.ink, headerShadowVisible: false,
            headerTitleStyle: { fontFamily: fonts.display, fontSize: 20 }, contentStyle: { backgroundColor: t.bg },
            headerBackButtonDisplayMode: 'minimal',
          }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="look/[id]" options={{ title: '' }} />
            <Stack.Screen name="occasion/[id]" options={{ title: '' }} />
            <Stack.Screen name="occasions" options={{ title: 'Occasions' }} />
            <Stack.Screen name="quiz" options={{ title: 'Style quiz', presentation: 'fullScreenModal', headerShown: false }} />
            <Stack.Screen name="colours" options={{ title: 'Colour combos' }} />
            <Stack.Screen name="rules" options={{ title: 'Style rules' }} />
            <Stack.Screen name="about" options={{ title: 'About' }} />
            <Stack.Screen name="auth/sign-in" options={{ title: 'Sign in', presentation: 'modal' }} />
            <Stack.Screen name="auth/sign-up" options={{ title: 'Create account', presentation: 'modal' }} />
            <Stack.Screen name="admin/index" options={{ title: 'Admin' }} />
            <Stack.Screen name="admin/members" options={{ title: 'Members' }} />
            <Stack.Screen name="admin/site" options={{ title: 'Site settings' }} />
          </Stack>
          <ToastHost />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
