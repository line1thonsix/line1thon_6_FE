export const ANALYSIS_MAX_ATTEMPTS = 3
export const ANALYSIS_POLL_MS = 2000
export const ANALYSIS_TIMEOUT_MS = 90000
export type AnalysisFailure = 'AI_ERROR' | 'INVALID_OUTPUT' | 'TIMEOUT'
type AnalysisBase = { jobId: string; attempt: number; maxAttempts: 3; startedAt: number; deadlineAt: number }
export type AnalysisSnapshot = AnalysisBase & (
  { status: 'PENDING' } | { status: 'FAILED'; reason: AnalysisFailure } | { status: 'DONE'; resultId: string }
)
// F-11 result identity. Answer/findings are fetched separately after DONE.
export type AnalysisCompletion = { chatId: string; jobId: string; resultId: string }
export type MockAnalysisRetryRequest = { jobId: string; clientRequestId: string }
