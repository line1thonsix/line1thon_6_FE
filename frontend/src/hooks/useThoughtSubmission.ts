import { redactSecrets } from '../security/redaction'
import { notifyRedaction } from '../security/redactionNotice'
import { useEffect, useRef, useState } from 'react'
import { readSession, writeSession, thoughtKey } from '../storage/session'
import { submitMockThought, ThoughtSubmissionError } from '../api/thoughts'
import { appendThought, thoughtMetrics, validateThought } from '../api/thoughtValidation'
import type { MockSubmitThoughtRequest } from '../api/mockChatContract'
import { editThoughtDraft, readThoughtDraft, toggleChoice } from '../api/thoughtDraft'
import type { ThoughtDraft, ThoughtEdit } from '../api/thoughtDraft'
import type { LockedChat } from '../types/chat'
import type { PendingThought, ThoughtPhase } from '../types/thought'

export function useThoughtSubmission(chat: LockedChat, restoredReceipt: PendingThought | null = null) {
  const chatId = chat.id
  const [initialDraft] = useState(() => readThoughtDraft(restoredReceipt?.thought ?? readSession(thoughtKey(chatId)), chat))
  const [draftState, setDraftState] = useState(initialDraft)
  const draft = draftState.text
  const [phase, setPhase] = useState<ThoughtPhase>(restoredReceipt ? 'pending' : 'writing')
  const [feedback, setFeedback] = useState('')
  const [receipt, setReceipt] = useState<PendingThought | null>(restoredReceipt)
  const active = useRef<AbortController | null>(null)
  const submitted = useRef<MockSubmitThoughtRequest | null>(null)
  const latestDraft = useRef(initialDraft)
  useEffect(() => () => { const controller = active.current; active.current = null; controller?.abort() }, [])

  function update(next: ThoughtDraft) {
    if (submitted.current || receipt) return
    writeSession(thoughtKey(chatId), next)
    latestDraft.current = next
    setDraftState(next)
    if (feedback || thoughtMetrics(next.text).length > 2000) setFeedback(validateThought(next.text) ?? '')
  }
  function change(text: string, edit?: ThoughtEdit) { update(editThoughtDraft(latestDraft.current, text, edit)) }
  function selectChoice(index: number) { update(toggleChoice(latestDraft.current, chat, index)) }
  function check() {
    if (!submitted.current && latestDraft.current.text) setFeedback(validateThought(latestDraft.current.text) ?? '')
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
    const original = latestDraft.current.text
    const safe = redactSecrets(original)
    const text = safe.value
    if (safe.redacted) {
      notifyRedaction(); const next = editThoughtDraft(latestDraft.current, text); latestDraft.current = next; setDraftState(next); writeSession(thoughtKey(chatId), next)
    }
    const error = thoughtMetrics(original).length > 2000 ? validateThought(original) : validateThought(text)
    setFeedback(error ?? '')
    if (error) return
    const request = { thought: text.trim(), clientRequestId: crypto.randomUUID() }
    submitted.current = request
    void run(request)
  }
  return { canStartBasic: () => !receipt && !submitted.current && !active.current, draft, phase, feedback, receipt, change, check, submit,
    selectedChoice: draftState.choiceIndex, selectChoice,
    insert: (text: string) => change(appendThought(latestDraft.current.text, text)),
    retry: () => { if (phase === 'failed' && submitted.current) void run(submitted.current) },
  }
}
