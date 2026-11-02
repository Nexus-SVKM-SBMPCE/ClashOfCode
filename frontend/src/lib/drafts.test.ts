import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadDraft, saveDraft, clearDraft } from './drafts';

const STARTERS = { python: '# py starter', cpp: '// cpp starter', c: '/* c */', java: '// java' };

describe('code drafts', () => {
  beforeEach(() => localStorage.clear());

  it('returns null when nothing is saved', () => {
    expect(loadDraft('7', 'two-sum', STARTERS)).toBeNull();
  });

  it('round-trips edited code and the chosen language', () => {
    saveDraft('7', 'two-sum', 'cpp', { ...STARTERS, cpp: 'int main(){}' }, STARTERS);
    const got = loadDraft('7', 'two-sum', STARTERS);
    expect(got?.lang).toBe('cpp');
    expect(got?.drafts.cpp).toBe('int main(){}');
    expect(got?.drafts.python).toBe(STARTERS.python); // untouched languages come from the starters
  });

  it('stores only edited languages and nothing at all for an untouched problem', () => {
    saveDraft('7', 'two-sum', 'python', { ...STARTERS, python: 'print(1)' }, STARTERS);
    const stored = JSON.parse(localStorage.getItem('cc-draft:v1:7:two-sum')!);
    expect(Object.keys(stored.drafts)).toEqual(['python']);

    // Editing back to the template removes the entry
    expect(saveDraft('7', 'two-sum', 'python', { ...STARTERS }, STARTERS)).toBeNull();
    expect(localStorage.getItem('cc-draft:v1:7:two-sum')).toBeNull();
  });

  it('keeps drafts separate per problem', () => {
    saveDraft('7', 'two-sum', 'python', { ...STARTERS, python: 'A' }, STARTERS);
    saveDraft('7', 'fibonacci', 'python', { ...STARTERS, python: 'B' }, STARTERS);
    expect(loadDraft('7', 'two-sum', STARTERS)?.drafts.python).toBe('A');
    expect(loadDraft('7', 'fibonacci', STARTERS)?.drafts.python).toBe('B');
  });

  it("never leaks one team's code to another team on the same browser", () => {
    saveDraft('7', 'two-sum', 'python', { ...STARTERS, python: 'team7 secret' }, STARTERS);
    expect(loadDraft('8', 'two-sum', STARTERS)).toBeNull();
  });

  it("clearDraft removes only that problem's draft", () => {
    saveDraft('7', 'two-sum', 'python', { ...STARTERS, python: 'A' }, STARTERS);
    saveDraft('7', 'fibonacci', 'python', { ...STARTERS, python: 'B' }, STARTERS);
    clearDraft('7', 'two-sum');
    expect(loadDraft('7', 'two-sum', STARTERS)).toBeNull();
    expect(loadDraft('7', 'fibonacci', STARTERS)).not.toBeNull();
  });

  it('survives corrupt or tampered storage without throwing', () => {
    localStorage.setItem('cc-draft:v1:7:two-sum', '{not json');
    expect(loadDraft('7', 'two-sum', STARTERS)).toBeNull();

    localStorage.setItem('cc-draft:v1:7:two-sum', JSON.stringify({ lang: 'brainf', drafts: { python: 5, rust: 'x', cpp: 'ok' } }));
    const got = loadDraft('7', 'two-sum', STARTERS);
    expect(got?.lang).toBe('python');                 // unknown language falls back
    expect(got?.drafts.python).toBe(STARTERS.python); // non-string ignored
    expect(got?.drafts.cpp).toBe('ok');
    expect(got?.drafts).not.toHaveProperty('rust');
  });

  it('is best-effort when storage is full or disabled', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
    expect(() => saveDraft('7', 'two-sum', 'python', { ...STARTERS, python: 'x' }, STARTERS)).not.toThrow();
    spy.mockRestore();
  });
});
