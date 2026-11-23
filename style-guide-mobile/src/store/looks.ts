import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '../api/client';
import type { SavedLook } from '../engine/types';
import { persistStorage } from './storage';

export const GUEST_MAX = 12;
export const MEMBER_MAX = 50;

type S = {
  looks: SavedLook[];
  /** lids saved while offline that still need uploading */
  pending: string[];
  /** lids deleted while offline */
  deleted: string[];
  add(lk: SavedLook, member: boolean): Promise<void>;
  remove(lid: string, member: boolean): Promise<void>;
  /** Merge server looks: newest t wins per lid. */
  mergeServer(server: SavedLook[]): void;
  flush(): Promise<void>;
  clear(): void;
};

export const useLooks = create<S>()(persist((set, get) => ({
  looks: [], pending: [], deleted: [],
  async add(lk, member) {
    const looks = [lk, ...get().looks.filter(l => l.lid !== lk.lid)].slice(0, member ? MEMBER_MAX : GUEST_MAX);
    set({ looks });
    if (!member) return;
    try { await api('POST', '/api/looks', lk); }
    catch (e: any) { if (e.status === 0) set({ pending: [...get().pending, lk.lid] }); else throw e; }
  },
  async remove(lid, member) {
    set({ looks: get().looks.filter(l => l.lid !== lid), pending: get().pending.filter(x => x !== lid) });
    if (!member) return;
    try { await api('DELETE', `/api/looks/${encodeURIComponent(lid)}`); }
    catch { set({ deleted: [...get().deleted, lid] }); }
  },
  mergeServer(server) {
    const byId = new Map<string, SavedLook>();
    for (const l of get().looks) byId.set(l.lid, l);
    for (const s of server) {
      const local = byId.get(s.lid);
      if (get().deleted.includes(s.lid)) continue;
      if (!local || (s.t ?? 0) >= (local.t ?? 0)) byId.set(s.lid, s);
    }
    const looks = [...byId.values()].sort((a, b) => (b.t ?? 0) - (a.t ?? 0)).slice(0, MEMBER_MAX);
    set({ looks });
  },
  async flush() {
    for (const lid of get().deleted) {
      try { await api('DELETE', `/api/looks/${encodeURIComponent(lid)}`); set({ deleted: get().deleted.filter(x => x !== lid) }); } catch { return; }
    }
    for (const lid of get().pending) {
      const lk = get().looks.find(l => l.lid === lid);
      try { if (lk) await api('POST', '/api/looks', lk); set({ pending: get().pending.filter(x => x !== lid) }); } catch { return; }
    }
  },
  clear() { set({ looks: [], pending: [], deleted: [] }); },
}), { name: 'usg-photolooks', storage: persistStorage }));
