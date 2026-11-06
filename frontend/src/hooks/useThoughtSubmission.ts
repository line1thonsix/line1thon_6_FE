import { useEffect, useRef, useState } from 'react'
import { submitMockThought, ThoughtSubmissionError } from '../api/thoughts'
import { appendThought, thoughtMetrics, validateThought } from '../api/thoughtValidation'
import type { MockSubmitThoughtRequest } from '../api/mockChatContract'
import type { PendingThought, ThoughtPhase } from '../types/thought'

export function useThoughtSubmission(chatId: string) {
  const [draft, setDraft] = useState('')
  const [phase, setPhase] = useState<ThoughtPhase>('writing')
  const [feedback, setFeedback] = useState('')
  const [receipt, setReceipt] = useState<PendingThought | null>(null)
  const active = useRef<AbortController | null>(null)
  const submitted = useRef<MockSubmitThoughtRequest | null>(null)
  const latestDraft = useRef('')
  useEffect(() => () => { const controller = active.current; active.current = null; controller?.abort() }, [])

  function change(next: string) {
    if (submitted.current) return
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
      if (active.current === controller) { setReceipt(saved); setPhase('pending') }
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
    if (submitted.current || active.current) return
    const text = latestDraft.current
    const error = validateThought(text)
    setFeedback(error ?? '')
    if (error) return
    const request = { thought: text.trim(), clientRequestId: crypto.randomUUID() }
    submitted.current = request
    void run(request)
  }
  return { draft, phase, feedback, receipt, change, check, submit,
    insert: (text: string) => change(appendThought(latestDraft.current, text)),
    retry: () => { if (phase === 'failed' && submitted.current) void run(submitted.current) },
  }
}
