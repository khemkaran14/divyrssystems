import { router } from 'expo-router';
import type { SavedLook } from './engine/types';
import { useDressingRoom } from './store/dressingRoom';

/** Open the Dressing Room with a look (or the model) selected. */
export function openInDressingRoom(id: string) {
  useDressingRoom.getState().pickSubject(id);
  router.navigate('/dressing-room');
}

/** Reopen a saved styled look exactly as saved. */
export function openSavedLook(s: SavedLook) {
  useDressingRoom.getState().loadSaved(s);
  router.navigate('/dressing-room');
}
