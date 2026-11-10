/**
 * useCopyPasteGuard — blocks copy / cut / paste / drag-drop inside ONE element.
 *
 * Scope: listeners attach to the element behind `ref` (the exam workspace), never
 * to `document`, so login, admin and every other page keep normal clipboard use.
 *
 * All listeners run in the *capture* phase on the container, so they fire before
 * Monaco's own handlers on its hidden <textarea> and stop the event there.
 *
 * Exception — the code editor (an ancestor carrying `data-exam-editor`), when a `scope` is given:
 * copy/cut pass through and are recorded in the trusted clipboard; paste passes only if the
 * clipboard text matches trusted code. Drag/drop and the context menu stay blocked everywhere.
 *
 * This is a deterrent, not a security boundary: screenshots, devtools, extensions
 * or a second device are out of reach for any web page.
 */
import { useEffect, useRef } from 'react';
import { isTrustedPaste, readEditorSelection, rememberTrustedCopy } from '../lib/trustedClipboard';

/** Marks the code-editor container. Copy/cut there is allowed; paste only of trusted code. */
export const EXAM_EDITOR_ATTR = 'data-exam-editor';

export interface EditorClipboardOptions {
  /** Trusted-clipboard scope (the contestant's id). Without it the editor is protected like everything else. */
  scope?: string;
}

const inEditor = (t: EventTarget | null) =>
  t instanceof Element && !!t.closest(`[${EXAM_EDITOR_ATTR}]`);

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
  options: EditorClipboardOptions = {},
) {
  const { scope } = options;
  const onBlockedRef = useRef(onBlocked);
  useEffect(() => { onBlockedRef.current = onBlocked; }, [onBlocked]);

  useEffect(() => {
    if (!enabled || !el) return;

    const block = (action: BlockedAction, notify = true) => (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      if (notify) onBlockedRef.current?.(action);
    };

    const editorOk = (e: Event) => scope != null && inEditor(e.target);

    // Copy / cut of the contestant's own code: let Monaco handle it, remember it as trusted.
    const onCopyOrCut = (action: 'copy' | 'cut') => (e: Event) => {
      if (!editorOk(e)) return block(action)(e);
      const text = readEditorSelection();
      if (text) rememberTrustedCopy(scope!, text);
    };
    // Bubble phase: Monaco has now written the real clipboard payload (covers empty-selection line copy).
    const onCopyOrCutAfter = (e: Event) => {
      if (!editorOk(e)) return;
      const data = (e as ClipboardEvent).clipboardData?.getData('text/plain');
      if (data) rememberTrustedCopy(scope!, data);
    };

    // Paste into the editor only when it matches code previously copied from the editor.
    let pasteApproved = false;
    const onPaste = (e: Event) => {
      pasteApproved = false;
      if (editorOk(e)) {
        const data = (e as ClipboardEvent).clipboardData?.getData('text/plain') ?? '';
        if (isTrustedPaste(scope!, data)) {
          pasteApproved = true;
          setTimeout(() => { pasteApproved = false; }, 0);
          return;
        }
      }
      block('paste')(e);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const action = isClipboardShortcut(e);
      // Inside the editor the shortcut proceeds; the resulting copy/cut/paste event decides.
      if (action && editorOk(e)) return;
      // Held keys auto-repeat: still blocked, but only the first press is reported
      if (action) block(action, !e.repeat)(e);
    };

    // Mobile / IME paste paths that skip the `paste` event
    const onBeforeInput = (e: Event) => {
      const type = (e as InputEvent).inputType;
      if (type === 'insertFromDrop') return block('paste')(e);
      if (type === 'insertFromPaste' || type === 'insertFromPasteAsQuotation') {
        if (pasteApproved && editorOk(e)) return; // the paste event already vetted this
        block('paste')(e);
      }
    };

    const handlers: Array<[string, EventListener]> = [
      ['copy', onCopyOrCut('copy')],
      ['cut', onCopyOrCut('cut')],
      ['paste', onPaste],
      ['drop', block('drop')],
      ['dragstart', block('drag')],
      ['contextmenu', block('contextmenu')],
      ['keydown', onKeyDown as EventListener],
      ['beforeinput', onBeforeInput],
    ];
    handlers.forEach(([type, fn]) => el.addEventListener(type, fn, true));
    el.addEventListener('copy', onCopyOrCutAfter);
    el.addEventListener('cut', onCopyOrCutAfter);
    return () => {
      handlers.forEach(([type, fn]) => el.removeEventListener(type, fn, true));
      el.removeEventListener('copy', onCopyOrCutAfter);
      el.removeEventListener('cut', onCopyOrCutAfter);
    };
  }, [el, enabled, scope]);
}
