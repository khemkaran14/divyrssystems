import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '../api/client';
import { persistStorage } from './storage';

type S = {
  ids: string[];
  dirty: boolean;
  toggle(id: string): boolean;
  replace(ids: string[]): void;
  sync(): Promise<void>;
};
let timer: ReturnType<typeof setTimeout> | null = null;
let isMember = () => false;
export const setMemberCheck = (fn: () => boolean) => { isMember = fn; };

/** Hearted looks. Kept on the device; members sync to the server (debounced, retried). */
export const useSaved = create<S>()(persist((set, get) => ({
  ids: [],
  dirty: false,
  toggle(id) {
    const on = !get().ids.includes(id);
    set({ ids: on ? [...get().ids, id] : get().ids.filter(x => x !== id), dirty: isMember() });
    if (isMember()) { if (timer) clearTimeout(timer); timer = setTimeout(() => get().sync(), 600); }
    return on;
  },
  replace(ids) { set({ ids, dirty: false }); },
  async sync() {
    if (!isMember() || !get().dirty) return;
    try { await api('PUT', '/api/saved', { saved: get().ids.slice(0, 200) }); set({ dirty: false }); } catch {}
  },
}), { name: 'usg-saved', storage: persistStorage }));
