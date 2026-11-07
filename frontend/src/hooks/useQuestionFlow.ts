import { useEffect, useRef, useState } from 'react'
import { restoreMockChat } from '../api/restoreChat'
import { readSession, writeSession, workspaceKey } from '../storage/session'
import type { PendingThought } from '../types/thought'
import { createMockChat } from '../api/chats'
import { validateQuestion } from '../api/chatValidation'
import type { MockCreateChatRequest } from '../api/mockChatContract'
import type { QuestionDraft, LockedChat } from '../types/chat'

type Flow = { stage: 'editing' } | { stage: 'creating'; request: MockCreateChatRequest } |
  { stage: 'error'; request: MockCreateChatRequest; message: string } | { stage: 'locked'; chat: LockedChat; receipt?: PendingThought | null } | { stage: 'restoring' } | { stage: 'restore-error'; message: string }
const emptyDraft = (): QuestionDraft => ({ question: '', code: '', type: 'FREE' })

const key = workspaceKey(import.meta.env.DEV && import.meta.env.VITE_ENABLE_MOCKS === 'true')
function savedWorkspace(): { draft: QuestionDraft; chatId?: string; request?: MockCreateChatRequest } {
  const raw = readSession(key) as Record<string, unknown> | null
  if (!raw || typeof raw !== 'object') return { draft: emptyDraft() }
  const d = raw.draft as QuestionDraft | undefined
  if (!d || typeof d.question !== 'string' || typeof d.code !== 'string' || !['FREE', 'CONCEPT', 'DEBUGGING', 'PROBLEM_SOLVING', 'DESIGN'].includes(d.type)) return { draft: emptyDraft() }
  const draft = { question: d.question, code: d.code, type: d.type }
  const request = raw.request as MockCreateChatRequest | undefined
  return { draft, ...(typeof raw.chatId === 'string' && raw.chatId ? { chatId: raw.chatId } : {}),
    ...(request && typeof request.clientRequestId === 'string' ? { request: { ...draft, clientRequestId: request.clientRequestId } } : {}) }
}
export function useQuestionFlow() {
  const [initial] = useState(savedWorkspace)
  const [draft, setDraft] = useState<QuestionDraft>(initial.draft)
  const [flow, setFlow] = useState<Flow>(initial.chatId || initial.request ? { stage: 'restoring' } : { stage: 'editing' })
  const [validation, setValidation] = useState('')
  const active = useRef<AbortController | null>(null)
  const submitted = useRef(!!(initial.chatId || initial.request))
  const timeoutMs = 15000
  useEffect(() => () => { const controller = active.current; active.current = null; controller?.abort() }, [])

  async function restore(id: string) {
    if (active.current) return
    const controller = new AbortController()
    active.current = controller
    setFlow({ stage: 'restoring' })
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const restored = await restoreMockChat(id, controller.signal)
      if (active.current !== controller) return
      setDraft(restored.chat)
      writeSession(key, { draft: { question: restored.chat.question, code: restored.chat.code, type: restored.chat.type }, chatId: id })
      setFlow({ stage: 'locked', ...restored })
    } catch (error) {
      if (active.current === controller) setFlow({ stage: 'restore-error', message: error instanceof Error ? error.message : '대화를 복원하지 못했어요.' })
    } finally { clearTimeout(timeout); if (active.current === controller) active.current = null }
  }


  async function run(request: MockCreateChatRequest) {
    if (active.current) return
    const controller = new AbortController()
    active.current = controller
    setFlow({ stage: 'creating', request })
    const timeout = setTimeout(() => controller.abort('timeout'), timeoutMs)
    try {
      const chat = await createMockChat(request, controller.signal)
      if (active.current === controller) { writeSession(key, { draft: request, chatId: chat.id }); setFlow({ stage: 'locked', chat }) }
    } catch (error: unknown) {
      if (active.current === controller) setFlow({
        stage: 'error', request,
        message: controller.signal.aborted ? '연결이 지연되고 있어요. 질문과 코드는 그대로 있어요.' :
          error instanceof Error ? error.message : '연결을 확인하고 다시 시도해 주세요.',
      })
    } finally {
      clearTimeout(timeout)
      if (active.current === controller) active.current = null
    }
  }
  useEffect(() => {
    // Start network reconciliation after mount; StrictMode cleanup cancels stale work.
    const lifecycle = new AbortController()
    queueMicrotask(() => {
      if (lifecycle.signal.aborted) return
      if (initial.chatId) void restore(initial.chatId)
      else if (initial.request) void run(initial.request)
    })
    return () => lifecycle.abort()
  }, [initial])
  function submit(value: QuestionDraft = draft) {
    if (submitted.current) return
    const error = validateQuestion(value)
    setValidation(error ?? '')
    if (error) return
    submitted.current = true
    setDraft(value)
    const request = { ...value, clientRequestId: crypto.randomUUID() }
    writeSession(key, { draft: value, request })
    void run(request)
  }
  function reset() {
    const controller = active.current
    active.current = null
    controller?.abort()
    submitted.current = false
    writeSession(key, null)
    setDraft(emptyDraft())
    setValidation('')
    setFlow({ stage: 'editing' })
  }
  return { draft, flow, validation, submit, reset,
    updateDraft: (next: QuestionDraft) => { if (!submitted.current) { writeSession(key, { draft: next }); setDraft(next); setValidation('') } },
    retry: () => { if (flow.stage === 'error') void run(flow.request); else if (flow.stage === 'restore-error' && initial.chatId) void restore(initial.chatId) },
  }
}
