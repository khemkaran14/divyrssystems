import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api, setToken, setUnauthorisedHandler, getToken, type Me, type Profile, type User } from '../api/client';
import type { SavedLook } from '../engine/types';
import { useLooks } from './looks';
import { setMemberCheck, useSaved } from './saved';
import { persistStorage } from './storage';

type S = {
  user: User | null;
  profile: Profile | null;
  /** guest looks waiting for the "move to your account" answer */
  offerMove: number;
  init(): Promise<void>;
  signIn(email: string, password: string): Promise<void>;
  signUp(name: string, email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  deleteAccount(): Promise<void>;
  changePassword(current: string, password: string): Promise<void>;
  saveProfile(p: { vibe: string; bt: string; occ: string[] }): Promise<void>;
  saveVibe(vibe: string): Promise<void>;
  moveGuestLooks(yes: boolean): Promise<void>;
};

let guestLooks: SavedLook[] = [];

export const useAccount = create<S>()(persist((set, get) => {
  /** Same as account.js adopt(): hearts merge into the account, server looks come down. */
  async function adopt(me: Me, fresh: boolean) {
    set({ user: me.user ?? null, profile: me.profile ?? null });
    if (!me.user) return;
    const saved = useSaved.getState();
    const cloud = new Set(me.profile?.saved ?? []);
    const before = cloud.size;
    saved.ids.forEach(x => cloud.add(x));
    saved.replace([...cloud]);
    if (cloud.size !== before) api('PUT', '/api/saved', { saved: [...cloud].slice(0, 200) }).catch(() => {});
    const looks = useLooks.getState();
    if (fresh) {
      // Guest looks stay on the device until the member answers "Move your saved looks?"
      const server = await api<{ looks: SavedLook[] }>('GET', '/api/looks').catch(() => ({ looks: [] as SavedLook[] }));
      guestLooks = looks.looks.filter(l => !server.looks.some(s => s.lid === l.lid));
      looks.clear();
      looks.mergeServer(server.looks);
      set({ offerMove: guestLooks.length });
    } else {
      await looks.flush();
      const server = await api<{ looks: SavedLook[] }>('GET', '/api/looks').catch(() => null);
      if (server) looks.mergeServer(server.looks);
    }
  }
  function signedOutLocally() {
    set({ user: null, profile: null, offerMove: 0 });
    useSaved.getState().replace([]);
    useLooks.getState().clear();
  }
  setUnauthorisedHandler(signedOutLocally);

  return {
    user: null, profile: null, offerMove: 0,
    async init() {
      if (!(await getToken())) { if (get().user) signedOutLocally(); return; }
      try { await adopt(await api<Me>('GET', '/api/me'), false); await useSaved.getState().sync(); }
      catch { /* offline: keep the cached member */ }
    },
    async signIn(email, password) {
      const me = await api<Me>('POST', '/api/auth/login', { email, password });
      if (me.token) await setToken(me.token);
      await adopt(me, true);
    },
    async signUp(name, email, password) {
      const me = await api<Me>('POST', '/api/auth/signup', { name, email, password });
      if (me.token) await setToken(me.token);
      await adopt(me, true);
    },
    async signOut() {
      await api('POST', '/api/auth/logout').catch(() => {});
      await setToken(null);
      signedOutLocally();
    },
    async deleteAccount() {
      await api('DELETE', '/api/account');
      await setToken(null);
      signedOutLocally();
    },
    async changePassword(current, password) {
      await api('POST', '/api/auth/password', { current, password });
    },
    async saveProfile(p) {
      const me = await api<Me>('PUT', '/api/profile', { ...p, saved: useSaved.getState().ids });
      set({ profile: me.profile ?? null });
    },
    async saveVibe(vibe) {
      const p = get().profile;
      if (!get().user) return;
      await get().saveProfile({ vibe, bt: p?.bt || 'regular', occ: p?.occ || [] }).catch(() => {});
    },
    async moveGuestLooks(yes) {
      const list = guestLooks;
      guestLooks = [];
      set({ offerMove: 0 });
      // "Not now": keep them on this phone only (they are not uploaded).
      if (!yes) { useLooks.setState(s => ({ looks: [...s.looks, ...list.filter(l => !s.looks.some(x => x.lid === l.lid))] })); return; }
      for (const l of list.slice().reverse()) await useLooks.getState().add(l, true).catch(() => {});
    },
  };
}, { name: 'usg-account', storage: persistStorage, partialize: s => ({ user: s.user, profile: s.profile }) }));

setMemberCheck(() => !!useAccount.getState().user);
