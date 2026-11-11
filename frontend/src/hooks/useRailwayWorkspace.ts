import { useCallback, useEffect, useRef, useState } from 'react'
import { BackendApiError, GUEST_TOKEN_KEY } from '../api/backend/client'
import type { BackendClient } from '../api/backend/client'
import { createBackendChat } from '../api/backend/chats'
import type { BackendCreateChatRequest } from '../api/backend/contracts'
import { BACKEND_POLL_MS, readBackendTransition } from '../api/backend/lockState'
import { validateBackendThought } from '../api/backend/validation'
import { backendAnalysisApi, canRetryAnalysis, canStartBasic, pollBackendAnalysis } from '../api/backend/analysis'
import type { BackendAnalysisJob, BackendAnalysisProgress, BackendAnalysisResult } from '../api/backend/analysis'
import { backendWorkspaceApi } from '../api/backend/workspaceApi'
import type { BackendChatDetail } from '../api/backend/workspaceApi'
import { validateQuestion } from '../api/chatValidation'
import type { ThoughtDraft } from '../api/thoughtDraft'
import { defaultQuestionType } from '../data/questionTypes'
import { notifyRedaction } from '../security/redactionNotice'
import { redactValue } from '../security/redaction'
import { readSession, workspaceKey, writeSession } from '../storage/session'
import { questionTypes } from '../types/chat'
import type { QuestionDraft } from '../types/chat'

const key = 'deveil:api:railway-workspace:v1'
const emptyDraft = (): QuestionDraft => ({ question: '', code: '', type: defaultQuestionType })
type Saved = {
  draft: QuestionDraft
  owner?: string
  chatId?: number
  request?: BackendCreateChatRequest
  thought?: ThoughtDraft
}
type Action =
  | { kind: 'restore' | 'refresh' | 'retryPrepare' }
  | { kind: 'basic' }
  | { kind: 'retryAnalysis'; job: BackendAnalysisJob }
  | { kind: 'open'; chatId: number; guest: string }
  | { kind: 'create'; request: BackendCreateChatRequest }
  | { kind: 'hint'; level: 1 | 2 }
  | { kind: 'thought'; draft: ThoughtDraft }

function readWorkspace(): Saved {
  const saved = readSession(key) as Partial<Saved> | null
  const draft = saved?.draft
  if (!draft || typeof draft.question !== 'string' || typeof draft.code !== 'string' || !questionTypes.includes(draft.type)) {
    return { draft: emptyDraft() }
  }
  if (typeof saved.owner === 'string' && /^[a-f0-9]{64}$/u.test(saved.owner)) {
    if (typeof saved.chatId === 'number' && Number.isSafeInteger(saved.chatId) && saved.chatId > 0) {
      return { draft, owner: saved.owner, chatId: saved.chatId, thought: saved.thought }
    }
    if (saved.request) return { draft, owner: saved.owner, request: saved.request }
  }
  return { draft }
}

async function guestFingerprint(token: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')
}

function waitForPoll(signal: AbortSignal) {
  signal.throwIfAborted()
  return new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason) }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort)
      resolve()
    }, BACKEND_POLL_MS)
    signal.addEventListener('abort', abort, { once: true })
  })
}

const messages: Record<string, string> = {
  INVALID_TOKEN: '게스트 세션이 만료됐어요. 새 채팅에서 다시 시작해 주세요.',
  GUEST_CHANGED: '게스트 세션이 바뀌었어요. 새 채팅에서 다시 시작해 주세요.',
  CHAT_NOT_FOUND: '현재 게스트 세션에서 이 대화를 열 수 없어요.',
  INVALID_INPUT: '입력한 내용과 글자 수를 확인해 주세요.',
  PREPARE_NOT_FAILED: '질문 준비 상태를 다시 확인해 주세요.',
  ALREADY_SUBMITTED: '이미 제출한 생각이 있어요. 대화 상태를 확인해 주세요.',
  ANALYSIS_NOT_FOUND: '서버에서 분석 작업을 찾지 못했어요 (404). 상태를 다시 확인해 주세요.',
  NOT_RETRYABLE: '현재 분석 상태에서는 재시도할 수 없어요. 상태를 다시 확인해 주세요.',
  RETRY_LIMIT_EXCEEDED: '분석 재시도 횟수를 모두 사용했어요.',
  BASIC_MODE_NOT_ALLOWED: '힌트 두 단계를 모두 확인해야 기초 학습을 시작할 수 있어요.',
  API_NOT_FOUND: '현재 서버에서 이 API를 찾지 못했어요 (404).',
}
function safeInput<T>(value: T): T {
  const safe = redactValue(value)
  if (safe.redacted) notifyRedaction()
  return safe.value
}

export function useRailwayWorkspace(client: BackendClient) {
  const [saved, setSaved] = useState(readWorkspace)
  const workspace = useRef(saved)
  const active = useRef<AbortController | null>(null)
  const openingChat = useRef<number | null>(null)
  const [detail, setDetail] = useState<BackendChatDetail | null>(null)
  const [analysis, setAnalysis] = useState<BackendAnalysisProgress | null>(null)
  const [result, setResult] = useState<BackendAnalysisResult | null>(null)
  const [busy, setBusy] = useState<Action['kind'] | null>(() => saved.chatId || saved.request ? 'restore' : null)
  const [error, setError] = useState('')
  const [requestId, setRequestId] = useState<string | null>(null)
  const [detached, setDetached] = useState(false)
  const [needsSync, setNeedsSync] = useState(false)

  const persist = useCallback((next: Saved) => {
    workspace.current = next
    setSaved(next)
    writeSession(key, next)
  }, [])

  const run = useCallback(async (action: Action) => {
    if (active.current) return
    const controller = new AbortController()
    active.current = controller
    openingChat.current = action.kind === 'open' ? action.chatId : null
    const signal = controller.signal
    setBusy(action.kind)
    setResult(null)
    if (action.kind !== 'retryAnalysis') setAnalysis(null)
    setError('')
    setRequestId(null)
    let saved = workspace.current
    try {
      const guest = action.kind === 'open' ? action.guest : await client.ensureSession(AbortSignal.any([signal, AbortSignal.timeout(12000)]))
      if (!client.isGuest(guest)) throw new BackendApiError(401, { code: 'GUEST_CHANGED' })
      const owner = await guestFingerprint(guest)
      signal.throwIfAborted()
      if (action.kind === 'open') {
        if (!client.isGuest(guest)) throw new BackendApiError(401, { code: 'GUEST_CHANGED' })
        saved = { draft: emptyDraft(), chatId: action.chatId, owner }
        persist(saved)
      }
      if (saved.owner && saved.owner !== owner) throw new BackendApiError(401, { code: 'GUEST_CHANGED' })
      const api = () => backendWorkspaceApi(client, guest, AbortSignal.any([signal, AbortSignal.timeout(12000)]))
      const request = action.kind === 'create' ? action.request : saved.request
      if (request && !saved.chatId) {
        saved = { ...saved, owner, request }
        persist(saved)
        const receipt = await createBackendChat(client, request, AbortSignal.any([signal, AbortSignal.timeout(12000)]), guest)
        signal.throwIfAborted()
        saved = { draft: saved.draft, owner, chatId: receipt.chatId }
        persist(saved)
        if (receipt.secretMasked) notifyRedaction()
      }
      const id = saved.chatId
      if (!id) return
      const analysisApi = () => backendAnalysisApi(client, guest, AbortSignal.any([signal, AbortSignal.timeout(12000)]))
      let expectedJob: number | undefined
      if (action.kind === 'basic') expectedJob = await analysisApi().startBasic(id)
      if (action.kind === 'retryAnalysis') expectedJob = await analysisApi().retry(id, action.job)
      if (action.kind === 'retryPrepare') await api().retryPrepare(id)
      if (action.kind === 'hint') await api().hint(id, action.level)
      if (action.kind === 'thought') {
        expectedJob = await api().submitThought(id, { content: action.draft.text.trim(), selectedChoice: action.draft.choiceIndex })
      }
      let previous: BackendChatDetail | null = null
      for (;;) {
        const next = await api().detail(id)
        signal.throwIfAborted()
        if (previous) readBackendTransition(previous, next)
        previous = next
        setDetail(next)
        setNeedsSync(false)
        if (next.secretMasked) notifyRedaction()
        if (next.prepareStatus !== 'PREPARING') {
          if (expectedJob !== undefined && next.analysis?.jobId !== expectedJob) throw new Error('Analysis job not reflected in chat detail')
          const synced = await pollBackendAnalysis({
            detail: next, get: () => analysisApi().get(id), refreshDetail: () => api().detail(id),
            signal, wait: waitForPoll, onProgress: setAnalysis,
          })
          signal.throwIfAborted()
          if (synced.detail !== next) setDetail(synced.detail)
          setResult(synced.result)
          break
        }
        await waitForPoll(signal)
      }
    } catch (cause) {
      if (signal.aborted) return
      const backend = cause instanceof BackendApiError ? cause : null
      const code = backend?.code ?? 'CONNECTION'
      setError(Object.hasOwn(messages, code) ? messages[code] : backend?.status === 404 ? '서버에서 요청한 데이터를 찾지 못했어요 (404).' : '서버 응답을 확인하지 못했어요. 다시 시도해 주세요.')
      setRequestId(backend?.requestId ?? null)
      if (['INVALID_TOKEN', 'GUEST_CHANGED', 'CHAT_NOT_FOUND'].includes(code)) {
        setDetail(null)
        setAnalysis(null)
        setResult(null)
        setDetached(true)
      } else if (saved.chatId) {
        setNeedsSync(code !== 'INVALID_INPUT')
      } else if (code === 'INVALID_INPUT') {
        persist({ draft: saved.draft })
      }
    } finally {
      if (active.current === controller) {
        active.current = null
        openingChat.current = null
        setBusy(null)
      }
    }
  }, [client, persist])

  useEffect(() => {
    const lifecycle = new AbortController()
    queueMicrotask(() => { if (!lifecycle.signal.aborted) void run({ kind: 'restore' }) })
    const detach = () => {
      if (!workspace.current.owner) return
      active.current?.abort()
      setDetail(null)
      setAnalysis(null)
      setResult(null)
      setBusy(null)
      setDetached(true)
      setError(messages.GUEST_CHANGED)
    }
    const guestChanged = (event: StorageEvent) => {
      if (event.storageArea === localStorage && (event.key === GUEST_TOKEN_KEY || event.key === null)) detach()
    }
    const unsubscribe = client.subscribeGuestInvalidation(detach)
    window.addEventListener('storage', guestChanged)
    return () => {
      lifecycle.abort()
      active.current?.abort()
      active.current = null
      unsubscribe()
      window.removeEventListener('storage', guestChanged)
    }
  }, [client, run])

  function updateDraft(draft: QuestionDraft) {
    if (active.current || workspace.current.chatId || detached) return
    persist({ draft })
    setError('')
  }
  function submit(draft: QuestionDraft, exampleId: BackendCreateChatRequest['exampleId'] = null) {
    if (active.current || workspace.current.chatId || detached) return
    const safe = safeInput(draft)
    const invalid = validateQuestion(draft) ?? validateQuestion(safe)
    if (invalid || safe.type === 'FREE') {
      setError(invalid ?? '질문 유형을 선택해 주세요.')
      return
    }
    const previous = workspace.current.request
    if (previous && previous.question === safe.question.trim() && previous.code === (safe.code || null) &&
        previous.type === safe.type && previous.exampleId === exampleId) {
      void run({ kind: 'refresh' })
      return
    }
    persist({ draft: safe })
    void run({ kind: 'create', request: {
      clientRequestId: crypto.randomUUID(), question: safe.question.trim(), code: safe.code || null, type: safe.type, exampleId,
    } })
  }
  function reset(clearData = false) {
    active.current?.abort()
    active.current = null
    openingChat.current = null
    const current = workspace.current
    // An unsent question remains editable after guest renewal. Server chats stay owner-bound.
    persist({ draft: !clearData && detached && !current.chatId ? current.draft : emptyDraft() })
    if (clearData) {
      writeSession(key, null)
      writeSession(workspaceKey(false), null)
    }
    setBusy(null)
    setDetail(null)
    setAnalysis(null)
    setResult(null)
    setDetached(false)
    setNeedsSync(false)
    setError('')
    setRequestId(null)
  }
  function openChat(chatId: number, guest: string) {
    reset()
    void run({ kind: 'open', chatId, guest })
  }
  function removeDeleted(chatId?: number) {
    if (chatId === undefined || workspace.current.chatId === chatId || openingChat.current === chatId) reset(true)
  }
  function updateThought(thought: ThoughtDraft) {
    if (active.current || !detail || detail.status !== 'LOCKED' || detail.analysis || detail.thought || detached || needsSync) return
    persist({ ...workspace.current, thought })
  }
  function submitThought(thought: ThoughtDraft) {
    if (active.current || !detail || detail.status !== 'LOCKED' || detail.analysis || detail.thought || detached || needsSync) return
    const safe = safeInput(thought)
    if (!validateBackendThought(safe.text)) {
      setError('생각을 30~2,000자로 적어 주세요. 공백을 빼고 서로 다른 문자가 8개 이상 필요해요.')
      return
    }
    void run({ kind: 'thought', draft: safe })
  }

  return {
    saved, detail, analysis, result, busy, error, requestId, detached, needsSync, updateDraft, submit, reset, openChat, removeDeleted,
    updateThought, submitThought,
    retry: () => void run({ kind: detail?.prepareStatus === 'FAILED' && !needsSync ? 'retryPrepare' : 'refresh' }),
    startBasic: () => {
      if (detail && !needsSync && !detached && canStartBasic(detail)) void run({ kind: 'basic' })
    },
    retryAnalysis: () => {
      if (analysis && !needsSync && !detached && canRetryAnalysis(analysis)) void run({ kind: 'retryAnalysis', job: analysis })
    },
    openHint: (level: 1 | 2) => {
      if (!needsSync && !detached && detail?.status === 'LOCKED' && !detail.analysis && !detail.thought && detail.hasNextHint && detail.hintLevel + 1 === level) void run({ kind: 'hint', level })
    },
  }
}
