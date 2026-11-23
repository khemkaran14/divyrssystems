import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, View } from 'react-native';
import { api } from '../../src/api/client';
import { useAccount } from '../../src/store/account';
import { Body, Button, Field, Screen, Small, toast } from '../../src/ui';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function submit() {
    setBusy(true); setErr('');
    try { await useAccount.getState().signIn(email.trim(), password); toast('Signed in'); router.back(); }
    catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }
  async function forgot() {
    if (!email.trim()) { setErr('Enter your email first.'); return; }
    try { await api('POST', '/api/auth/forgot', { email: email.trim() }); Alert.alert('Check your email', 'If that address has an account, a reset link is on its way.'); }
    catch (e) { setErr((e as Error).message); }
  }
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Screen edges={[]} contentStyle={{ padding: 16, gap: 14 }}>
        <Body>Use the same account as the website.</Body>
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="username" />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password" onSubmitEditing={submit} />
        {err ? <Small style={{ color: '#D6246E' }} accessibilityLiveRegion="polite">{err}</Small> : null}
        <Button label="Sign in" busy={busy} disabled={!email || !password} onPress={submit} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button label="Forgot password?" kind="ghost" onPress={forgot} style={{ flex: 1 }} />
          <Button label="Create account" kind="ghost" onPress={() => router.replace('/auth/sign-up')} style={{ flex: 1 }} />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
