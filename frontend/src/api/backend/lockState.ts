import type { AnalysisMode, BackendAnalysisStatus, BackendChatStatus, PrepareStatus } from './contracts.ts'

// State projection of chat detail. Mutation receipts use analysisStatus separately.
export type BackendLockState = {
  prepareStatus: PrepareStatus; status: BackendChatStatus; hintLevel: 0 | 1 | 2;
  analysis: { mode: AnalysisMode; status: BackendAnalysisStatus } | null;
}
export const BACKEND_POLL_MS = 2000
export function readBackendLockState(raw: unknown): BackendLockState {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid backend lock state')
  const v = raw as Record<string, unknown>
  if (!['PREPARING', 'DONE', 'FAILED'].includes(String(v.prepareStatus)) ||
    !['LOCKED', 'UNLOCKED_SELF', 'UNLOCKED_ASSISTED'].includes(String(v.status)) ||
    ![0, 1, 2].includes(Number(v.hintLevel)) || typeof v.hintLevel !== 'number' || 'unlockType' in v) throw new Error('Invalid backend lock state')
  let analysis: BackendLockState['analysis'] = null
  if (v.analysis !== null) {
    const a = v.analysis as Record<string, unknown> | null
    if (!a || typeof a !== 'object' || !['COMPARE', 'BASIC'].includes(String(a.mode)) || !['PENDING', 'DONE', 'FAILED'].includes(String(a.status))) throw new Error('Invalid backend analysis state')
    analysis = { mode: a.mode as AnalysisMode, status: a.status as BackendAnalysisStatus }
  }
  if (v.prepareStatus !== 'DONE' && (v.status !== 'LOCKED' || v.hintLevel !== 0 || analysis !== null)) throw new Error('Preparation must finish first')
  if (analysis?.mode === 'BASIC' && v.hintLevel !== 2) throw new Error('Hint two required')
  if (v.status === 'LOCKED' ? analysis?.status === 'DONE' : !analysis || analysis.status !== 'DONE' || analysis.mode !== (v.status === 'UNLOCKED_SELF' ? 'COMPARE' : 'BASIC')) throw new Error('Inconsistent release state')
  return { prepareStatus: v.prepareStatus as PrepareStatus, status: v.status as BackendChatStatus, hintLevel: v.hintLevel as 0 | 1 | 2, analysis }
}
// Validate observed server transitions; never unlock locally after a POST/timeout.
export function readBackendTransition(previous: BackendLockState, raw: unknown) {
  const before = readBackendLockState(previous), next = readBackendLockState(raw)
  if (before.status !== 'LOCKED' && next.status !== before.status) throw new Error('Released state is terminal')
  if (next.hintLevel < before.hintLevel) throw new Error('Hints cannot be unrevealed')
  if (before.prepareStatus === 'DONE' && next.prepareStatus !== 'DONE') throw new Error('Preparation cannot restart after completion')
  return next
}
export function backendPollTarget(state: BackendLockState): 'chat' | 'analysis' | null {
  const safe = readBackendLockState(state)
  return safe.prepareStatus === 'PREPARING' ? 'chat' : safe.analysis?.status === 'PENDING' ? 'analysis' : null
}
// Defense in depth. The server must prevent transmission; UI filtering is insufficient.
export function assertNoResultContent(raw: unknown): void {
  if (!raw || typeof raw !== 'object') return
  for (const [key, value] of Object.entries(raw)) {
    if (['referenceAnswer', 'findings', 'comparisonResult', 'analysisResult', 'basicLearningResult', 'result', 'score'].includes(key)) throw new Error('Unexpected protected result content')
    assertNoResultContent(value)
  }
}
export function readReleasedResult<T>(raw: unknown, state: BackendLockState, decode: (value: unknown) => T): T {
  if (readBackendLockState(state).status === 'LOCKED') throw new Error('Result is locked')
  return decode(raw)
}
