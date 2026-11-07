import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useCopyPasteGuard, isClipboardShortcut } from './hooks/useCopyPasteGuard';
import { useSecurityMonitor, CLIENT_DEDUPE_MS } from './hooks/useSecurityMonitor';
import { ExamSecurityProvider, useExamSecurity } from './ExamSecurity';
import { clearExamSecuritySession, readPending, strikeCopy, NOTICE_MIN_READ_SECONDS } from './lib/examSecurity';
import { useAuth } from './AuthContext';
import { useCountdownTimer, type CountdownState } from './useCountdownTimer';
import { getSecurityStatus, reportViolation, type SecurityStatus } from './api';

vi.mock('./AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('./useCountdownTimer', () => ({ useCountdownTimer: vi.fn() }));
vi.mock('./api', () => ({ getSecurityStatus: vi.fn(), reportViolation: vi.fn() }));

const ok = <T,>(data: T) => Promise.resolve({ data } as never);

function status(count: number, extra: Partial<SecurityStatus> = {}): SecurityStatus {
  return { count, max_strikes: 3, locked: count >= 3, recorded: true, contest_live: true, batch_id: 1, ...extra };
}

/** Server double: counts every report it receives, locks at 3, ignores repeated ids. */
function fakeServer(start = 0) {
  let count = start;
  const seen = new Set<string>();
  vi.mocked(getSecurityStatus).mockImplementation(() => ok(status(count, { recorded: false })));
  vi.mocked(reportViolation).mockImplementation((id: string) => {
    if (seen.has(id) || count >= 3) return ok(status(count, { recorded: false }));
    seen.add(id);
    count += 1;
    return ok(status(count));
  });
  return { get count() { return count; } };
}

function setVisibility(state: 'hidden' | 'visible') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

let fsElement: Element | null = null;
function setFullscreen(on: boolean) {
  fsElement = on ? document.documentElement : null;
  document.dispatchEvent(new Event('fullscreenchange'));
}

/** Move the clock past the client same-incident window. */
let now = 1_000_000;
const advance = (ms = CLIENT_DEDUPE_MS + 1) => { now += ms; };

function timer(s: CountdownState['status']): CountdownState {
  return { status: s, displayTime: '00:59:00', batchName: 'Batch 1', isPulsing: false, remainingSeconds: 3540 };
}

function auth(role: 'admin' | 'contestant' | null) {
  vi.mocked(useAuth).mockReturnValue({
    user: role ? { id: 7, username: 'team7', display_name: 'Team 7', role } : null,
    loading: false, signIn: vi.fn(), signOut: vi.fn(),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  fsElement = null;
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fsElement });
  setVisibility('visible');
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  fakeServer();
});

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

// ─── Copy-paste guard ────────────────────────────────────────────────────────
describe('useCopyPasteGuard', () => {
  function setup(enabled: boolean) {
    const zone = document.createElement('div');
    const field = document.createElement('textarea');
    const outside = document.createElement('input');
    zone.appendChild(field);
    document.body.append(zone, outside);
    const onBlocked = vi.fn();
    const hook = renderHook(({ on }) => useCopyPasteGuard(zone, on, onBlocked), { initialProps: { on: enabled } });
    return { zone, field, outside, onBlocked, hook };
  }

  it.each(['copy', 'cut', 'paste', 'drop', 'contextmenu'])('blocks %s inside the protected zone', (type) => {
    const { field, onBlocked } = setup(true);
    const ev = new Event(type, { bubbles: true, cancelable: true });
    field.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(onBlocked).toHaveBeenCalledWith(type);
  });

  it.each([
    [{ key: 'c', ctrlKey: true }], [{ key: 'x', ctrlKey: true }], [{ key: 'v', ctrlKey: true }],
    [{ key: 'v', metaKey: true }], [{ key: 'Insert', shiftKey: true }], [{ key: 'Insert', ctrlKey: true }],
  ])('blocks clipboard shortcut %o', (init) => {
    const { field } = setup(true);
    const ev = new KeyboardEvent('keydown', { ...init, bubbles: true, cancelable: true });
    field.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  it('blocks a held (auto-repeating) shortcut but reports only the first press', () => {
    const { field, onBlocked } = setup(true);
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true, cancelable: true }));
    const repeat = new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, repeat: true, bubbles: true, cancelable: true });
    field.dispatchEvent(repeat);
    expect(repeat.defaultPrevented).toBe(true);
    expect(onBlocked).toHaveBeenCalledTimes(1);
  });

  it('leaves normal typing and Ctrl+A / Ctrl+Z alone', () => {
    const { field } = setup(true);
    for (const init of [{ key: 'a' }, { key: 'a', ctrlKey: true }, { key: 'z', ctrlKey: true }]) {
      const ev = new KeyboardEvent('keydown', { ...init, bubbles: true, cancelable: true });
      field.dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(false);
    }
  });

  it('does not touch fields outside the zone', () => {
    const { outside } = setup(true);
    const ev = new Event('paste', { bubbles: true, cancelable: true });
    outside.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });

  it('removes listeners when disabled', () => {
    const { field, hook } = setup(true);
    hook.rerender({ on: false });
    const ev = new Event('paste', { bubbles: true, cancelable: true });
    field.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });

  it('classifies shortcuts', () => {
    expect(isClipboardShortcut({ key: 'C', ctrlKey: true, metaKey: false, shiftKey: true })).toBe('copy');
    expect(isClipboardShortcut({ key: 'Delete', ctrlKey: false, metaKey: false, shiftKey: true })).toBe('cut');
    expect(isClipboardShortcut({ key: 'c', ctrlKey: false, metaKey: false, shiftKey: false })).toBeNull();
  });
});

// ─── Unified violation monitor ───────────────────────────────────────────────
describe('useSecurityMonitor', () => {
  it('walks strike 1 → 2 → 3 (lock) with the server as the source of truth', async () => {
    const { result } = renderHook(() => useSecurityMonitor(7, true));
    await waitFor(() => expect(getSecurityStatus).toHaveBeenCalled());

    act(() => { result.current.report('COPY_ATTEMPT'); });
    await waitFor(() => expect(result.current.warningCount).toBe(1));
    act(() => result.current.dismissWarning());

    advance();
    act(() => setVisibility('hidden'));
    act(() => setVisibility('visible'));
    await waitFor(() => expect(result.current.warningCount).toBe(2));

    advance();
    act(() => { result.current.report('PASTE_ATTEMPT'); });
    await waitFor(() => expect(result.current.locked).toBe(true));
    expect(result.current.count).toBe(3);
    expect(result.current.warningCount).toBeNull(); // the lock replaces the warning

    advance();
    act(() => { expect(result.current.report('TAB_SWITCH')).toBe(false); }); // ignored once locked
  });

  it('counts one strike for one action (fullscreen exit + visibility change, keydown + copy)', async () => {
    const { result } = renderHook(() => useSecurityMonitor(7, true));
    act(() => setFullscreen(true));
    act(() => { setFullscreen(false); setVisibility('hidden'); }); // Ctrl+Tab out of fullscreen
    await waitFor(() => expect(reportViolation).toHaveBeenCalledTimes(1));
    expect(vi.mocked(reportViolation).mock.calls[0][1]).toBe('FULLSCREEN_EXIT');

    act(() => { result.current.report('COPY_ATTEMPT'); result.current.report('COPY_ATTEMPT'); });
    expect(reportViolation).toHaveBeenCalledTimes(1); // still inside the same window
  });

  it('records a fullscreen exit only after the page was fullscreen', async () => {
    renderHook(() => useSecurityMonitor(7, true));
    act(() => setFullscreen(false)); // never entered: no strike
    expect(reportViolation).not.toHaveBeenCalled();
    act(() => setFullscreen(true));
    act(() => setFullscreen(false));
    await waitFor(() => expect(reportViolation).toHaveBeenCalledTimes(1));
  });

  it('never counts a page refresh / unload', () => {
    renderHook(() => useSecurityMonitor(7, true));
    act(() => { window.dispatchEvent(new Event('beforeunload')); setVisibility('hidden'); });
    expect(reportViolation).not.toHaveBeenCalled();
  });

  it('resumes counting if the unload never happens (cancelled navigation / back-forward cache)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    renderHook(() => useSecurityMonitor(7, true));
    act(() => { window.dispatchEvent(new Event('beforeunload')); });
    act(() => { vi.advanceTimersByTime(1500); }); // page is still here
    act(() => { setVisibility('hidden'); });
    vi.useRealTimers();
    await waitFor(() => expect(reportViolation).toHaveBeenCalledTimes(1));

    advance();
    act(() => { window.dispatchEvent(new Event('pagehide')); window.dispatchEvent(new Event('pageshow')); });
    act(() => { setVisibility('visible'); setVisibility('hidden'); });
    await waitFor(() => expect(reportViolation).toHaveBeenCalledTimes(2));
  });

  it('does nothing while not enforcing (before acknowledgement / contest not live)', () => {
    const { result } = renderHook(() => useSecurityMonitor(7, false));
    act(() => setVisibility('hidden'));
    act(() => { result.current.report('COPY_ATTEMPT'); });
    expect(reportViolation).not.toHaveBeenCalled();
  });

  it('restores the server count and lock on mount (refresh / re-login)', async () => {
    fakeServer(3);
    const { result } = renderHook(() => useSecurityMonitor(7, true));
    await waitFor(() => expect(result.current.locked).toBe(true));
    expect(result.current.count).toBe(3);
  });

  it('a network failure adds no strike; the queued report is re-sent with the same id', async () => {
    const server = fakeServer();
    vi.mocked(reportViolation).mockImplementationOnce(() => Promise.reject(new Error('Network Error')));
    const { result } = renderHook(() => useSecurityMonitor(7, true));
    act(() => { result.current.report('TAB_SWITCH'); });
    await waitFor(() => expect(readPending(7)).toHaveLength(1));
    const queuedId = readPending(7)[0].id;
    expect(server.count).toBe(0);

    act(() => { window.dispatchEvent(new Event('online')); });
    await waitFor(() => expect(server.count).toBe(1));
    expect(vi.mocked(reportViolation).mock.calls.at(-1)?.[0]).toBe(queuedId);
    expect(readPending(7)).toHaveLength(0);
  });
});

// ─── Provider: login → notice → enforcement ──────────────────────────────────
function Probe() {
  const s = useExamSecurity();
  return <span data-testid="probe">{`${s.monitoring}:${s.violations}:${s.locked}`}</span>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ExamSecurityProvider><Probe /></ExamSecurityProvider>
    </MemoryRouter>,
  );
}

function pasteOnBody() {
  const ev = new Event('paste', { bubbles: true, cancelable: true });
  document.body.dispatchEvent(ev);
  return ev;
}

describe('ExamSecurityProvider', () => {
  it('logged-out visitors: no notice, no restrictions, no monitoring', () => {
    auth(null);
    vi.mocked(useCountdownTimer).mockReturnValue(timer('ACTIVE'));
    renderAt('/login');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(pasteOnBody().defaultPrevented).toBe(false);
    act(() => setVisibility('hidden'));
    expect(reportViolation).not.toHaveBeenCalled();
  });

  it('admins never see the notice and are never monitored', () => {
    auth('admin');
    vi.mocked(useCountdownTimer).mockReturnValue(timer('ACTIVE'));
    renderAt('/leaderboard');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(pasteOnBody().defaultPrevented).toBe(false);
    expect(screen.getByTestId('probe').textContent).toBe('false:null:false');
  });

  it('shows the notice right after login on any route, locks the button for 10 s, lists what is not allowed', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    auth('contestant');
    vi.mocked(useCountdownTimer).mockReturnValue(timer('NOT_STARTED')); // even before the contest starts
    renderAt('/problems');

    expect(screen.getByRole('dialog', { name: 'Examination Security Guidelines' })).toBeTruthy();
    for (const item of ['Copying, cutting or pasting', 'Switching tabs or windows', 'Leaving fullscreen', 'Using outside help']) {
      expect(screen.getByText(new RegExp(item))).toBeTruthy();
    }
    const button = screen.getByRole('button', { name: /Please read the rules/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(screen.getByRole('dialog')).toBeTruthy(); // cannot be dismissed yet
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeTruthy();

    for (let i = 0; i < NOTICE_MIN_READ_SECONDS - 1; i++) act(() => { vi.advanceTimersByTime(1000); });
    expect((screen.getByRole('button', { name: /Please read the rules \(1s\)/ }) as HTMLButtonElement).disabled).toBe(true);
    act(() => { vi.advanceTimersByTime(1000); });
    const ready = screen.getByRole('button', { name: 'I Understand & Continue' }) as HTMLButtonElement;
    expect(ready.disabled).toBe(false);
    fireEvent.click(ready);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('starts enforcing only after acknowledgement, during a live contest', async () => {
    auth('contestant');
    vi.mocked(useCountdownTimer).mockReturnValue(timer('ACTIVE'));
    renderAt('/problems/two-sum');
    expect(pasteOnBody().defaultPrevented).toBe(false); // notice still open: not enforcing yet
    act(() => setVisibility('hidden'));
    expect(reportViolation).not.toHaveBeenCalled();
    expect(screen.getByTestId('probe').textContent).toMatch(/^false:/);
  });

  it('acknowledged + live: paste is blocked, reported, and warning 1 → 2 → lock appear', async () => {
    auth('contestant');
    vi.mocked(useCountdownTimer).mockReturnValue(timer('ACTIVE'));
    sessionStorage.setItem('exam-notice-ack:7', '1');
    renderAt('/problems/two-sum');
    await waitFor(() => expect(screen.getByTestId('probe').textContent).toBe('true:0:false'));

    act(() => { expect(pasteOnBody().defaultPrevented).toBe(true); });
    await waitFor(() => expect(reportViolation).toHaveBeenCalled());
    expect(vi.mocked(reportViolation).mock.calls[0][1]).toBe('PASTE_ATTEMPT');
    const w1 = await screen.findByRole('alertdialog', { name: 'Security Warning' });
    expect(w1.textContent).toContain(strikeCopy(1).message);
    expect(w1.textContent).toContain('1 / 3 Violations');
    fireEvent.click(screen.getByRole('button', { name: 'Return to the Contest' }));

    advance();
    act(() => { setVisibility('hidden'); setVisibility('visible'); });
    const w2 = await screen.findByRole('alertdialog', { name: 'Final Warning' });
    expect(w2.textContent).toContain('2 / 3 Violations');
    fireEvent.click(screen.getByRole('button', { name: 'Return to the Contest' }));

    advance();
    act(() => { pasteOnBody(); });
    const locked = await screen.findByRole('alertdialog', { name: 'Contest Session Locked' });
    expect(locked.textContent).toContain(strikeCopy(3).message);
    expect(locked.textContent).toContain('3 / 3 Violations');
    await waitFor(() => expect(screen.getByTestId('probe').textContent).toBe('true:3:true'));
  });

  it('a locked attempt is restored after refresh / re-login, notice acknowledgement is separate', async () => {
    fakeServer(3);
    auth('contestant');
    vi.mocked(useCountdownTimer).mockReturnValue(timer('ACTIVE'));
    sessionStorage.setItem('exam-notice-ack:7', '1');
    renderAt('/problems');
    expect(await screen.findByRole('alertdialog', { name: 'Contest Session Locked' })).toBeTruthy();
  });

  it('sign-out clears only the notice acknowledgement (strikes stay on the server)', () => {
    sessionStorage.setItem('exam-notice-ack:7', '1');
    sessionStorage.setItem('exam-pending-violations:7', '[{"id":"abcdefgh1","type":"TAB_SWITCH"}]');
    clearExamSecuritySession();
    expect(sessionStorage.getItem('exam-notice-ack:7')).toBeNull();
    expect(readPending(7)).toHaveLength(1); // undelivered reports are not discarded
  });

  it('nothing is enforced after the contest has ended', () => {
    auth('contestant');
    vi.mocked(useCountdownTimer).mockReturnValue(timer('COMPLETED'));
    sessionStorage.setItem('exam-notice-ack:7', '1');
    renderAt('/problems');
    expect(pasteOnBody().defaultPrevented).toBe(false);
    act(() => setVisibility('hidden'));
    expect(reportViolation).not.toHaveBeenCalled();
  });

  it('asks for fullscreen when enforcing and not fullscreen (e.g. after a refresh)', async () => {
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => true });
    const request = vi.fn(() => Promise.resolve());
    Object.defineProperty(document.documentElement, 'requestFullscreen', { configurable: true, value: request });
    try {
      auth('contestant');
      vi.mocked(useCountdownTimer).mockReturnValue(timer('ACTIVE'));
      sessionStorage.setItem('exam-notice-ack:7', '1');
      renderAt('/problems');
      fireEvent.click(await screen.findByRole('button', { name: 'Enter Fullscreen' }));
      expect(request).toHaveBeenCalled();
      expect(reportViolation).not.toHaveBeenCalled(); // a refresh is not a violation
    } finally {
      Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => false });
      delete (document.documentElement as unknown as Record<string, unknown>).requestFullscreen;
    }
  });
});
