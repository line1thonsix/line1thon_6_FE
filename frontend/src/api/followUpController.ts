import { redactSecrets } from '../security/redaction.ts'
import { validateFollowUp } from './followUpState.ts'
import type { FollowUpRequest, FollowUpSnapshot } from '../types/followUp.ts'

type Local = { draft: string; request?: FollowUpRequest }
type State = FollowUpSnapshot & Local & { loaded: boolean; phase: 'loading' | 'ready' | 'sending' | 'error'; error: string }
type Dependencies = { read: () => unknown; write: (value: Local) => void; fetch: (signal: AbortSignal, body?: FollowUpRequest) => Promise<FollowUpSnapshot>; id: () => string }
export function createFollowUpController(chatId: string, deps: Dependencies) {
  const raw = deps.read() as Partial<Local> | null
  const draft = typeof raw?.draft === 'string' ? redactSecrets(raw.draft).value : ''
  const request = raw?.request && typeof raw.request.question === 'string' && !validateFollowUp(raw.request.question) && typeof raw.request.clientRequestId === 'string' && raw.request.clientRequestId && raw.request.clientRequestId.length <= 100 ? { question: redactSecrets(raw.request.question).value, clientRequestId: raw.request.clientRequestId } : undefined
  let state: State = { chatId, items: [], remaining: 5, loaded: false, draft, ...(request ? { request } : {}), phase: 'loading', error: '' }
  let active: AbortController | null = null
  let loaded = false
  const listeners = new Set<() => void>()
  const publish = (next: State) => { state = next; listeners.forEach(f => f()) }
  const persist = () => deps.write({ draft: redactSecrets(state.draft).value, ...(state.request ? { request: state.request } : {}) })
  async function run(body?: FollowUpRequest) {
    if (active) return
    const controller = new AbortController(); active = controller
    publish({ ...state, phase: body ? 'sending' : 'loading', error: '' })
    const timer = setTimeout(() => controller.abort(), 15000)
    try {
      const snapshot = await deps.fetch(controller.signal, body)
      if (active !== controller) return
      loaded = true
      publish({ ...state, ...snapshot, loaded: true, ...(body ? { draft: '', request: undefined } : {}), phase: 'ready', error: '' }); persist()
    } catch (error) {
      if (active === controller) publish({ ...state, phase: 'error', error: error instanceof Error ? error.message : '다시 시도해 주세요.' })
    } finally { clearTimeout(timer); if (active === controller) active = null }
  }
  return {
    getState: () => state,
    subscribe: (f: () => void) => { listeners.add(f); return () => { listeners.delete(f) } },
    load: () => run(state.request),
    cancel: () => { const previous = active; active = null; previous?.abort() },
    change(text: string) {
      if (active || !loaded) return
      publish({ ...state, draft: text, request: undefined, error: '', phase: 'ready' }); persist()
    },
    submit() {
      if (active || !loaded || state.remaining === 0) return
      const safe = redactSecrets(state.draft).value
      const error = validateFollowUp(state.draft) ?? validateFollowUp(safe)
      if (error) { publish({ ...state, error }); return }
      const request = state.request ?? { question: safe, clientRequestId: deps.id() }
      publish({ ...state, draft: safe, request }); persist(); return run(request)
    },
    retry: () => run(state.request),
  }
}
