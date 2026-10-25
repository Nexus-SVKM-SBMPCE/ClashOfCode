import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Editor from '@monaco-editor/react';
import { getProblem, submitCode, getMySubmissions } from '../api';
import type { ProblemDetail, Submission } from '../api';

const LANGUAGES = [
  { id: 'python', label: 'Python 3.8', ext: 'py' },
  { id: 'cpp',    label: 'C++ (GCC 7.4)', ext: 'cpp' },
  { id: 'c',      label: 'C (GCC 7.4)',   ext: 'c' },
  { id: 'java',   label: 'Java 13',        ext: 'java' },
];

const STARTERS: Record<string, string> = {
  python: `# Read input and write output
import sys
input = sys.stdin.readline

def solve():
    pass

solve()
`,
  cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);
    
    // Your solution here
    
    return 0;
}
`,
  c: `#include <stdio.h>
#include <stdlib.h>

int main() {
    // Your solution here
    
    return 0;
}
`,
  java: `import java.util.*;
import java.io.*;

public class Main {
    public static void main(String[] args) throws IOException {
        Scanner sc = new Scanner(System.in);
        // Your solution here
    }
}
`,
};

const VERDICT_CLASS: Record<string, string> = {
  AC: 'verdict-ac', WA: 'verdict-wa', TLE: 'verdict-tle',
  MLE: 'verdict-mle', CE: 'verdict-ce', RE: 'verdict-re', IE: 'verdict-ie',
};

function fmtRuntime(ms: number | null) {
  if (ms === null) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;
}
function fmtMemory(kb: number | null) {
  if (kb === null) return '—';
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
}

export default function ProblemPage() {
  const { slug } = useParams<{ slug: string }>();
  const [problem, setProblem] = useState<ProblemDetail | null>(null);
  const [lang, setLang] = useState('python');
  const [code, setCode] = useState(STARTERS['python']);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<Submission | null>(null);
  const [activeTab, setActiveTab] = useState<'problem' | 'submissions'>('problem');

  useEffect(() => {
    if (!slug) return;
    getProblem(slug).then((r) => setProblem(r.data));
    getMySubmissions(slug).then((r) => setSubmissions(r.data));
  }, [slug]);

  const changeLang = (l: string) => {
    setLang(l);
    setCode(STARTERS[l]);
  };

  const submit = useCallback(async () => {
    if (!slug || submitting) return;
    setSubmitting(true);
    setLastResult(null);
    try {
      const res = await submitCode(slug, lang, code);
      setLastResult(res.data);
      setSubmissions((prev) => [res.data, ...prev]);
    } catch (e: any) {
      alert('Submission error: ' + (e.response?.data?.detail || e.message));
    } finally {
      setSubmitting(false);
    }
  }, [slug, lang, code, submitting]);

  if (!problem) return <div className="page-loading">Loading problem…</div>;

  return (
    <div className="problem-layout">
      {/* Left: problem statement */}
      <div className="problem-statement-panel">
        <div className="problem-header">
          <h2>{problem.title}</h2>
          <div className="problem-meta">
            <span className={`badge badge-${problem.difficulty}`}>{problem.difficulty}</span>
            <span className="meta-pill">⏱ {problem.time_limit_sec}s</span>
            <span className="meta-pill">💾 {Math.round(problem.memory_limit_kb / 1024)} MB</span>
          </div>
        </div>

        <div className="tab-bar">
          <button className={activeTab === 'problem' ? 'tab active' : 'tab'} onClick={() => setActiveTab('problem')}>Statement</button>
          <button className={activeTab === 'submissions' ? 'tab active' : 'tab'} onClick={() => setActiveTab('submissions')}>
            My Submissions {submissions.length > 0 && <span className="tab-badge">{submissions.length}</span>}
          </button>
        </div>

        {activeTab === 'problem' ? (
          <div className="markdown-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{problem.statement}</ReactMarkdown>
          </div>
        ) : (
          <div className="submissions-list">
            {submissions.length === 0 ? (
              <p className="empty-state">No submissions yet.</p>
            ) : (
              <table className="sub-table">
                <thead><tr><th>#</th><th>Lang</th><th>Verdict</th><th>Runtime</th><th>Memory</th></tr></thead>
                <tbody>
                  {submissions.map((s) => (
                    <tr key={s.id}>
                      <td className="sub-id">#{s.id}</td>
                      <td>{s.language.toUpperCase()}</td>
                      <td><span className={`verdict-pill ${VERDICT_CLASS[s.verdict || 'IE']}`}>{s.verdict || '…'}</span></td>
                      <td>{fmtRuntime(s.runtime_ms)}</td>
                      <td>{fmtMemory(s.memory_kb)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Right: editor + submit */}
      <div className="editor-panel">
        <div className="editor-toolbar">
          <select
            id="language-select"
            value={lang}
            onChange={(e) => changeLang(e.target.value)}
            className="lang-select"
          >
            {LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>{l.label}</option>
            ))}
          </select>
          <button
            id="submit-btn"
            className="btn-submit"
            onClick={submit}
            disabled={submitting}
          >
            {submitting ? (
              <span className="submitting-text"><span className="spinner" />Judging…</span>
            ) : (
              '▶ Submit'
            )}
          </button>
        </div>

        <div className="editor-wrap">
          <Editor
            height="100%"
            language={lang === 'cpp' ? 'cpp' : lang === 'c' ? 'c' : lang}
            theme="vs-dark"
            value={code}
            onChange={(v) => setCode(v || '')}
            options={{
              fontSize: 14,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              lineNumbers: 'on',
              folding: true,
              tabSize: 4,
            }}
          />
        </div>

        {lastResult && (
          <div className={`result-bar ${lastResult.verdict === 'AC' ? 'result-ac' : 'result-fail'}`}>
            <span className={`verdict-pill ${VERDICT_CLASS[lastResult.verdict || 'IE']}`}>
              {lastResult.verdict}
            </span>
            {lastResult.verdict === 'AC' && <span className="result-score">+{lastResult.score} pts</span>}
            <span className="result-meta">{fmtRuntime(lastResult.runtime_ms)} · {fmtMemory(lastResult.memory_kb)}</span>
            {lastResult.verdict === 'CE' && lastResult.compile_error && (
              <pre className="ce-output">{lastResult.compile_error}</pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
