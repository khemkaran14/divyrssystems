import { createMMKV } from 'react-native-mmkv';
import { createJSONStorage, type StateStorage } from 'zustand/middleware';

export const mmkv = createMMKV({ id: 'usg' });
const raw: StateStorage = {
  getItem: k => mmkv.getString(k) ?? null,
  setItem: (k, v) => mmkv.set(k, v),
  removeItem: k => { mmkv.remove(k); },
};
export const persistStorage = createJSONStorage(() => raw);
