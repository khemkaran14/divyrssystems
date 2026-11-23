import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { Alert, FlatList, TextInput, View } from 'react-native';
import { apiText } from '../../src/api/client';
import { useMemberMutations, useMembers } from '../../src/api/hooks';
import { useAccount } from '../../src/store/account';
import { Button, Card, EmptyState, Small, Strong, fonts, radius, toast, useTheme } from '../../src/ui';

export default function Members() {
  const t = useTheme();
  const me = useAccount(s => s.user);
  const q = useMembers(!!me?.admin);
  const { setAdmin, remove } = useMemberMutations();
  const [search, setSearch] = useState('');
  if (!me?.admin) return <EmptyState title="Admins only." />;
  const s = search.trim().toLowerCase();
  const list = (q.data ?? []).filter(m => !s || m.name.toLowerCase().includes(s) || m.email.toLowerCase().includes(s));

  async function exportCsv() {
    try {
      const csv = await apiText('/api/admin/export.csv');
      const f = new File(Paths.cache, 'members.csv');
      f.create({ overwrite: true });
      f.write(csv);
      await Sharing.shareAsync(f.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text' });
    } catch (e) { toast((e as Error).message); }
  }

  return (
    <FlatList
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={{ padding: 16, gap: 10 }}
      data={list}
      keyExtractor={m => m.id}
      ListHeaderComponent={
        <View style={{ gap: 10, marginBottom: 6 }}>
          <TextInput value={search} onChangeText={setSearch} placeholder="Search by name or email" placeholderTextColor={t.muted} accessibilityLabel="Search members"
            style={{ minHeight: 48, borderRadius: radius.input, backgroundColor: t.surface2, paddingHorizontal: 14, fontFamily: fonts.body, color: t.ink }} />
          <Button label="Export CSV" icon="download-outline" kind="secondary" onPress={exportCsv} />
          <Small>{list.length} members</Small>
        </View>
      }
      ListEmptyComponent={<EmptyState title={q.isLoading ? 'Loading…' : 'No members found.'} />}
      renderItem={({ item: m }) => (
        <Card>
          <Strong>{m.name}{m.admin ? ' · admin' : ''}</Strong>
          <Small>{m.email}</Small>
          <Small>Joined {m.joined} · last active {m.lastActive}</Small>
          <Small>Vibe {m.vibe || '—'} · body type {m.bt || '—'} · {m.saved?.length || 0} hearts · {m.looks} saved looks</Small>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button label={m.admin ? 'Remove admin' : 'Make admin'} kind="ghost" style={{ flex: 1 }} disabled={m.id === me.id}
              onPress={() => setAdmin.mutate({ id: m.id, admin: !m.admin }, { onError: e => toast(e.message) })} />
            <Button label="Delete" kind="secondary" style={{ flex: 1 }} disabled={m.id === me.id}
              onPress={() => Alert.alert(`Delete ${m.name}?`, 'This deletes the member and all their data. It can’t be undone.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => remove.mutate(m.id, { onSuccess: () => toast('Member deleted'), onError: e => toast(e.message) }) },
              ])} />
          </View>
        </Card>
      )}
    />
  );
}
