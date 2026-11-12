import type { BackendClient } from './client.ts'
import { backendPaths } from './contracts.ts'
import type { AnalysisMode, BackendAnalysisStatus } from './contracts.ts'
import { assertNoResultContent } from './lockState.ts'
import type { BackendChatDetail } from './workspaceApi.ts'
import { findingCategories } from '../../types/comparison.ts'
import type { Finding, FindingCategory } from '../../types/comparison.ts'
import type { BasicLearningResult } from '../../types/basicLearningResult.ts'

export type BackendAnalysisJob = {
  jobId: number; mode: AnalysisMode; status: BackendAnalysisStatus; retryCount: number; remainingRetries: number
}
export type BackendAnalysisProgress = BackendAnalysisJob & { errorCode: string | null }
export type BackendAnalysisResult =
  | { mode: 'COMPARE'; thought: string; referenceAnswer: string; findings: Finding[]; responseSource?: 'SAVED_EXAMPLE'; notice?: string }
  | ({ mode: 'BASIC'; responseSource?: 'SAVED_EXAMPLE'; notice?: string } & Pick<BasicLearningResult, 'referenceAnswer' | 'concept' | 'exampleCode' | 'steps'>)

const statuses = ['PENDING', 'DONE', 'FAILED']
const modes = ['COMPARE', 'BASIC']
const isText = (value: unknown): value is string => typeof value === 'string' && !!value.trim()
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid analysis response')
  return value as Record<string, unknown>
}
function jobId(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw new Error('Invalid analysis job ID')
  return value
}
function attempts(value: Record<string, unknown>) {
  const { retryCount, remainingRetries } = value
  if (typeof retryCount !== 'number' || typeof remainingRetries !== 'number' ||
      !Number.isInteger(retryCount) || !Number.isInteger(remainingRetries) || retryCount < 0 ||
      remainingRetries < 0 || retryCount + remainingRetries !== 2) throw new Error('Invalid analysis retry counts')
  return { retryCount, remainingRetries }
}
function readJob(value: Record<string, unknown>, status: unknown): BackendAnalysisJob {
  if (typeof status !== 'string' || !statuses.includes(status) || typeof value.mode !== 'string' || !modes.includes(value.mode)) {
    throw new Error('Invalid analysis job')
  }
  return { jobId: jobId(value.jobId), mode: value.mode as AnalysisMode, status: status as BackendAnalysisStatus, ...attempts(value) }
}

export function readDetailJob(value: unknown): BackendAnalysisJob | null {
  if (value === null) return null
  const job = record(value)
  return readJob(job, job.status)
}

export function readAnalysisProgress(raw: unknown, expected: Pick<BackendAnalysisJob, 'jobId' | 'mode'>): BackendAnalysisProgress {
  const value = record(raw)
  const job = readJob(value, value.analysisStatus)
  if (job.jobId !== expected.jobId || job.mode !== expected.mode) throw new Error('Unexpected analysis job')
  if (job.status !== 'DONE' && [value.referenceAnswer, value.findings, value.basicExplanation].some(item => item != null)) {
    throw new Error('Protected analysis content received before completion')
  }
  return { ...job, errorCode: isText(value.errorCode) ? value.errorCode : null }
}

function readFindings(raw: unknown, thought: string): Finding[] {
  if (!Array.isArray(raw)) throw new Error('Invalid analysis findings')
  const findings: Finding[] = []
  const ids = new Set<number>()
  for (const item of raw) {
    const f = record(item)
    if (typeof f.id !== 'number' || !Number.isSafeInteger(f.id) || ids.has(f.id) ||
        !findingCategories.includes(f.category as FindingCategory) || !isText(f.title) || !isText(f.detail)) continue
    const quote = isText(f.userQuote) && thought.includes(f.userQuote) ? f.userQuote : null
    const ai = isText(f.aiPerspective) ? f.aiPerspective : null
    const question = isText(f.followUpQuestion) ? f.followUpQuestion : ''
    const base = { id: String(f.id), title: f.title, reason: f.detail, verification: question }
    let finding: Finding
    switch (f.category) {
      case 'COMMON': if (!quote || !ai) continue; finding = { ...base, category: 'COMMON', userQuote: quote, aiPerspective: ai }; break
      case 'CONFLICT': if (!quote || !ai) continue; finding = { ...base, category: 'CONFLICT', userQuote: quote, aiPerspective: ai, conflictEvidence: '' }; break
      case 'COMPLEMENT': if (!ai) continue; finding = { ...base, category: 'COMPLEMENT', aiPerspective: ai, conditions: '' }; break
      case 'UNIQUE': if (!quote) continue; finding = { ...base, category: 'UNIQUE', userQuote: quote }; break
      case 'UNDETERMINED': if (!question) continue; finding = { ...base, category: 'UNDETERMINED', question }; break
      default: continue
    }
    ids.add(f.id)
    findings.push(finding)
  }
  if (raw.length && !findings.length) throw new Error('Invalid analysis findings')
  return findings
}

export function readAnalysisResult(raw: unknown, detail: BackendChatDetail): BackendAnalysisResult {
  if (!detail.analysis) throw new Error('Missing analysis job in chat detail')
  const job = readAnalysisProgress(raw, detail.analysis)
  const requiredStatus = job.mode === 'COMPARE' ? 'UNLOCKED_SELF' : 'UNLOCKED_ASSISTED'
  if (job.status !== 'DONE' || detail.analysis.status !== 'DONE' || detail.status !== requiredStatus) {
    throw new Error('Analysis result has not been released')
  }
  const value = record(raw)
  const shared = {
    ...(value.isDemo === true ? { responseSource: 'SAVED_EXAMPLE' as const } : {}),
    ...(isText(value.notice) ? { notice: value.notice } : {}),
  }
  if (job.mode === 'COMPARE') {
    if (!isText(detail.thought) || !isText(value.referenceAnswer) ||
        (value.myThought != null && value.myThought !== detail.thought)) throw new Error('Invalid comparison result')
    return { mode: 'COMPARE', thought: detail.thought, referenceAnswer: value.referenceAnswer, findings: readFindings(value.findings, detail.thought), ...shared }
  }
  const basic = record(value.basicExplanation)
  if (!isText(basic.summary) || !isText(basic.observe) || !isText(basic.change)) throw new Error('Invalid basic explanation')
  return {
    mode: 'BASIC', concept: basic.summary, referenceAnswer: isText(value.referenceAnswer) ? value.referenceAnswer : '',
    exampleCode: isText(basic.exampleCode) ? basic.exampleCode : '',
    steps: [{ title: '무엇을 관찰할까요?', text: basic.observe }, { title: '무엇을 바꿔볼까요?', text: basic.change }],
    ...shared,
  }
}

export function canStartBasic(detail: BackendChatDetail): boolean {
  return detail.status === 'LOCKED' && detail.prepareStatus === 'DONE' && detail.hintLevel === 2 &&
    detail.basicModeAvailable === true && !detail.analysis && !detail.thought
}

export function canRetryAnalysis(job: BackendAnalysisJob | null): boolean {
  return job?.status === 'FAILED' && job.remainingRetries > 0
}

export function backendAnalysisApi(client: BackendClient, guest: string, signal: AbortSignal) {
  return {
    get: (chatId: number) => client.request(backendPaths.analysis(chatId), { method: 'GET', guest, signal, decode: raw => raw }),
    retry: (chatId: number, expected: BackendAnalysisJob) => client.request(backendPaths.analysisRetry(chatId), {
      method: 'POST', guest, signal, decode(raw, status) {
        assertNoResultContent(raw)
        const value = record(raw)
        if (status !== 202 || jobId(value.jobId) !== expected.jobId || value.analysisStatus !== 'PENDING' ||
            attempts(value).retryCount !== expected.retryCount + 1) throw new Error('Invalid analysis retry receipt')
        return expected.jobId
      },
    }),
    startBasic: (chatId: number) => client.request(backendPaths.basicMode(chatId), {
      method: 'POST', guest, signal, decode(raw, status) {
        assertNoResultContent(raw)
        const value = record(raw)
        if (![200, 202].includes(status) || value.mode !== 'BASIC' || typeof value.analysisStatus !== 'string' ||
            !statuses.includes(value.analysisStatus) ||
            value.status !== (value.analysisStatus === 'DONE' ? 'UNLOCKED_ASSISTED' : 'LOCKED') ||
            (status === 202 && value.analysisStatus !== 'PENDING')) throw new Error('Invalid basic mode receipt')
        return jobId(value.jobId)
      },
    }),
  }
}

export async function pollBackendAnalysis({
  detail, get, refreshDetail, signal, wait, onProgress,
}: {
  detail: BackendChatDetail
  get: () => Promise<unknown>
  refreshDetail: () => Promise<BackendChatDetail>
  signal: AbortSignal
  wait: (signal: AbortSignal) => Promise<void>
  onProgress: (progress: BackendAnalysisProgress) => void
}): Promise<{ detail: BackendChatDetail; result: BackendAnalysisResult | null }> {
  if (!detail.analysis) return { detail, result: null }
  const expected = detail.analysis
  for (;;) {
    const raw = await get()
    signal.throwIfAborted()
    const progress = readAnalysisProgress(raw, expected)
    if (progress.retryCount < expected.retryCount) throw new Error('Stale analysis attempt')
    onProgress(progress)
    if (progress.status === 'FAILED') return { detail, result: null }
    if (progress.status === 'DONE') {
      const released = detail.status === 'LOCKED' ? await refreshDetail() : detail
      signal.throwIfAborted()
      if (released.analysis?.jobId !== expected.jobId || released.analysis.mode !== expected.mode ||
          released.analysis.retryCount !== progress.retryCount) throw new Error('Unexpected released job')
      return { detail: released, result: readAnalysisResult(raw, released) }
    }
    await wait(signal)
  }
}
