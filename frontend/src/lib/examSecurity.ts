/**
 * Exam-security helpers: notice acknowledgement, offline retry queue, strike copy.
 *
 * Nothing here is authoritative. Strike count and lock state come from the server
 * (GET /api/security/status); sessionStorage only remembers that this login has
 * read the notice, and which violation reports still need to reach the server.
 */
import type { ViolationType } from '../api';
import { clearTrustedClipboard } from './trustedClipboard';

const NOTICE_PREFIX = 'exam-notice-ack:';
const PENDING_PREFIX = 'exam-pending-violations:';

/** Seconds the security notice stays un-dismissable after it opens. */
export const NOTICE_MIN_READ_SECONDS = 10;

function safeGet(key: string): string | null {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function safeSet(key: string, value: string) {
  try { sessionStorage.setItem(key, value); } catch { /* storage blocked: in-memory state still works */ }
}

export const isNoticeAcknowledged = (userId: number | string) => safeGet(NOTICE_PREFIX + userId) === '1';
export const acknowledgeNotice = (userId: number | string) => safeSet(NOTICE_PREFIX + userId, '1');

// ─── Offline retry queue ─────────────────────────────────────────────────────
// A report that fails on the network is kept (with its original event id) and
// re-sent later. The server ignores ids it already has, so a retry never adds a strike.
export interface PendingViolation { id: string; type: ViolationType }

export function readPending(userId: number | string): PendingViolation[] {
  try {
    const raw = JSON.parse(safeGet(PENDING_PREFIX + userId) ?? '[]');
    return Array.isArray(raw) ? raw.filter((p) => p && typeof p.id === 'string' && typeof p.type === 'string').slice(-20) : [];
  } catch { return []; }
}
export const writePending = (userId: number | string, list: PendingViolation[]) =>
  safeSet(PENDING_PREFIX + userId, JSON.stringify(list.slice(-20)));

/** Called on sign-out: the next login sees the notice again. Strikes live on the server and are NOT reset. */
export function clearExamSecuritySession() {
  clearTrustedClipboard();
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(NOTICE_PREFIX)) sessionStorage.removeItem(key);
    }
  } catch { /* ignore */ }
}

// ─── Strike copy ─────────────────────────────────────────────────────────────
export interface StrikeCopy { title: string; message: string }

export function strikeCopy(count: number): StrikeCopy {
  if (count <= 1) return {
    title: 'Security Warning',
    message: 'You have performed an action that violates the contest security guidelines. This is your first warning. Two more violations will result in your contest session being locked.',
  };
  if (count === 2) return {
    title: 'Final Warning',
    message: 'You have received your second security violation. One more violation will automatically lock your contest session. Please follow the contest security guidelines.',
  };
  return {
    title: 'Contest Session Locked',
    message: 'You have exceeded the maximum permitted security violations. Your contest session has been locked. Your saved code and answers have been preserved. Please contact the contest administrator.',
  };
}

export const VIOLATION_LABELS: Record<ViolationType, string> = {
  TAB_SWITCH: 'Tab switch / window hidden',
  FULLSCREEN_EXIT: 'Exited fullscreen',
  COPY_ATTEMPT: 'Copy attempt',
  CUT_ATTEMPT: 'Cut attempt',
  PASTE_ATTEMPT: 'Paste attempt',
};

export function newEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

// ─── Fullscreen ──────────────────────────────────────────────────────────────
export const fullscreenSupported = () =>
  typeof document !== 'undefined' && !!document.fullscreenEnabled && typeof document.documentElement.requestFullscreen === 'function';

export const isFullscreen = () => typeof document !== 'undefined' && !!document.fullscreenElement;

/** Must be called from a click/keypress handler. Resolves false if the browser refuses. */
export async function enterFullscreen(): Promise<boolean> {
  if (!fullscreenSupported()) return false;
  if (isFullscreen()) return true;
  try {
    await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    return true;
  } catch {
    return false;
  }
}
