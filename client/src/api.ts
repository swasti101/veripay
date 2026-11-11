export class ApiError extends Error { constructor(public status: number, msg: string) { super(msg); } }

async function call<T = any>(method: string, path: string, body?: any): Promise<T> {
  const isForm = body instanceof FormData;
  const r = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: { 'x-veripay': '1', ...(body && !isForm ? { 'content-type': 'application/json' } : {}) },
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, j.error || `Request failed (${r.status})`);
  return j as T;
}

export const api = {
  get: <T = any>(p: string) => call<T>('GET', p),
  post: <T = any>(p: string, b?: any) => call<T>('POST', p, b ?? {}),
  put: <T = any>(p: string, b?: any) => call<T>('PUT', p, b ?? {}),
  patch: <T = any>(p: string, b?: any) => call<T>('PATCH', p, b ?? {}),
};

export const money = (n: number | null | undefined, cur = 'USD') =>
  n === null || n === undefined || isNaN(n) ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(n);
export const dt = (s?: string | null) => (s ? new Date(s).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');
export const d = (s?: string | null) => (s ? new Date(s).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—');
