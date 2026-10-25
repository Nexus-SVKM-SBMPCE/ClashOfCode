import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const api = axios.create({ baseURL: BASE_URL });

// ─── Demo Mode ───────────────────────────────────────────────────────────────
export const demoMode = { enabled: false };

const MOCK_PROBLEMS = [
  { id: 1, slug: 'two-sum', title: 'Two Sum', difficulty: 'easy', time_limit_sec: 2, memory_limit_kb: 262144 },
  { id: 2, slug: 'fibonacci', title: 'Fibonacci Number', difficulty: 'easy', time_limit_sec: 2, memory_limit_kb: 262144 },
  { id: 3, slug: 'palindrome-check', title: 'Palindrome Check', difficulty: 'easy', time_limit_sec: 2, memory_limit_kb: 262144 },
  { id: 4, slug: 'binary-search', title: 'Binary Search', difficulty: 'medium', time_limit_sec: 2, memory_limit_kb: 262144 },
  { id: 5, slug: 'max-subarray', title: 'Maximum Subarray Sum', difficulty: 'medium', time_limit_sec: 2, memory_limit_kb: 262144 },
];

const MOCK_PROBLEM_DETAIL: Record<string, object> = {
  'two-sum': {
    ...MOCK_PROBLEMS[0],
    statement: `## Two Sum\n\nGiven an array of \`n\` integers and a target \`T\`, find **two** distinct 1-based indices \`i\` and \`j\` such that \`arr[i] + arr[j] == T\`.\n\n### Input Format\n- Line 1: Two integers \`n\` and \`T\`\n- Line 2: \`n\` space-separated integers\n\n### Output Format\nPrint two space-separated 1-based indices \`i j\` where \`i < j\`.\n\n### Constraints\n- \`2 ≤ n ≤ 10,000\`\n\n### Sample Input\n\`\`\`\n5 9\n2 7 11 15 4\n\`\`\`\n\n### Sample Output\n\`\`\`\n1 2\n\`\`\``,
    sample_test_cases: [{ input_data: '5 9\n2 7 11 15 4\n', expected_output: '1 2\n' }],
  },
  'fibonacci': {
    ...MOCK_PROBLEMS[1],
    statement: `## Fibonacci Number\n\nGiven \`n\`, print the n-th Fibonacci number (0-indexed, F(0)=0, F(1)=1).\n\n### Sample Input\n\`\`\`\n10\n\`\`\`\n### Sample Output\n\`\`\`\n55\n\`\`\``,
    sample_test_cases: [{ input_data: '10\n', expected_output: '55\n' }],
  },
  'palindrome-check': {
    ...MOCK_PROBLEMS[2],
    statement: `## Palindrome Check\n\nGiven string \`S\`, determine if it is a palindrome (ignore case and non-alphanumeric).\n\n### Sample Input\n\`\`\`\nA man a plan a canal Panama\n\`\`\`\n### Sample Output\n\`\`\`\nYES\n\`\`\``,
    sample_test_cases: [{ input_data: 'A man a plan a canal Panama\n', expected_output: 'YES\n' }],
  },
  'binary-search': {
    ...MOCK_PROBLEMS[3],
    statement: `## Binary Search\n\nFind the 1-based index of target \`T\` in a sorted array, or \`-1\` if not found.\n\n### Sample Input\n\`\`\`\n7 23\n1 5 9 12 17 23 45\n\`\`\`\n### Sample Output\n\`\`\`\n6\n\`\`\``,
    sample_test_cases: [{ input_data: '7 23\n1 5 9 12 17 23 45\n', expected_output: '6\n' }],
  },
  'max-subarray': {
    ...MOCK_PROBLEMS[4],
    statement: `## Maximum Subarray Sum\n\nFind the maximum sum of any contiguous subarray (Kadane's Algorithm).\n\n### Sample Input\n\`\`\`\n9\n-2 1 -3 4 -1 2 1 -5 4\n\`\`\`\n### Sample Output\n\`\`\`\n6\n\`\`\``,
    sample_test_cases: [{ input_data: '9\n-2 1 -3 4 -1 2 1 -5 4\n', expected_output: '6\n' }],
  },
};

const MOCK_LEADERBOARD = [
  { rank: 1, user_id: 2, username: 'contestant1', display_name: 'Alice Chen', total_score: 500, solved_count: 5, total_submissions: 7, last_ac_time: new Date().toISOString() },
  { rank: 2, user_id: 3, username: 'contestant2', display_name: 'Bob Patel', total_score: 400, solved_count: 4, total_submissions: 6, last_ac_time: new Date().toISOString() },
  { rank: 3, user_id: 4, username: 'contestant3', display_name: 'Chloe Sharma', total_score: 300, solved_count: 3, total_submissions: 5, last_ac_time: new Date().toISOString() },
  { rank: 4, user_id: 5, username: 'contestant4', display_name: 'Dev Kumar', total_score: 200, solved_count: 2, total_submissions: 4, last_ac_time: null },
  { rank: 5, user_id: 6, username: 'contestant5', display_name: 'Eva Mehta', total_score: 100, solved_count: 1, total_submissions: 3, last_ac_time: null },
];

let mockSubId = 100;
const mockSubmissions: Record<string, object[]> = {};

function mockResp<T>(data: T) {
  return Promise.resolve({ data, status: 200, statusText: 'OK', headers: {}, config: {} as any });
}

function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── JWT Interceptor ──────────────────────────────────────────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ─── Types ────────────────────────────────────────────────────────────────────
export interface User {
  id: number;
  username: string;
  display_name: string;
  role: 'admin' | 'contestant';
}

export interface Problem {
  id: number;
  slug: string;
  title: string;
  difficulty: 'easy' | 'medium' | 'hard';
  time_limit_sec: number;
  memory_limit_kb: number;
}

export interface ProblemDetail extends Problem {
  statement: string;
  sample_test_cases: { input_data: string; expected_output: string }[];
}

export interface Submission {
  id: number;
  problem_slug: string;
  language: string;
  status: string;
  verdict: string | null;
  score: number;
  runtime_ms: number | null;
  memory_kb: number | null;
  compile_error: string | null;
  created_at: string;
  judged_at: string | null;
}

export interface LeaderboardEntry {
  rank: number;
  user_id: number;
  username: string;
  display_name: string;
  total_score: number;
  solved_count: number;
  total_submissions: number;
  last_ac_time: string | null;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const login = (username: string, password: string) => {
  if (demoMode.enabled) {
    const isAdmin = username === 'admin';
    const user: User = { id: isAdmin ? 1 : 2, username, display_name: isAdmin ? 'Admin' : 'Alice Chen', role: isAdmin ? 'admin' : 'contestant' };
    localStorage.setItem('demo-user', JSON.stringify(user));
    return mockResp({ access_token: 'demo-token', token_type: 'bearer', user });
  }
  return api.post<{ access_token: string; token_type: string; user: User }>(
    '/api/auth/login',
    new URLSearchParams({ username, password }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
};

export const getMe = () => {
  if (demoMode.enabled) {
    const u = JSON.parse(localStorage.getItem('demo-user') || 'null');
    return u ? mockResp(u as User) : Promise.reject(new Error('Not logged in'));
  }
  return api.get<User>('/api/auth/me');
};

// ─── Problems ─────────────────────────────────────────────────────────────────
export const getProblems = () => {
  if (demoMode.enabled) return mockResp(MOCK_PROBLEMS as Problem[]);
  return api.get<Problem[]>('/api/problems');
};

export const getProblem = (slug: string) => {
  if (demoMode.enabled) {
    const p = MOCK_PROBLEM_DETAIL[slug];
    if (p) return mockResp(p as ProblemDetail);
    return mockResp(MOCK_PROBLEM_DETAIL['two-sum'] as ProblemDetail);
  }
  return api.get<ProblemDetail>(`/api/problems/${slug}`);
};

// ─── Submissions ──────────────────────────────────────────────────────────────
export const submitCode = async (problem_slug: string, language: string, source_code: string) => {
  if (demoMode.enabled) {
    await delay(2000); // simulate judge execution
    const sub: Submission = {
      id: ++mockSubId,
      problem_slug,
      language,
      status: 'done',
      verdict: 'AC',
      score: 100,
      runtime_ms: Math.random() * 200 + 50,
      memory_kb: Math.random() * 5000 + 8000,
      compile_error: null,
      created_at: new Date().toISOString(),
      judged_at: new Date().toISOString(),
    };
    if (!mockSubmissions[problem_slug]) mockSubmissions[problem_slug] = [];
    mockSubmissions[problem_slug].unshift(sub);
    return mockResp(sub);
  }
  return api.post<Submission>('/api/submissions', { problem_slug, language, source_code });
};

export const getMySubmissions = (problem_slug?: string) => {
  if (demoMode.enabled) {
    const subs = problem_slug ? (mockSubmissions[problem_slug] || []) : Object.values(mockSubmissions).flat();
    return mockResp(subs as Submission[]);
  }
  return api.get<Submission[]>('/api/submissions', { params: problem_slug ? { problem_slug } : {} });
};

// ─── Leaderboard ──────────────────────────────────────────────────────────────
export const getLeaderboard = () => {
  if (demoMode.enabled) return mockResp(MOCK_LEADERBOARD as LeaderboardEntry[]);
  return api.get<LeaderboardEntry[]>('/api/leaderboard');
};
