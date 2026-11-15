/**
 * Free AI services WITHOUT sign-up and WITHOUT API key (OpenAI-compatible, CORS enabled) –
 * the same approach as the LinguaAI project.
 *
 *  1. OVHcloud AI Endpoints – https://endpoints.ai.cloud.ovh.net (anonymous: 2 requests/minute per model)
 *     → several models are used in turn so the limit is not reached.
 *  2. LLM7.io               – https://llm7.io (anonymous, daily limit per IP)
 *
 * There is no secret anywhere: nothing to configure for users or for deployment.
 * If one model is busy, the next one is tried automatically. There is NO scripted fallback:
 * if every service is busy, the caller gets an AiError and the UI says so honestly.
 * Meta Llama models are deliberately not used.
 */

export type AiErrorKind = 'rate' | 'network' | 'model' | 'aborted' | 'format' | 'other';
export class AiError extends Error {
  constructor(message: string, public kind: AiErrorKind, public status?: number, public retryAfter = 0) {
    super(message);
    this.name = 'AiError';
  }
}

export interface ChatMsg { role: 'system' | 'user' | 'assistant'; content: string }

interface FreeEndpoint {
  id: 'ovh' | 'llm7';
  label: string;
  url: string;
  models: string[];
  headers: Record<string, string>;
  timeoutMs: number;
  /** Anonymous limit: requests per minute and model. */
  rpm?: number;
}

export const FREE_ENDPOINTS: FreeEndpoint[] = [
  {
    id: 'ovh',
    label: 'OVHcloud AI Endpoints',
    url: 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions',
    // Fast multilingual model first; the large reasoning models are accurate but slower → reserve.
    models: ['Mistral-Small-3.2-24B-Instruct-2506', 'Qwen3.5-397B-A17B', 'gpt-oss-120b'],
    headers: {},
    timeoutMs: 45000,
    rpm: 2,
  },
  {
    id: 'llm7',
    label: 'LLM7.io',
    url: 'https://api.llm7.io/v1/chat/completions',
    models: ['DeepSeek-V4-Flash-0731', 'gpt-oss:20b', 'mistral-Nemo-Instruct-2407'],
    headers: { Authorization: 'Bearer unused' },
    timeoutMs: 35000,
  },
];
export const PROVIDER_CREDIT = 'OVHcloud AI Endpoints & LLM7.io';

/**
 * Try order across both services: fast models first, the slow reasoning models (15–35 s) only as reserve.
 * (Tested on 2026-11-15: Mistral Small answers in ~2 s; when its 2/min limit is reached the next fast model takes over.)
 */
const ROUTE_ORDER = [
  'ovh|Mistral-Small-3.2-24B-Instruct-2506',
  'llm7|DeepSeek-V4-Flash-0731',
  'llm7|mistral-Nemo-Instruct-2407',
  'llm7|gpt-oss:20b',
  'ovh|gpt-oss-120b',
  'ovh|Qwen3.5-397B-A17B',
];

const blockedUntil = new Map<string, number>();
const recentCalls = new Map<string, number[]>();
let lastWorking: string | null = null;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function hasCapacity(endpoint: FreeEndpoint, key: string): boolean {
  if (!endpoint.rpm) return true;
  const now = Date.now();
  const calls = (recentCalls.get(key) ?? []).filter((t) => now - t < 60_000);
  recentCalls.set(key, calls);
  return calls.length < endpoint.rpm;
}
const noteCall = (key: string) => recentCalls.set(key, [...(recentCalls.get(key) ?? []), Date.now()]);

/** Some models wrap their reasoning in <think> … </think>; never show that to the user. */
const stripThinking = (s: string) => s.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

async function callOnce(endpoint: FreeEndpoint, model: string, messages: ChatMsg[], json: boolean, temperature: number | undefined, signal?: AbortSignal): Promise<string> {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);
  const timer = setTimeout(() => controller.abort(), endpoint.timeoutMs);
  const body: Record<string, unknown> = { model, messages };
  if (json) body.response_format = { type: 'json_object' };
  if (temperature !== undefined) body.temperature = temperature;

  let res: Response;
  try {
    res = await fetch(endpoint.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...endpoint.headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    if (signal?.aborted) throw new AiError('aborted', 'aborted');
    throw new AiError(`${endpoint.label}: network error`, 'network');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }

  let data: { choices?: { message?: { content?: string } }[]; error?: { message?: string; retry_after?: number } | string; message?: string } = {};
  try { data = await res.json(); } catch { /* not JSON */ }
  const apiError = typeof data.error === 'string' ? { message: data.error } : data.error;
  const errorText = apiError?.message ?? data.message;

  if (res.status === 429 || res.status === 402) {
    const retry = Number(apiError?.retry_after ?? res.headers.get('retry-after') ?? 0) || 0;
    throw new AiError(`${endpoint.label}: ${errorText ?? 'rate limit'}`, 'rate', res.status, retry);
  }
  if (res.status === 400 && json && /json/i.test(errorText ?? '')) {
    // model has no JSON mode → ask again without response_format (the prompt asks for JSON anyway)
    return callOnce(endpoint, model, messages, false, temperature, signal);
  }
  if (!res.ok) throw new AiError(`${endpoint.label}: ${errorText ?? `HTTP ${res.status}`}`, 'model', res.status);
  const text = stripThinking(data.choices?.[0]?.message?.content ?? '');
  if (!text) throw new AiError(`${endpoint.label}: empty response`, 'format');
  return text;
}

function secondsUntilCapacity(): number {
  const now = Date.now();
  let soonest = 30;
  for (const calls of recentCalls.values()) if (calls.length) soonest = Math.min(soonest, Math.max(1, Math.ceil((calls[0] + 60_000 - now) / 1000)));
  return soonest;
}

export interface AiResult { text: string; model: string; provider: string }

export async function freeChat(messages: ChatMsg[], options: { json?: boolean; temperature?: number; signal?: AbortSignal } = {}): Promise<AiResult> {
  const routes = FREE_ENDPOINTS.flatMap((endpoint) => endpoint.models.map((model) => ({ endpoint, model, key: `${endpoint.id}|${model}` })))
    .sort((a, b) => ROUTE_ORDER.indexOf(a.key) - ROUTE_ORDER.indexOf(b.key));
  if (lastWorking) routes.sort((a, b) => Number(b.key === lastWorking) - Number(a.key === lastWorking));
  let lastError = new AiError('no free AI service available', 'network');

  // Two passes: if every model is only "full" because of the per-minute limit, wait briefly and try again.
  for (let pass = 0; pass < 2; pass++) {
    let waitingForCapacity = false;
    for (const { endpoint, model, key } of routes) {
      if ((blockedUntil.get(key) ?? 0) > Date.now()) continue;
      if (!hasCapacity(endpoint, key)) { waitingForCapacity = true; continue; }
      if (options.signal?.aborted) throw new AiError('aborted', 'aborted');
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          noteCall(key);
          const text = await callOnce(endpoint, model, messages, Boolean(options.json), options.temperature, options.signal);
          lastWorking = key;
          return { text, model, provider: endpoint.label };
        } catch (err) {
          const error = err instanceof AiError ? err : new AiError(String(err), 'other');
          if (error.kind === 'aborted') throw error;
          lastError = error;
          if (error.kind === 'rate' && attempt === 0 && error.retryAfter > 0 && error.retryAfter <= 12) { await wait(error.retryAfter * 1000); continue; }
          if (error.kind === 'network') break; // not model-specific → don't block it
          const pause = error.kind === 'rate' ? Math.min(Math.max(error.retryAfter, 60), 24 * 3600) * 1000 : error.kind === 'model' ? 10 * 60_000 : 30_000;
          blockedUntil.set(key, Date.now() + pause);
          break;
        }
      }
    }
    if (!waitingForCapacity || pass === 1) break;
    await wait(secondsUntilCapacity() * 1000);
  }
  throw lastError;
}

/** Removes ```json fences and parses the first JSON object or array. */
export function parseJson<T>(text: string): T {
  const cleaned = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(cleaned) as T; } catch { /* try to cut out the object */ }
  for (const [open, close] of [['{', '}'], ['[', ']']]) {
    const start = cleaned.indexOf(open), end = cleaned.lastIndexOf(close);
    if (start >= 0 && end > start) { try { return JSON.parse(cleaned.slice(start, end + 1)) as T; } catch { /* next */ } }
  }
  throw new AiError('invalid JSON from AI', 'format');
}
