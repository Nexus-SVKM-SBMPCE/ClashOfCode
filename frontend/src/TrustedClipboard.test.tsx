import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCopyPasteGuard, EXAM_EDITOR_ATTR } from './hooks/useCopyPasteGuard';
import { clearTrustedClipboard, isTrustedPaste, registerEditorSelection, rememberTrustedCopy, TRUSTED_CLIPBOARD_PREFIX } from './lib/trustedClipboard';
import { clearExamSecuritySession } from './lib/examSecurity';

/** jsdom has no ClipboardEvent constructor with data: fake one with a clipboardData stub. */
function clip(type: string, text = '') {
  const store: Record<string, string> = { 'text/plain': text };
  const ev = new Event(type, { bubbles: true, cancelable: true }) as Event & { clipboardData: unknown };
  ev.clipboardData = { getData: (k: string) => store[k] ?? '', setData: (k: string, v: string) => { store[k] = v; } };
  return ev;
}
const key = (init: KeyboardEventInit) => new KeyboardEvent('keydown', { ...init, bubbles: true, cancelable: true });

function setup(scope: string | null = '7') {
  const zone = document.createElement('div');
  const statement = document.createElement('p');
  statement.textContent = 'Given N numbers…';
  const editor = document.createElement('div');
  editor.setAttribute(EXAM_EDITOR_ATTR, '');
  const textarea = document.createElement('textarea'); // Monaco's hidden input
  editor.appendChild(textarea);
  zone.append(statement, editor);
  document.body.appendChild(zone);
  const onBlocked = vi.fn();
  const hook = renderHook(() => useCopyPasteGuard(zone, true, onBlocked, { scope: scope ?? undefined }));
  return { zone, statement, editor, textarea, onBlocked, hook };
}

afterEach(() => { clearTrustedClipboard(); document.body.innerHTML = ''; });

describe('question display stays protected', () => {
  it.each(['copy', 'cut', 'paste', 'contextmenu', 'dragstart'])('blocks %s on question text', (type) => {
    const { statement, onBlocked } = setup();
    const ev = type === 'contextmenu' || type === 'dragstart' ? new Event(type, { bubbles: true, cancelable: true }) : clip(type, 'x');
    statement.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(onBlocked).toHaveBeenCalled();
  });
  it('blocks Ctrl+C / Cmd+C on question text', () => {
    const { statement } = setup();
    for (const init of [{ key: 'c', ctrlKey: true }, { key: 'c', metaKey: true }]) {
      const ev = key(init); statement.dispatchEvent(ev); expect(ev.defaultPrevented).toBe(true);
    }
  });
  it('blocks dropping (dragged question text) into the editor', () => {
    const { textarea, onBlocked } = setup();
    const ev = new Event('drop', { bubbles: true, cancelable: true });
    textarea.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(onBlocked).toHaveBeenCalledWith('drop');
  });
});

describe('code editor clipboard', () => {
  it.each([
    { key: 'c', ctrlKey: true }, { key: 'x', ctrlKey: true }, { key: 'v', ctrlKey: true },
    { key: 'c', metaKey: true }, { key: 'x', metaKey: true }, { key: 'v', metaKey: true },
    { key: 'a', ctrlKey: true }, { key: 'z', ctrlKey: true }, { key: 'y', ctrlKey: true }, { key: 'z', metaKey: true, shiftKey: true },
  ])('lets editor shortcut %o through', (init) => {
    const { textarea, onBlocked } = setup();
    const ev = key(init); textarea.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    expect(onBlocked).not.toHaveBeenCalled();
  });

  it('copy and cut pass through without a violation and become trusted', () => {
    const { textarea, onBlocked } = setup();
    const unreg = registerEditorSelection(() => 'int main() {}');
    const c = clip('copy'); textarea.dispatchEvent(c);
    expect(c.defaultPrevented).toBe(false);
    registerEditorSelection(() => 'void helper();');
    const x = clip('cut'); textarea.dispatchEvent(x);
    expect(x.defaultPrevented).toBe(false);
    expect(onBlocked).not.toHaveBeenCalled();
    expect(isTrustedPaste('7', 'int main() {}')).toBe(true);
    expect(isTrustedPaste('7', 'void helper();')).toBe(true);
    unreg();
  });

  it('records the clipboard payload Monaco writes (empty-selection line copy)', () => {
    const { editor, textarea } = setup();
    editor.addEventListener('copy', (e) => (e as unknown as { clipboardData: DataTransfer }).clipboardData.setData('text/plain', 'cout << x;\n'));
    textarea.dispatchEvent(clip('copy'));
    expect(isTrustedPaste('7', 'cout << x;')).toBe(true);
  });

  it('allows pasting trusted code (CRLF/trailing whitespace tolerant), no violation', () => {
    const { textarea, onBlocked } = setup();
    rememberTrustedCopy('7', 'a\nb');
    const p = clip('paste', 'a\r\nb\r\n'); textarea.dispatchEvent(p);
    expect(p.defaultPrevented).toBe(false);
    const bi = new InputEvent('beforeinput', { inputType: 'insertFromPaste', bubbles: true, cancelable: true });
    textarea.dispatchEvent(bi);
    expect(bi.defaultPrevented).toBe(false);
    expect(onBlocked).not.toHaveBeenCalled();
  });

  it('rejects external paste into the editor and reports it', () => {
    const { textarea, onBlocked } = setup();
    rememberTrustedCopy('7', 'mine');
    const p = clip('paste', 'from stackoverflow'); textarea.dispatchEvent(p);
    expect(p.defaultPrevented).toBe(true);
    expect(onBlocked).toHaveBeenCalledWith('paste');
  });

  it('blocks paste-type beforeinput not vetted by a paste event', () => {
    const { textarea } = setup();
    const bi = new InputEvent('beforeinput', { inputType: 'insertFromPaste', bubbles: true, cancelable: true });
    textarea.dispatchEvent(bi);
    expect(bi.defaultPrevented).toBe(true);
  });

  it('cross-question reuse: copy in editor instance 1, paste in a fresh instance 2', () => {
    const first = setup();
    const unreg = registerEditorSelection(() => '#include <bits/stdc++.h>');
    first.textarea.dispatchEvent(clip('copy'));
    unreg(); first.hook.unmount(); document.body.innerHTML = '';
    const second = setup();
    const p = clip('paste', '#include <bits/stdc++.h>'); second.textarea.dispatchEvent(p);
    expect(p.defaultPrevented).toBe(false);
    expect(second.onBlocked).not.toHaveBeenCalled();
  });

  it('is scoped per contestant and cleared on sign-out', () => {
    rememberTrustedCopy('7', 'secret');
    expect(isTrustedPaste('8', 'secret')).toBe(false);
    expect(sessionStorage.getItem(TRUSTED_CLIPBOARD_PREFIX + '7')).toContain('secret');
    clearExamSecuritySession();
    expect(isTrustedPaste('7', 'secret')).toBe(false);
    expect(sessionStorage.getItem(TRUSTED_CLIPBOARD_PREFIX + '7')).toBeNull();
  });

  it('without a scope the editor is protected like everything else (legacy behaviour)', () => {
    const { textarea } = setup(null);
    const ev = key({ key: 'v', ctrlKey: true }); textarea.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });
});
