import { redactValue, redactSecrets } from '../../security/redaction.ts'
import type { BackendErrorBody } from './contracts.ts'
import { notifyRedaction } from '../../security/redactionNotice.ts'

export interface GuestTokenStore { read(): string | null; write(token: string): void; clear(): void }
export function guestTokenStore(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>): GuestTokenStore {
  const key = 'deveil:api:guest-token:v1'
  return { read: () => storage.getItem(key), write: token => storage.setItem(key, token), clear: () => storage.removeItem(key) }
}
export class BackendApiError extends Error {
  readonly status: number
  readonly code: string
  readonly requestId: string | null
  constructor(status: number, body: Partial<BackendErrorBody>) {
    super(typeof body.message === 'string' ? redactSecrets(body.message).value : 'Backend request failed')
    this.status = status; this.code = typeof body.code === 'string' ? body.code : 'INVALID_RESPONSE'
    this.requestId = typeof body.requestId === 'string' ? body.requestId : null
  }
}
type Options = {
  baseUrl: string; tokens: GuestTokenStore; fetch?: typeof fetch;
  // Required until the session response DTO is verified against the server.
  // No guessed `token` / `guestToken` / `accessToken` field is baked in.
  decodeSession: (value: unknown) => string;
}
function withSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
    signal.addEventListener('abort', abort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}
// Explicitly constructed adapter only. No app bootstrap import or Mock fallback.
export function createBackendClient(options: Options) {
  const fetcher = options.fetch ?? fetch
  const base = options.baseUrl.replace(/\/+$/u, '')
  if (!(base.startsWith('/') && !base.startsWith('//')) && !/^https?:\/\//u.test(base)) throw new Error('Invalid API base URL')
  if (/[?#\\]/u.test(base)) throw new Error('Invalid API base URL')
  let issuing: Promise<string> | null = null
  async function token(): Promise<string> {
    const existing = options.tokens.read()
    if (existing) return existing
    if (!issuing) {
      issuing = (async () => {
        // One issuance shared by callers, independent of an individual caller's abort.
        const response = await fetcher(`${base}/sessions`, { method: 'POST', credentials: 'omit', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10000) })
        const raw: unknown = await response.json().catch(() => null)
        if (!response.ok) throw new BackendApiError(response.status, raw && typeof raw === 'object' ? raw : {})
        const value = options.decodeSession(raw)
        if (typeof value !== 'string' || !value.trim() || /[\r\n]/u.test(value)) throw new Error('Invalid guest session token')
        options.tokens.write(value)
        return value
      })().finally(() => { issuing = null })
    }
    return issuing
  }
  return {
    async request<T>(path: string, init: { method: 'GET' | 'POST' | 'PATCH'; body?: unknown; signal: AbortSignal; decode: (value: unknown, httpStatus: number) => T }): Promise<T> {
      if (!path.startsWith('/') || path.startsWith('//') || /[\\#]/u.test(path) || path.split(/[/?]/u).includes('..')) throw new Error('Invalid API path')
      if (!['GET', 'POST', 'PATCH'].includes(init.method)) throw new Error('Unsupported API method')
      init.signal.throwIfAborted()
      const guest = await withSignal(token(), init.signal)
      init.signal.throwIfAborted()
      const safe = init.body === undefined ? undefined : redactValue(init.body)
      if (safe?.redacted) notifyRedaction()
      const response = await fetcher(base + path, {
        method: init.method, credentials: 'omit', signal: init.signal,
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Guest-Token': guest },
        ...(safe === undefined ? {} : { body: JSON.stringify(safe.value) }),
      })
      const raw: unknown = await response.json().catch(() => null)
      if (!response.ok) {
        const error = new BackendApiError(response.status, raw && typeof raw === 'object' ? raw : {})
        if (error.status === 401 && error.code === 'INVALID_TOKEN') {
          // A delayed 401 must not erase a newer session issued for another request.
          if (options.tokens.read() === guest) options.tokens.clear()
          await withSignal(token(), init.signal)
          // Do not replay a mutation under a different owner/session automatically.
        }
        throw error
      }
      return init.decode(raw, response.status)
    },
  }
}
export type BackendClient = ReturnType<typeof createBackendClient>
