/** @jest-environment node */
import { DEFAULT_SITE, LOOKS, matchLook, NO_FILTERS, quizTop, heroLooks, QUIZ } from '../src/engine/browse';

describe('browse (phase 2)', () => {
  it('search "silk wedding" returns only looks with both words', () => {
    const res = LOOKS.filter(l => matchLook(l, { ...NO_FILTERS, q: 'silk wedding' }, DEFAULT_SITE, []));
    expect(res.length).toBeGreaterThan(0);
    for (const l of res) {
      const hay = JSON.stringify(l).toLowerCase();
      expect(hay).toContain('silk');
      expect(hay).toContain('wedding');
    }
    const silkOnly = LOOKS.filter(l => matchLook(l, { ...NO_FILTERS, q: 'silk' }, DEFAULT_SITE, []));
    expect(silkOnly.length).toBeGreaterThanOrEqual(res.length);
  });

  it('quiz Wedding / Traditional / Elegant puts Banarasi or Kanjeevaram in the top 4', () => {
    const occs = QUIZ[0].answers.find(a => a.label === 'Wedding or festival')!.value as string[];
    const vibe = QUIZ[1].answers.find(a => a.label === 'Traditional Indian')!.value as string;
    const mood = QUIZ[2].answers.find(a => a.label === 'Elegant & classic')!.value as string;
    const top = quizTop(occs, vibe, mood, DEFAULT_SITE).map(l => l.id);
    expect(top).toHaveLength(4);
    expect(top.some(id => id === 'banarasi' || id === 'kanjeevaram')).toBe(true);
  });

  it('hidden looks disappear from lists, quiz and hero', () => {
    const site = { ...DEFAULT_SITE, hidden: ['banarasi'] };
    expect(LOOKS.filter(l => matchLook(l, NO_FILTERS, site, [])).map(l => l.id)).not.toContain('banarasi');
    expect(quizTop(['wedding'], 'ethnic', 'classic', site, 47).map(l => l.id)).not.toContain('banarasi');
    expect(heroLooks(site).map(l => l.id)).not.toContain('banarasi');
  });

  it('hero uses featured looks first, else the default order', () => {
    expect(heroLooks(DEFAULT_SITE)[0].id).toBe('banarasi');
    expect(heroLooks({ ...DEFAULT_SITE, featured: ['lbd', 'boho'] }).map(l => l.id)).toEqual(['lbd', 'boho']);
  });
});
