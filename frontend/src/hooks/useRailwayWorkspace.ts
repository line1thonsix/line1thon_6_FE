import { useCallback, useEffect, useRef, useState } from 'react'
import { BackendApiError, GUEST_TOKEN_KEY } from '../api/backend/client'
import type { BackendClient } from '../api/backend/client'
import { createBackendChat } from '../api/backend/chats'
import type { BackendCreateChatRequest } from '../api/backend/contracts'
import { BACKEND_POLL_MS, readBackendTransition } from '../api/backend/lockState'
import { validateBackendThought } from '../api/backend/validation'
import { backendWorkspaceApi } from '../api/backend/workspaceApi'
import type { BackendChatDetail } from '../api/backend/workspaceApi'
import { validateQuestion } from '../api/chatValidation'
import type { ThoughtDraft } from '../api/thoughtDraft'
import { defaultQuestionType } from '../data/questionTypes'
import { notifyRedaction } from '../security/redactionNotice'
import { redactValue } from '../security/redaction'
import { readSession, writeSession } from '../storage/session'
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
  API_NOT_FOUND: '현재 서버에서 이 기능을 사용할 수 없어요.',
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
  const [detail, setDetail] = useState<BackendChatDetail | null>(null)
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
    const signal = controller.signal
    setBusy(action.kind)
    setError('')
    setRequestId(null)
    let saved = workspace.current
    try {
      const guest = await client.ensureSession(AbortSignal.any([signal, AbortSignal.timeout(12000)]))
      const owner = await guestFingerprint(guest)
      signal.throwIfAborted()
      if (saved.owner && saved.owner !== owner) throw new BackendApiError(401, { code: 'GUEST_CHANGED' })
      const api = () => backendWorkspaceApi(client, guest, AbortSignal.any([signal, AbortSignal.timeout(12000)]))
      const request = action.kind === 'create' ? action.request : saved.request
      if (request && !saved.chatId) {
        saved = { ...saved, owner, request }
        persist(saved)
        const receipt = await createBackendChat(client, request, AbortSignal.any([signal, AbortSignal.timeout(12000)]), guest)
        saved = { draft: saved.draft, owner, chatId: receipt.chatId }
        persist(saved)
        if (receipt.secretMasked) notifyRedaction()
      }
      const id = saved.chatId
      if (!id) return
      if (action.kind === 'retryPrepare') await api().retryPrepare(id)
      if (action.kind === 'hint') await api().hint(id, action.level)
      if (action.kind === 'thought') {
        await api().submitThought(id, { content: action.draft.text.trim(), selectedChoice: action.draft.choiceIndex })
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
        if (next.prepareStatus !== 'PREPARING' && next.analysis?.status !== 'PENDING') break
        await waitForPoll(signal)
      }
    } catch (cause) {
      if (signal.aborted) return
      const backend = cause instanceof BackendApiError ? cause : null
      const code = backend?.code ?? 'CONNECTION'
      setError(Object.hasOwn(messages, code) ? messages[code] : '서버 응답을 확인하지 못했어요. 다시 시도해 주세요.')
      setRequestId(backend?.requestId ?? null)
      if (['INVALID_TOKEN', 'GUEST_CHANGED', 'CHAT_NOT_FOUND'].includes(code)) {
        setDetail(null)
        setDetached(true)
      } else if (saved.chatId) {
        setNeedsSync(code !== 'INVALID_INPUT')
      } else if (code === 'INVALID_INPUT') {
        persist({ draft: saved.draft })
      }
    } finally {
      if (active.current === controller) {
        active.current = null
        setBusy(null)
      }
    }
  }, [client, persist])

  useEffect(() => {
    const lifecycle = new AbortController()
    queueMicrotask(() => { if (!lifecycle.signal.aborted) void run({ kind: 'restore' }) })
    const guestChanged = (event: StorageEvent) => {
      if ((event.key !== GUEST_TOKEN_KEY && event.key !== null) || (event.key !== null && event.oldValue === event.newValue) || !workspace.current.owner) return
      active.current?.abort()
      setDetail(null)
      setBusy(null)
      setDetached(true)
      setError(messages.GUEST_CHANGED)
    }
    window.addEventListener('storage', guestChanged)
    return () => {
      lifecycle.abort()
      active.current?.abort()
      active.current = null
      window.removeEventListener('storage', guestChanged)
    }
  }, [run])

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
  function reset() {
    active.current?.abort()
    active.current = null
    const current = workspace.current
    // An unsent question remains editable after guest renewal. Server chats stay owner-bound.
    persist({ draft: detached && !current.chatId ? current.draft : emptyDraft() })
    setBusy(null)
    setDetail(null)
    setDetached(false)
    setNeedsSync(false)
    setError('')
    setRequestId(null)
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
    saved, detail, busy, error, requestId, detached, needsSync, updateDraft, submit, reset,
    updateThought, submitThought,
    retry: () => void run({ kind: detail?.prepareStatus === 'FAILED' && !needsSync ? 'retryPrepare' : 'refresh' }),
    openHint: (level: 1 | 2) => {
      if (!needsSync && !detached && detail?.status === 'LOCKED' && !detail.analysis && !detail.thought && detail.hasNextHint && detail.hintLevel + 1 === level) void run({ kind: 'hint', level })
    },
  }
}
