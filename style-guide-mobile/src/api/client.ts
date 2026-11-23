import * as SecureStore from 'expo-secure-store';

/** Backend base URL, e.g. https://style.livelifetricks.com (set EXPO_PUBLIC_API_URL). */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'https://style.livelifetricks.com').replace(/\/+$/, '');
const TOKEN_KEY = 'usg_token';

let token: string | null | undefined;
let onUnauthorised: (() => void) | null = null;
export const setUnauthorisedHandler = (fn: () => void) => { onUnauthorised = fn; };

export async function getToken(): Promise<string | null> {
  if (token === undefined) token = await SecureStore.getItemAsync(TOKEN_KEY).catch(() => null);
  return token ?? null;
}
export async function setToken(t: string | null) {
  token = t;
  if (t) await SecureStore.setItemAsync(TOKEN_KEY, t);
  else await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
}

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function request(method: string, path: string, body?: unknown): Promise<Response> {
  const t = await getToken();
  const headers: Record<string, string> = { Accept: 'application/json', 'X-Client': 'mobile' };
  if (t) headers.Authorization = `Bearer ${t}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);
  try {
    return await fetch(API_URL + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, signal: ctl.signal });
  } catch {
    throw new ApiError('You seem to be offline. Check your connection and try again.', 0);
  } finally {
    clearTimeout(timer);
  }
}

/** JSON API call. A 401 on a signed-in request clears the token and signs out. */
export async function api<T = { ok: boolean }>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const r = await request(method, path, body);
  let j: any = {};
  try { j = await r.json(); } catch {}
  if (r.status === 401 && token && !path.startsWith('/api/auth/')) {
    await setToken(null);
    onUnauthorised?.();
  }
  if (!r.ok) throw new ApiError(j.error || 'Something went wrong. Try again.', r.status);
  return j as T;
}

export async function apiText(path: string): Promise<string> {
  const r = await request('GET', path);
  if (!r.ok) throw new ApiError('Could not download the file.', r.status);
  return r.text();
}

// ---- shapes ----
export type User = { id: string; name: string; email: string; admin: boolean; created: string };
export type Profile = { vibe: string | null; bt: string | null; occ: string[]; saved: string[]; created?: string };
export type Me = { user: User | null; profile?: Profile | null; token?: string };
export type Member = { id: string; name: string; email: string; admin: boolean; joined: string; lastActive: string; vibe: string | null; bt: string | null; saved: string[]; looks: number };
