import { useEffect, useRef, useState } from 'react'
import { createMockChat } from '../api/chats'
import { validateQuestion } from '../api/chatValidation'
import type { MockCreateChatRequest } from '../api/mockChatContract'
import type { QuestionDraft, LockedChat } from '../types/chat'

type Flow = { stage: 'editing' } | { stage: 'creating'; request: MockCreateChatRequest } |
  { stage: 'error'; request: MockCreateChatRequest; message: string } | { stage: 'locked'; chat: LockedChat }
const emptyDraft = (): QuestionDraft => ({ question: '', code: '', type: 'FREE' })

export function useQuestionFlow() {
  const [draft, setDraft] = useState<QuestionDraft>(emptyDraft)
  const [flow, setFlow] = useState<Flow>({ stage: 'editing' })
  const [validation, setValidation] = useState('')
  const active = useRef<AbortController | null>(null)
  const submitted = useRef(false)
  const timeoutMs = 15000
  useEffect(() => () => active.current?.abort(), [])

  async function run(request: MockCreateChatRequest) {
    if (active.current) return
    const controller = new AbortController()
    active.current = controller
    setFlow({ stage: 'creating', request })
    const timeout = setTimeout(() => controller.abort('timeout'), timeoutMs)
    try {
      const chat = await createMockChat(request, controller.signal)
      if (active.current === controller) setFlow({ stage: 'locked', chat })
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
  function submit(value: QuestionDraft = draft) {
    if (submitted.current) return
    const error = validateQuestion(value)
    setValidation(error ?? '')
    if (error) return
    submitted.current = true
    setDraft(value)
    void run({ ...value, clientRequestId: crypto.randomUUID() })
  }
  function reset() {
    const controller = active.current
    active.current = null
    controller?.abort()
    submitted.current = false
    setDraft(emptyDraft())
    setValidation('')
    setFlow({ stage: 'editing' })
  }
  return { draft, flow, validation, submit, reset,
    updateDraft: (next: QuestionDraft) => { if (!submitted.current) { setDraft(next); setValidation('') } },
    retry: () => { if (flow.stage === 'error') void run(flow.request) },
  }
}
