import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, Text, View } from 'react-native';
import { API_URL } from '../../src/api/client';
import { useHealth } from '../../src/api/hooks';
import { BODY_TYPES } from '../../src/engine/bodyType';
import { OCCASIONS } from '../../src/engine/browse';
import { useAccount } from '../../src/store/account';
import { useLooks } from '../../src/store/looks';
import { useSaved } from '../../src/store/saved';
import { Body, Button, Card, Chip, Eyebrow, Field, Screen, Section, Small, Strong, Title, fonts, toast, useTheme } from '../../src/ui';

const VIBES: [string, string][] = [['ethnic', 'Traditional Indian'], ['western', 'Modern western'], ['fusion', 'A bit of both']];
const PRIVACY = `${API_URL}/privacy`;
const TERMS = `${API_URL}/terms`;

export default function Profile() {
  const t = useTheme();
  const { user, profile } = useAccount();
  const hearts = useSaved(s => s.ids.length);
  const looks = useLooks(s => s.looks.length);
  const health = useHealth();
  const offline = health.isError;

  return (
    <Screen>
      <View style={{ padding: 16, gap: 16 }}>
        <Eyebrow>Profile</Eyebrow>
        <Title>{user ? `Hi, ${user.name.split(' ')[0]}` : 'Your account'}</Title>
        {offline ? <Card style={{ backgroundColor: t.surface2 }}><Strong>You’re offline</Strong><Small>The guide and Dressing Room still work. Saves sync when you’re back online.</Small></Card> : null}
        {!user ? (
          <Card>
            <Body>Save your hearts, Dressing Room looks and recolours on every device and on the website, and get looks picked for you.</Body>
            <Button label="Sign in" onPress={() => router.push('/auth/sign-in')} />
            <Button label="Create an account" kind="secondary" onPress={() => router.push('/auth/sign-up')} />
          </Card>
        ) : (
          <>
            <Card>
              <Strong>{user.name}</Strong>
              <Small>{user.email}</Small>
              <View style={{ flexDirection: 'row', gap: 16, marginTop: 6 }}>
                <Stat n={hearts} label="hearts" /><Stat n={looks} label="saved looks" /><Stat n={user.created || '—'} label="member since" />
              </View>
            </Card>
            <StyleProfile key={JSON.stringify(profile)} />
            <PasswordCard />
            {user.admin ? <Button label="Admin" icon="shield-checkmark-outline" kind="ghost" onPress={() => router.push('/admin')} /> : null}
            <Button label="Sign out" kind="secondary" onPress={() => useAccount.getState().signOut().then(() => toast('Signed out'))} />
            <Button label="Delete my account and data" kind="ghost" onPress={() => Alert.alert('Delete your account?', 'This deletes your account, style profile, hearts and saved looks on every device and the website. It can’t be undone.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => useAccount.getState().deleteAccount().then(() => toast('Account deleted')).catch(e => toast(e.message)) },
            ])} />
          </>
        )}
        <Section style={{ marginTop: 8 }}>About</Section>
        <Card>
          <Link label="About The Ultimate Style Guide" onPress={() => router.push('/about')} />
          <Link label="Privacy policy" onPress={() => Linking.openURL(PRIVACY)} />
          <Link label="Terms of use" onPress={() => Linking.openURL(TERMS)} />
          <Small>Version {Constants.expoConfig?.version ?? '1.0.0'}{health.data?.version ? ` · server ${health.data.version}` : ''}</Small>
        </Card>
      </View>
    </Screen>
  );
}

function Stat({ n, label }: { n: number | string; label: string }) {
  const t = useTheme();
  return <View><Text style={{ fontFamily: fonts.displayHeavy, fontSize: 20, color: t.rani }}>{n}</Text><Small>{label}</Small></View>;
}
function Link({ label, onPress }: { label: string; onPress(): void }) {
  const t = useTheme();
  return <Pressable accessibilityRole="link" onPress={onPress} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ fontFamily: fonts.bodyBold, color: t.rani, fontSize: 15 }}>{label}</Text></Pressable>;
}

function StyleProfile() {
  const profile = useAccount(s => s.profile);
  const [vibe, setVibe] = useState(profile?.vibe || 'fusion');
  const [bt, setBt] = useState(profile?.bt || 'regular');
  const [occ, setOcc] = useState<string[]>(profile?.occ || []);
  const [busy, setBusy] = useState(false);
  return (
    <Card>
      <Strong>My style</Strong>
      <Small>How do you like to dress?</Small>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{VIBES.map(([k, n]) => <Chip key={k} label={n} selected={vibe === k} onPress={() => setVibe(k)} />)}</View>
      <Small>Default body type in the Dressing Room</Small>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{BODY_TYPES.map(([k, n]) => <Chip key={k} label={n} selected={bt === k} onPress={() => setBt(k)} />)}</View>
      <Small>Favourite occasions</Small>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{OCCASIONS.map(o => <Chip key={o.id} label={o.name} tint={o.colour} selected={occ.includes(o.id)} onPress={() => setOcc(occ.includes(o.id) ? occ.filter(x => x !== o.id) : [...occ, o.id])} />)}</View>
      <Button label="Save my style" busy={busy} onPress={async () => {
        setBusy(true);
        try { await useAccount.getState().saveProfile({ vibe, bt, occ }); toast('Profile saved'); } catch (e) { toast((e as Error).message); }
        setBusy(false);
      }} />
    </Card>
  );
}

function PasswordCard() {
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!open) { setCur(''); setPw(''); } }, [open]);
  if (!open) return <Button label="Change password" kind="ghost" onPress={() => setOpen(true)} />;
  return (
    <Card>
      <Field label="Current password" secureTextEntry value={cur} onChangeText={setCur} autoComplete="current-password" />
      <Field label="New password (8+ characters)" secureTextEntry value={pw} onChangeText={setPw} autoComplete="new-password" />
      <Button label="Change password" busy={busy} disabled={pw.length < 8 || !cur} onPress={async () => {
        setBusy(true);
        try { await useAccount.getState().changePassword(cur, pw); toast('Password changed. Other devices were signed out.'); setOpen(false); } catch (e) { toast((e as Error).message); }
        setBusy(false);
      }} />
      <Button label="Cancel" kind="ghost" onPress={() => setOpen(false)} />
    </Card>
  );
}
