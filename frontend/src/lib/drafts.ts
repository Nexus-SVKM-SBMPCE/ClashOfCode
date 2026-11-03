/**
 * Per-problem code drafts, so a contestant can leave a problem, solve another one first,
 * and come back to exactly what they had (code per language + the language they were using).
 *
 * Storage is the browser's localStorage: offline-first (no server round-trip, works on the
 * closed LAN) and keyed by the signed-in team so teams sharing one lab machine never see
 * each other's code. Pure functions, no React — covered by drafts.test.ts.
 *
 * Only languages the team actually edited are stored (text !== the starter template), so an
 * untouched problem leaves nothing behind and a template update still reaches fresh drafts.
 */

const PREFIX = 'cc-draft:v1';

export interface SavedDraft {
  lang: string;
  drafts: Record<string, string>;
  savedAt: number;
}

const keyFor = (owner: string, slug: string) => `${PREFIX}:${owner}:${slug}`;

function storage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

/** Saved draft merged over the starters, or null when nothing was saved / data is unusable. */
export function loadDraft(
  owner: string,
  slug: string,
  starters: Record<string, string>,
): { lang: string; drafts: Record<string, string>; savedAt: number } | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(keyFor(owner, slug));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedDraft>;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.drafts !== 'object' || parsed.drafts === null) return null;

    const drafts = { ...starters };
    for (const [lang, text] of Object.entries(parsed.drafts)) {
      // Ignore anything that is not a known language with string content (tampered/old data)
      if (lang in starters && typeof text === 'string') drafts[lang] = text;
    }
    const lang = typeof parsed.lang === 'string' && parsed.lang in starters ? parsed.lang : 'python';
    return { lang, drafts, savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0 };
  } catch {
    return null; // corrupt JSON must never break the editor
  }
}

/** Persist the edited languages. Returns the save timestamp, or null if nothing was stored. */
export function saveDraft(
  owner: string,
  slug: string,
  lang: string,
  drafts: Record<string, string>,
  starters: Record<string, string>,
): number | null {
  const store = storage();
  if (!store) return null;
  try {
    const edited: Record<string, string> = {};
    for (const [l, text] of Object.entries(drafts)) {
      if (text !== starters[l]) edited[l] = text;
    }
    if (Object.keys(edited).length === 0) {
      store.removeItem(keyFor(owner, slug));
      return null;
    }
    const savedAt = Date.now();
    store.setItem(keyFor(owner, slug), JSON.stringify({ lang, drafts: edited, savedAt } satisfies SavedDraft));
    return savedAt;
  } catch {
    return null; // quota exceeded / storage disabled: drafting is best-effort, never fatal
  }
}

/** Drop a draft — used once the problem is submitted (its one attempt is spent). */
export function clearDraft(owner: string, slug: string): void {
  try { storage()?.removeItem(keyFor(owner, slug)); } catch { /* best effort */ }
}
