/**
 * useCopyPasteGuard — blocks copy / cut / paste / drag-drop inside ONE element.
 *
 * Scope: listeners attach to the element behind `ref` (the exam workspace), never
 * to `document`, so login, admin and every other page keep normal clipboard use.
 *
 * All listeners run in the *capture* phase on the container, so they fire before
 * Monaco's own handlers on its hidden <textarea> and stop the event there.
 *
 * This is a deterrent, not a security boundary: screenshots, devtools, extensions
 * or a second device are out of reach for any web page.
 */
import { useEffect, useRef } from 'react';

export type BlockedAction = 'copy' | 'cut' | 'paste' | 'drop' | 'contextmenu' | 'drag';

/** True for the keyboard shortcuts that copy, cut or paste. */
export function isClipboardShortcut(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey'>): BlockedAction | null {
  const key = e.key.toLowerCase();
  const mod = e.ctrlKey || e.metaKey;
  if (mod && key === 'c') return 'copy';
  if (mod && key === 'x') return 'cut';
  if (mod && key === 'v') return 'paste';
  if (mod && key === 'insert') return 'copy';        // Ctrl+Insert
  if (e.shiftKey && key === 'insert') return 'paste'; // Shift+Insert
  if (e.shiftKey && key === 'delete') return 'cut';   // Shift+Delete
  return null;
}

/**
 * @param el  the protected container; pass it via a callback ref (`ref={setEl}`)
 *            so the guard attaches even when the element mounts after a loading state.
 */
export function useCopyPasteGuard(
  el: HTMLElement | null,
  enabled: boolean,
  onBlocked?: (action: BlockedAction) => void,
) {
  const onBlockedRef = useRef(onBlocked);
  useEffect(() => { onBlockedRef.current = onBlocked; }, [onBlocked]);

  useEffect(() => {
    if (!enabled || !el) return;

    const block = (action: BlockedAction, notify = true) => (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      if (notify) onBlockedRef.current?.(action);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const action = isClipboardShortcut(e);
      // Held keys auto-repeat: still blocked, but only the first press is reported
      if (action) block(action, !e.repeat)(e);
    };

    // Mobile / IME paste paths that skip the `paste` event
    const onBeforeInput = (e: Event) => {
      const type = (e as InputEvent).inputType;
      if (type === 'insertFromPaste' || type === 'insertFromDrop' || type === 'insertFromPasteAsQuotation') block('paste')(e);
    };

    const handlers: Array<[string, EventListener]> = [
      ['copy', block('copy')],
      ['cut', block('cut')],
      ['paste', block('paste')],
      ['drop', block('drop')],
      ['dragstart', block('drag')],
      ['contextmenu', block('contextmenu')],
      ['keydown', onKeyDown as EventListener],
      ['beforeinput', onBeforeInput],
    ];
    handlers.forEach(([type, fn]) => el.addEventListener(type, fn, true));
    return () => handlers.forEach(([type, fn]) => el.removeEventListener(type, fn, true));
  }, [el, enabled]);
}
