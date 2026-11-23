/**
 * Analytics events (SPEC 9 phase 7): screen views, quiz finished, look saved, prompt copied.
 * No third-party tracker is wired in (the store listings say "no tracking"); events go to the
 * console in development. Plug a provider in here if the owner adds one.
 */
export type EventName = 'screen_view' | 'quiz_finished' | 'look_saved' | 'prompt_copied';
export function track(name: EventName, props: Record<string, string | number> = {}) {
  if (__DEV__) console.log(`[analytics] ${name}`, props);
}
