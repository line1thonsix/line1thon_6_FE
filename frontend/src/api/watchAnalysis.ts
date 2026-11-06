import { ANALYSIS_POLL_MS } from '../types/analysis.ts'
import type { AnalysisSnapshot } from '../types/analysis.ts'

type Timer = ReturnType<typeof setTimeout>
type Options = {
  fetchStatus: (signal: AbortSignal) => Promise<AnalysisSnapshot>
  onStatus: (snapshot: AnalysisSnapshot) => void
  onError: () => void
  intervalMs?: number
  requestTimeoutMs?: number
  timers?: { set: (fn: () => void, ms: number) => Timer; clear: (timer: Timer) => void }
}
// One in-flight GET at a time. GET failures never issue an analysis retry POST.
export function watchAnalysis(options: Options): () => void {
  const timers = options.timers ?? { set: (fn, ms) => setTimeout(fn, ms), clear: timer => clearTimeout(timer) }
  let stopped = false
  let next: Timer | undefined
  let watchdog: Timer | undefined
  let active: AbortController | null = null
  async function poll() {
    if (stopped || active) return
    const controller = new AbortController()
    active = controller
    let terminal = false
    watchdog = timers.set(() => controller.abort(), options.requestTimeoutMs ?? 10000)
    try {
      const snapshot = await options.fetchStatus(controller.signal)
      if (stopped || active !== controller) return
      options.onStatus(snapshot)
      terminal = snapshot.status !== 'PENDING'
    } catch {
      if (!stopped && active === controller) options.onError()
    } finally {
      if (watchdog !== undefined) timers.clear(watchdog)
      watchdog = undefined
      if (active === controller) active = null
      if (!stopped && !terminal) next = timers.set(() => { void poll() }, options.intervalMs ?? ANALYSIS_POLL_MS)
      if (terminal) stopped = true
    }
  }
  void poll()
  return () => {
    stopped = true
    if (next !== undefined) timers.clear(next)
    if (watchdog !== undefined) timers.clear(watchdog)
    active?.abort()
    active = null
  }
}
