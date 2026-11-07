import { useEffect, useRef, useState } from 'react'
import { readSession, writeSession, thoughtKey } from '../storage/session'
import { submitMockThought, ThoughtSubmissionError } from '../api/thoughts'
import { appendThought, thoughtMetrics, validateThought } from '../api/thoughtValidation'
import type { MockSubmitThoughtRequest } from '../api/mockChatContract'
import type { PendingThought, ThoughtPhase } from '../types/thought'

export function useThoughtSubmission(chatId: string, restoredReceipt: PendingThought | null = null) {
  const [initialDraft] = useState(() => { const saved = readSession(thoughtKey(chatId)); return restoredReceipt?.thought ?? (typeof saved === 'string' ? saved : '') })
  const [draft, setDraft] = useState(initialDraft)
  const [phase, setPhase] = useState<ThoughtPhase>(restoredReceipt ? 'pending' : 'writing')
  const [feedback, setFeedback] = useState('')
  const [receipt, setReceipt] = useState<PendingThought | null>(restoredReceipt)
  const active = useRef<AbortController | null>(null)
  const submitted = useRef<MockSubmitThoughtRequest | null>(null)
  const latestDraft = useRef(initialDraft)
  useEffect(() => () => { const controller = active.current; active.current = null; controller?.abort() }, [])

  function change(next: string) {
    if (submitted.current || receipt) return
    writeSession(thoughtKey(chatId), next)
    latestDraft.current = next
    setDraft(next)
    if (feedback || thoughtMetrics(next).length > 2000) setFeedback(validateThought(next) ?? '')
  }
  function check() {
    if (!submitted.current && latestDraft.current) setFeedback(validateThought(latestDraft.current) ?? '')
  }
  async function run(request: MockSubmitThoughtRequest) {
    if (active.current) return
    const controller = new AbortController()
    active.current = controller
    setPhase('submitting')
    setFeedback('')
    const timeout = setTimeout(() => controller.abort(), 15000)
    try {
      const saved = await submitMockThought(chatId, request, controller.signal)
      if (active.current === controller) { writeSession(thoughtKey(chatId), null); setReceipt(saved); setPhase('pending') }
    } catch (error: unknown) {
      if (active.current !== controller) return
      if (error instanceof ThoughtSubmissionError && error.kind === 'validation') {
        submitted.current = null
        setPhase('writing')
      } else setPhase('failed')
      setFeedback(controller.signal.aborted ? '연결이 지연되고 있어요. 내 생각은 그대로 있어요.' :
        error instanceof ThoughtSubmissionError ? error.message : '연결이 지연되고 있어요. 내 생각은 그대로 있어요.')
    } finally {
      clearTimeout(timeout)
      if (active.current === controller) active.current = null
    }
  }
  function submit() {
    // Set ref before scheduling work to block clicks and Enter in the same render.
    if (receipt || submitted.current || active.current) return
    const text = latestDraft.current
    const error = validateThought(text)
    setFeedback(error ?? '')
    if (error) return
    const request = { thought: text.trim(), clientRequestId: crypto.randomUUID() }
    submitted.current = request
    void run(request)
  }
  return { canStartBasic: () => !receipt && !submitted.current && !active.current, draft, phase, feedback, receipt, change, check, submit,
    insert: (text: string) => change(appendThought(latestDraft.current, text)),
    retry: () => { if (phase === 'failed' && submitted.current) void run(submitted.current) },
  }
}
