import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SiteConfig } from '../content/types';
import { DEFAULT_SITE } from '../engine/browse';
import { mmkv } from '../store/storage';
import { api, type Member } from './client';

const SITE_KEY = 'usg-site';
const cachedSite = (): SiteConfig => {
  try { return { ...DEFAULT_SITE, ...JSON.parse(mmkv.getString(SITE_KEY) || '{}') }; } catch { return DEFAULT_SITE; }
};

/** Public site config (announcement, featured, hidden). Cached for offline use. */
export function useSite(): SiteConfig {
  const q = useQuery({
    queryKey: ['site'],
    queryFn: async () => {
      const s = await api<SiteConfig>('GET', '/api/site');
      mmkv.set(SITE_KEY, JSON.stringify(s));
      return { ...DEFAULT_SITE, ...s };
    },
    initialData: cachedSite,
    initialDataUpdatedAt: 0,
    staleTime: 5 * 60 * 1000,
  });
  return q.data ?? DEFAULT_SITE;
}

export function useSaveSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (s: SiteConfig) => api<SiteConfig>('PUT', '/api/site', s),
    onSuccess: s => { mmkv.set(SITE_KEY, JSON.stringify(s)); qc.setQueryData(['site'], { ...DEFAULT_SITE, ...s }); },
  });
}

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => api<{ ok: boolean; version?: string }>('GET', '/api/health'),
    refetchInterval: 60_000,
    retry: 0,
  });
}

export function useMembers(enabled: boolean) {
  return useQuery({ queryKey: ['members'], enabled, queryFn: async () => (await api<{ members: Member[] }>('GET', '/api/admin/members')).members });
}

export function useMemberMutations() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: ['members'] });
  return {
    setAdmin: useMutation({ mutationFn: ({ id, admin }: { id: string; admin: boolean }) => api('PATCH', `/api/admin/members/${encodeURIComponent(id)}`, { admin, role: admin ? 'admin' : 'member' }), onSuccess: done }),
    remove: useMutation({ mutationFn: (id: string) => api('DELETE', `/api/admin/members/${encodeURIComponent(id)}`), onSuccess: done }),
  };
}
