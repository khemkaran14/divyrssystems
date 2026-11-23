import { router } from 'expo-router';
import { View } from 'react-native';
import { useMembers } from '../../src/api/hooks';
import { lookById } from '../../src/engine/browse';
import { useAccount } from '../../src/store/account';
import { Button, Card, EmptyState, Screen, Small, Strong, StatPill } from '../../src/ui';

const weekAgo = () => new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);

export default function AdminHome() {
  const admin = useAccount(s => !!s.user?.admin);
  const q = useMembers(admin);
  if (!admin) return <Screen edges={[]}><EmptyState title="Admins only." /></Screen>;
  const M = q.data ?? [];
  const wk = weekAgo();
  const hearts: Record<string, number> = {};
  M.forEach(m => (m.saved || []).forEach(id => { hearts[id] = (hearts[id] || 0) + 1; }));
  const top = Object.entries(hearts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  return (
    <Screen edges={[]} contentStyle={{ padding: 16, gap: 12 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <StatPill n={M.length} label="members" />
        <StatPill n={M.filter(m => m.joined >= wk).length} label="new this week" />
        <StatPill n={M.filter(m => m.lastActive >= wk).length} label="active this week" />
        <StatPill n={M.reduce((a, m) => a + (m.looks || 0), 0)} label="styled looks saved" />
      </View>
      <Card>
        <Strong>Most-hearted looks</Strong>
        {top.length ? top.map(([id, n]) => <Small key={id}>{lookById(id)?.name ?? id} · {n}</Small>) : <Small>{q.isLoading ? 'Loading…' : 'No hearts yet.'}</Small>}
      </Card>
      <Button label="Members" icon="people-outline" onPress={() => router.push('/admin/members')} />
      <Button label="Site settings" icon="settings-outline" kind="secondary" onPress={() => router.push('/admin/site')} />
    </Screen>
  );
}
