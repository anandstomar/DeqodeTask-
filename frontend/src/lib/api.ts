const API_BASE = import.meta.env.VITE_API_BASE_URL || ('http://localhost:3000').replace(/\/$/, '');

export type ThreadDto = {
  user_id: string;
  thread_id: string;
  question: string
};

export type MessageDto = {
  id?: string;
  author: string;
  content: string;
};

export type ThreadResource = {
  id: string;
  userId: string;
  title?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  question?: string | null;
  messages: Array<{ id: string; author: string; content: string; createdAt: string }>;
  latestCheckpoint?: { hasReport: boolean; draftPreview: string; lastUpdated?: string | null };
};

export async function getThreads(user_id: string) {
  return doFetch(`${API_BASE}/threads/user/${encodeURIComponent(user_id)}`);
}


export async function getCurrentUser(): Promise<{ id: string; email?: string; } | null> {
  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      method: 'GET',
      headers: authHeaders(),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn('getCurrentUser failed', e);
    return null;
  }
}

async function getAuthHeaders(): Promise<HeadersInit> {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  try {
    const token = localStorage.getItem('access_token');
    if (token) (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  } catch (e) {

  }
  return headers;
}

async function doFetch(url: string, opts?: RequestInit) {

  const headersFromStorage = await getAuthHeaders();
  const mergedHeaders = { ...(opts?.headers || {}), ...headersFromStorage };

  const res = await fetch(url, { ...opts, headers: mergedHeaders });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) { json = text; }
  if (!res.ok) {
    const err: any = new Error(json?.message || res.statusText || 'Request failed');
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

async function handleFetchResponse(res: Response) {
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (e) {

  }
  if (!res.ok) {
    const err = new Error((json && json.message) || res.statusText || 'Request failed');
    (err as any).status = res.status;
    (err as any).body = json;
    throw err;
  }
  return json !== null ? json : text;
}

/* ---------- Threads & Messages ---------- */

export async function createThread(body: ThreadDto) {
  return doFetch(`${API_BASE}/threads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function getThread(user_id: string, thread_id: string): Promise<ThreadResource | null> {
  const res = await fetch(`${API_BASE}/threads/${encodeURIComponent(user_id)}/${encodeURIComponent(thread_id)}`);
  const data = await handleFetchResponse(res); 
  return data;
}

export async function getThreadMessages(user_id: string, thread_id: string) {
  try {
    const res = await fetch(`${API_BASE}/threads/${encodeURIComponent(user_id)}/${encodeURIComponent(thread_id)}/messages`);
    const data = await handleFetchResponse(res);
    // console.log('Fetched messages:', data.length);
    return data;
  } catch (e) {
    console.warn('getThreadMessages failed', e);
    return null;
  }
}

export async function deleteThread(user_id: string, thread_id: string) {
  return doFetch(`${API_BASE}/threads/${encodeURIComponent(user_id)}/${encodeURIComponent(thread_id)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' }
  });
}




export async function postMessage(user_id: string, thread_id: string, message: MessageDto) {

  return doFetch(`${API_BASE}/threads/${encodeURIComponent(user_id)}/${encodeURIComponent(thread_id)}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  });
}

/* ---------- Research endpoints ---------- */


export async function getCheckpoint(user_id: string, thread_id: string) {
  const url = new URL(`${API_BASE}/research/checkpoint`);
  url.searchParams.set('user_id', user_id);
  url.searchParams.set('thread_id', thread_id);
  return doFetch(url.toString());
}



export type AgentEvent = {
  event?: string;
  payload?: any;

  raw?: string;
};

export async function runResearch(body: { user_id: string; thread_id: string; question?: string }) {
  return doFetch(`${API_BASE}/research/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * startResearchStream: creates a managed EventSource with linear/exponential backoff reconnection.
 * Returns controller: { close() } and optionally a checkpoint returned synchronously from getCheckpoint if used.
 *
 * onEvent receives raw parsed event objects (if backend sends JSON objects in data).
 */
export function startResearchStream(opts: {
  user_id: string;
  thread_id: string;
  question: string;
  onMessage: (raw: any) => void;
  onOpen?: () => void;
  onError?: (err: any) => void;
}) {
  const { user_id, thread_id, question, onMessage, onOpen, onError } = opts;
  const q = new URLSearchParams({ user_id, thread_id, question }).toString();
  const url = `${API_BASE}/research/stream?${q}`;

  const es = new EventSource(url);

  es.onopen = () => onOpen?.();
  es.onmessage = (e) => {
    try {
      const parsed = JSON.parse(e.data);
      if (parsed?.event === 'end_of_stream' || parsed?.event === 'finished') {
        try { es.close(); } catch { }
      }
      onMessage(parsed);
    } catch (err) {
      onMessage({ raw: e.data });
    }
  };

  es.onerror = (err) => {
    onError?.(err);
  };


  return {
    es,
    close: () => {
      try { es.close(); } catch (e) { /* ignore */ }
    }
  };
}

/**
 * Convenience helper that fetches checkpoint (GET /research/checkpoint) then starts SSE.
 * Returns { es, close, checkpoint }.
 */
export async function startStreamWithCheckpoint(opts: {
  user_id: string;
  thread_id: string;
  question: string;
  onEvent?: (ev: AgentEvent) => void;
  onOpen?: () => void;
  onError?: (err: any) => void;
}) {

  const ck = await getCheckpoint(opts.user_id, opts.thread_id).catch(() => ({ exists: false }));


  const onMessageAdapter = (rawEvent: any) => {
    let ev: AgentEvent;
    if (rawEvent && typeof rawEvent === 'object' && ('event' in rawEvent || 'payload' in rawEvent)) {
      ev = {
        event: rawEvent.event ?? rawEvent.type ?? undefined,
        payload: rawEvent.payload ?? rawEvent,
        raw: typeof rawEvent === 'string' ? rawEvent : undefined
      };
    } else if (rawEvent && typeof rawEvent === 'object') {
      ev = { event: rawEvent.event ?? undefined, payload: rawEvent, raw: undefined };
    } else {
      ev = { event: 'message', payload: rawEvent, raw: String(rawEvent) };
    }

    try { opts.onEvent?.(ev); } catch (e) { console.warn('onEvent handler threw', e); }
  };

  const controller = startResearchStream({
    user_id: opts.user_id,
    thread_id: opts.thread_id,
    question: opts.question,
    onMessage: onMessageAdapter,
    onOpen: opts.onOpen,
    onError: opts.onError
  });

  return { ...controller, checkpoint: ck };
}


export default {
  API_BASE,
  createThread,
  getThread,
  getThreadMessages,
  postMessage,
  runResearch,
  getCheckpoint,
  startResearchStream,
  startStreamWithCheckpoint
};



export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

const API_BASE_URL: string = ((import.meta as any)?.env?.VITE_API_BASE_URL as string) || "http://localhost:3000";

function authHeaders(extra?: HeadersInit): HeadersInit {
  const headers: HeadersInit = { "Content-Type": "application/json", ...extra };
  try {
    const token = localStorage.getItem("access_token");
    if (token) (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  } catch { }
  return headers;
}

export async function api<T>(path: string, options?: { method?: HttpMethod; body?: any; headers?: HeadersInit }): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: options?.method || "GET",
    headers: authHeaders(options?.headers),
    body: options?.body ? JSON.stringify(options.body) : undefined,
    credentials: "include",
  });
  const ct = res.headers.get("content-type") || "";
  const isJson = ct.includes("application/json");
  const data = isJson ? await res.json() : (await res.text() as any);
  if (!res.ok) {
    const message = (isJson && data && (data.message || data.error)) || res.statusText || "Request failed";
    throw new Error(typeof message === "string" ? message : Array.isArray(message) ? message.join(", ") : "Request failed");
  }
  return data as T;
}

export const endpoints = {
  auth: {
    login: "/auth/login",
    register: "/auth/register",
  },
};
