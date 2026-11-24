const BASE = '/api/v1';
const KEY = 'anc_admin_tokens';

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

function load(): Tokens | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Tokens) : null;
  } catch {
    return null;
  }
}

let tokens: Tokens | null = load();
let refreshing: Promise<boolean> | null = null;
const listeners = new Set<() => void>();

export function setTokens(t: Tokens | null) {
  tokens = t;
  try {
    if (t) localStorage.setItem(KEY, JSON.stringify(t));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage yo'q — xotirada qoladi */
  }
  listeners.forEach((l) => l());
}

export const isLoggedIn = () => !!tokens;
export const onAuthChange = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

async function refresh(): Promise<boolean> {
  if (!tokens) return false;
  refreshing ??= fetch(`${BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken: tokens.refreshToken }),
  })
    .then(async (r) => {
      if (!r.ok) {
        setTokens(null);
        return false;
      }
      setTokens(await r.json());
      return true;
    })
    .finally(() => (refreshing = null));
  return refreshing;
}

export async function api<T = any>(path: string, init: RequestInit & { json?: unknown } = {}, retry = true): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (init.json !== undefined) headers['content-type'] = 'application/json';
  if (tokens) headers.authorization = `Bearer ${tokens.accessToken}`;
  const res = await fetch(`${BASE}${path}`, { ...init, headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body });

  if (res.status === 401 && retry && tokens && (await refresh())) return api<T>(path, init, false);
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const details = data?.error?.details;
    const msg = Array.isArray(details) ? details.join('; ') : data?.error?.message ?? res.statusText;
    throw new ApiError(res.status, msg, details);
  }
  return data as T;
}

export async function login(loginId: string, password: string) {
  const t = await api<Tokens>('/auth/login', { method: 'POST', json: { login: loginId, password } }, false);
  setTokens(t);
}

export async function logout() {
  try {
    await api('/auth/logout', { method: 'POST' }, false);
  } finally {
    setTokens(null);
  }
}

export const qs = (o: Record<string, unknown>) => {
  const p = new URLSearchParams();
  Object.entries(o).forEach(([k, v]) => v !== undefined && v !== '' && v !== null && p.set(k, String(v)));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export interface Paged<T> {
  items: T[];
  meta: { page: number; limit: number; total: number; pages: number };
}

export interface Subject {
  id: string;
  code: string;
  nameUz: string;
  nameRu: string;
  isActive: boolean;
}

export interface TopicNode {
  id: string;
  parentId: string | null;
  name: string;
  level: 'TOPIC' | 'SUBTOPIC';
  children: TopicNode[];
}

export const QUESTION_TYPES = [
  'SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'NUMERIC', 'TEXT', 'TRUE_FALSE', 'MATCHING', 'ORDERING',
  'FORMULA', 'IMAGE_BASED', 'DIAGRAM_BASED', 'CONTEXT_BASED', 'WRITTEN_RESPONSE',
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];
