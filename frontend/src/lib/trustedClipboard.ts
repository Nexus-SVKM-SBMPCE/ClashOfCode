/**
 * Trusted clipboard — remembers code the contestant copied/cut FROM the contest editor,
 * so pasting it back (same or another quest) is allowed while other clipboard text is refused.
 *
 * Honest limits: browsers cannot tell where clipboard text came from. We only compare the
 * pasted text against what was copied out of the editor. Identical text obtained elsewhere
 * would match; text inserted through paths that fire no `paste` event (OS automation,
 * extensions, devtools) is outside any web page's reach.
 *
 * Scope: one store per contestant (keyed by user id) in sessionStorage — survives refresh
 * in this tab, never shared across users, wiped on sign-out by clearExamSecuritySession().
 */
export const TRUSTED_CLIPBOARD_PREFIX = 'cc_trusted_clip_';
const MAX_ENTRIES = 25;
const MAX_CHARS = 200_000;

const memory = new Map<string, string[]>();

/** CRLF/CR → LF and ignore trailing whitespace, so OS clipboard round-trips still match. */
export const normalizeClip = (text: string) => text.replace(/\r\n?/g, '\n').replace(/\s+$/, '');

function load(scope: string): string[] {
  const cached = memory.get(scope);
  if (cached) return cached;
  let list: string[] = [];
  try {
    const raw = sessionStorage.getItem(TRUSTED_CLIPBOARD_PREFIX + scope);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) list = parsed.filter((x): x is string => typeof x === 'string');
  } catch { /* storage unavailable: memory only */ }
  memory.set(scope, list);
  return list;
}

export function rememberTrustedCopy(scope: string, text: string) {
  const clip = normalizeClip(text);
  if (!clip || clip.length > MAX_CHARS) return;
  const list = [clip, ...load(scope).filter((x) => x !== clip)].slice(0, MAX_ENTRIES);
  memory.set(scope, list);
  try { sessionStorage.setItem(TRUSTED_CLIPBOARD_PREFIX + scope, JSON.stringify(list)); } catch { /* ignore */ }
}

export function isTrustedPaste(scope: string, text: string): boolean {
  const clip = normalizeClip(text);
  if (!clip) return true; // empty paste inserts nothing
  return load(scope).includes(clip);
}

export function clearTrustedClipboard() {
  memory.clear();
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(TRUSTED_CLIPBOARD_PREFIX)) sessionStorage.removeItem(key);
    }
  } catch { /* ignore */ }
}

// ─── Active editor selection (registered by the Monaco editor on mount) ─────────────
type SelectionReader = () => string;
let activeReader: SelectionReader | null = null;

/** ProblemPage registers a reader for the mounted editor; returns an unregister fn. */
export function registerEditorSelection(reader: SelectionReader) {
  activeReader = reader;
  return () => { if (activeReader === reader) activeReader = null; };
}

export const readEditorSelection = () => {
  try { return activeReader?.() ?? ''; } catch { return ''; }
};
