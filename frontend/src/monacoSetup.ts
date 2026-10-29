/**
 * Bundle Monaco locally instead of letting @monaco-editor/react fetch it from
 * cdn.jsdelivr.net — the arena runs on an offline LAN, where the CDN is unreachable.
 * Only the core editor + the four contest languages are included to keep the chunk small.
 */
import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
import 'monaco-editor/esm/vs/editor/editor.all.js';
import 'monaco-editor/esm/vs/basic-languages/python/python.contribution.js';
import 'monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution.js';
import 'monaco-editor/esm/vs/basic-languages/java/java.contribution.js';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker.js?worker';

self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
loader.config({ monaco });
