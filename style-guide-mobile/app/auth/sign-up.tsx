import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';
import { useAccount } from '../../src/store/account';
import { Body, Button, Field, Screen, Small, toast } from '../../src/ui';

export default function SignUp() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function submit() {
    setBusy(true); setErr('');
    try { await useAccount.getState().signUp(name.trim(), email.trim(), password); toast('Welcome!'); router.back(); }
    catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Screen edges={[]} contentStyle={{ padding: 16, gap: 14 }}>
        <Body>One account for the app and the website.</Body>
        <Field label="Name" value={name} onChangeText={setName} autoComplete="name" textContentType="name" />
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="username" />
        <Field label="Password (8+ characters)" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
        {err ? <Small style={{ color: '#D6246E' }} accessibilityLiveRegion="polite">{err}</Small> : null}
        <Button label="Create account" busy={busy} disabled={!name || !email || password.length < 8} onPress={submit} />
        <Button label="I already have an account" kind="ghost" onPress={() => router.replace('/auth/sign-in')} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
