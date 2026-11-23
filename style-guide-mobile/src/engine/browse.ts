import looksJson from '../content/looks.json';
import occasionsJson from '../content/occasions.json';
import quizJson from '../content/quiz.json';
import promptText from '../content/prompt-text.json';
import type { Look, Occasion, SiteConfig } from '../content/types';

export const LOOKS = looksJson as Look[];
export const OCCASIONS = occasionsJson as Occasion[];
export const OCC_BY_ID: Record<string, Occasion> = Object.fromEntries(OCCASIONS.map(o => [o.id, o]));
export const CATEGORY_NAME: Record<string, string> = { ethnic: 'Ethnic', fusion: 'Fusion', western: 'Western' };
export const REGIONS = [...new Set(LOOKS.map(l => l.region))];
export type QuizQuestion = { question: string; answers: { label: string; value: string | string[] }[] };
export const QUIZ = quizJson as QuizQuestion[];
export const DEFAULT_SITE: SiteConfig = { announce: '', announceOn: false, featured: [], hidden: [] };

export const visibleLooks = (site: SiteConfig) => LOOKS.filter(l => !site.hidden.includes(l.id));

export type Filters = { cat: string; reg: string; occ: string; q: string; saved: boolean };
export const NO_FILTERS: Filters = { cat: 'all', reg: 'all', occ: 'all', q: '', saved: false };

/** ui3.js match(): every word must appear somewhere in the look's text. */
export function matchLook(o: Look, F: Filters, site: SiteConfig, saved: Set<string> | string[]): boolean {
  const s = Array.isArray(saved) ? new Set(saved) : saved;
  if (site.hidden.includes(o.id)) return false;
  if (F.cat !== 'all' && o.category !== F.cat) return false;
  if (F.reg !== 'all' && o.region !== F.reg) return false;
  if (F.occ !== 'all' && !o.occasions.includes(F.occ)) return false;
  if (F.saved && !s.has(o.id)) return false;
  const q = F.q.trim().toLowerCase();
  if (q) {
    const hay = [o.name, o.category, o.region, o.colourName, o.description, o.pieces.join(' '), o.occasions.map(k => OCC_BY_ID[k]?.name || k).join(' ')].join(' ').toLowerCase();
    if (!q.split(/\s+/).every(w => hay.includes(w))) return false;
  }
  return true;
}

/** Quiz score (SPEC 5): +3 per chosen occasion, +3 vibe match else +1 if either is fusion, +2 mood. */
export function quizScore(o: Look, occs: string[], vibe: string, mood: string): number {
  let s = 0;
  for (const k of occs) if (o.occasions.includes(k)) s += 3;
  if (o.category === vibe) s += 3;
  else if (vibe === 'fusion' || o.category === 'fusion') s += 1;
  if (o.mood === mood) s += 2;
  return s;
}
export function quizTop(occs: string[], vibe: string, mood: string, site: SiteConfig, n = 4): Look[] {
  return visibleLooks(site).map(o => [quizScore(o, occs, vibe, mood), o] as const).sort((a, b) => b[0] - a[0]).slice(0, n).map(x => x[1]);
}

/** Hero carousel: site.featured, else the default list then the rest in data order. */
export function heroLooks(site: SiteConfig, max = 8): Look[] {
  const ids: string[] = site.featured?.length ? site.featured : [...promptText.heroDefault, ...LOOKS.map(l => l.id)];
  const out: Look[] = [];
  for (const id of ids) {
    const l = LOOKS.find(x => x.id === id);
    if (l && !site.hidden.includes(id) && !out.includes(l)) out.push(l);
    if (out.length >= max) break;
  }
  return out;
}

export const lookById = (id: string) => LOOKS.find(l => l.id === id);

/** "Picked for you" on Discover for members with a style profile (account.js renderForYou). */
export function forYou(profile: { vibe: string | null; occ: string[] } | null, saved: string[], site: SiteConfig, n = 8): Look[] {
  if (!profile?.vibe) return [];
  const p = profile;
  const sc = (o: Look) => (o.category === p.vibe ? 3 : p.vibe === 'fusion' && o.category !== 'fusion' ? 1 : 0)
    + (p.occ || []).filter(k => o.occasions.includes(k)).length * 2 + (saved.includes(o.id) ? -5 : 0);
  return visibleLooks(site).map(o => [sc(o), o] as const).sort((a, b) => b[0] - a[0]).slice(0, n).map(x => x[1]);
}
