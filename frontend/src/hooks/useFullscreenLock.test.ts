import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFullscreenLock, FULLSCREEN_STORAGE_KEY } from './useFullscreenLock';

describe('useFullscreenLock Hook', () => {
  let requestFullscreenMock: ReturnType<typeof vi.fn>;
  let originalFullscreenElement: PropertyDescriptor | undefined;

  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();

    requestFullscreenMock = vi.fn().mockResolvedValue(undefined);
    document.documentElement.requestFullscreen = requestFullscreenMock as unknown as typeof document.documentElement.requestFullscreen;

    originalFullscreenElement = Object.getOwnPropertyDescriptor(document, 'fullscreenElement');
    // Start with not in fullscreen
    Object.defineProperty(document, 'fullscreenElement', {
      value: null,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    if (originalFullscreenElement) {
      Object.defineProperty(document, 'fullscreenElement', originalFullscreenElement);
    }
  });

  it('verifies initial not-fullscreen state with exitCount 0', () => {
    const { result } = renderHook(() => useFullscreenLock());

    expect(result.current.isFullscreen).toBe(false);
    expect(result.current.exitCount).toBe(0);
  });

  it('initializes exitCount from sessionStorage if previously recorded', () => {
    sessionStorage.setItem(FULLSCREEN_STORAGE_KEY, '4');

    const { result } = renderHook(() => useFullscreenLock());

    expect(result.current.exitCount).toBe(4);
    expect(result.current.isFullscreen).toBe(false);
  });

  it('calls document.documentElement.requestFullscreen when enterFullscreen is invoked', async () => {
    const { result } = renderHook(() => useFullscreenLock());

    await act(async () => {
      await result.current.enterFullscreen();
    });

    expect(requestFullscreenMock).toHaveBeenCalledTimes(1);
  });

  it('verifies entering fullscreen transitions isFullscreen to true without triggering violation', () => {
    const violationListener = vi.fn();
    window.addEventListener('contest:violation', violationListener);

    const { result } = renderHook(() => useFullscreenLock());
    expect(result.current.isFullscreen).toBe(false);
    expect(result.current.exitCount).toBe(0);

    // Simulate transition into fullscreen
    act(() => {
      Object.defineProperty(document, 'fullscreenElement', {
        value: document.documentElement,
        configurable: true,
      });
      document.dispatchEvent(new Event('fullscreenchange'));
    });

    expect(result.current.isFullscreen).toBe(true);
    expect(result.current.exitCount).toBe(0);
    expect(violationListener).not.toHaveBeenCalled();

    window.removeEventListener('contest:violation', violationListener);
  });

  it('verifies fullscreenchange exit triggers increment on exitCount, updates sessionStorage, and dispatches contest:violation', () => {
    const violationListener = vi.fn();
    window.addEventListener('contest:violation', violationListener);

    // Initial hook starts not in fullscreen
    const { result } = renderHook(() => useFullscreenLock());
    expect(result.current.exitCount).toBe(0);

    // Enter fullscreen
    act(() => {
      Object.defineProperty(document, 'fullscreenElement', {
        value: document.documentElement,
        configurable: true,
      });
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    expect(result.current.isFullscreen).toBe(true);
    expect(result.current.exitCount).toBe(0);

    // Exit fullscreen (user pressed Esc or switched windows)
    act(() => {
      Object.defineProperty(document, 'fullscreenElement', {
        value: null,
        configurable: true,
      });
      document.dispatchEvent(new Event('fullscreenchange'));
    });

    expect(result.current.isFullscreen).toBe(false);
    expect(result.current.exitCount).toBe(1);
    expect(sessionStorage.getItem(FULLSCREEN_STORAGE_KEY)).toBe('1');
    expect(violationListener).toHaveBeenCalledTimes(1);

    const event = violationListener.mock.calls[0][0] as CustomEvent;
    expect(event.detail).toEqual({ type: 'fullscreen_exit', count: 1 });

    // Second exit after re-entering
    act(() => {
      Object.defineProperty(document, 'fullscreenElement', {
        value: document.documentElement,
        configurable: true,
      });
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    expect(result.current.isFullscreen).toBe(true);

    act(() => {
      Object.defineProperty(document, 'fullscreenElement', {
        value: null,
        configurable: true,
      });
      document.dispatchEvent(new Event('fullscreenchange'));
    });

    expect(result.current.isFullscreen).toBe(false);
    expect(result.current.exitCount).toBe(2);
    expect(sessionStorage.getItem(FULLSCREEN_STORAGE_KEY)).toBe('2');
    expect(violationListener).toHaveBeenCalledTimes(2);

    window.removeEventListener('contest:violation', violationListener);
  });

  it('cleans up event listener on unmount', () => {
    const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');
    const { unmount } = renderHook(() => useFullscreenLock());

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('fullscreenchange', expect.any(Function));
    removeEventListenerSpy.mockRestore();
  });
});
