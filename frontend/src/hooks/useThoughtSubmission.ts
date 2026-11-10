import { redactSecrets } from '../security/redaction'
import { notifyRedaction } from '../security/redactionNotice'
import { useEffect, useRef, useState } from 'react'
import { readSession, writeSession, thoughtKey } from '../storage/session'
import { submitMockThought, ThoughtSubmissionError } from '../api/thoughts'
import { appendThought, thoughtMetrics, validateThought } from '../api/thoughtValidation'
import type { MockSubmitThoughtRequest } from '../api/mockChatContract'
import { editThoughtDraft, manualThought, readThoughtDraft, thoughtSubmission, toggleChoice } from '../api/thoughtDraft'
import type { ThoughtDraft, ThoughtEdit } from '../api/thoughtDraft'
import type { LockedChat } from '../types/chat'
import type { PendingThought, ThoughtPhase } from '../types/thought'

export function useThoughtSubmission(chat: LockedChat, restoredReceipt: PendingThought | null = null, cancellationDraft?: ThoughtDraft) {
  const chatId = chat.id
  const [initialDraft] = useState(() => {
    const saved = readThoughtDraft(readSession(thoughtKey(chatId)) ?? cancellationDraft, chat)
    return restoredReceipt && saved.text.trim() !== restoredReceipt.thought ? readThoughtDraft(restoredReceipt.thought, chat) : saved
  })
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
    if (feedback || thoughtMetrics(next.text).length > 2000) setFeedback(validateThought(next.text, manualThought(next)) ?? '')
  }
  function change(text: string, edit?: ThoughtEdit) { update(editThoughtDraft(latestDraft.current, text, edit)) }
  function restoreEditor(next: ThoughtDraft) {
    const current = latestDraft.current
    const protectedText = (draft: ThoughtDraft) => draft.text.split('').filter((_, i) => draft.owned[i]).join('')
    if (next.choiceIndex === current.choiceIndex && protectedText(next) === protectedText(current)) update(next)
  }
  function selectChoice(index: number) { update(toggleChoice(latestDraft.current, chat, index)) }
  function check() {
    if (!submitted.current && latestDraft.current.text) setFeedback(validateThought(latestDraft.current.text, manualThought(latestDraft.current)) ?? '')
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
    if (receipt || submitted.current || active.current) return
    const original = latestDraft.current
    // Redact each editable range without ever transforming the protected choice.
    let next = original
    let cursor = original.text.length
    while (cursor > 0) {
      if (original.owned[cursor - 1]) { cursor--; continue }
      const end = cursor
      while (cursor > 0 && !original.owned[cursor - 1]) cursor--
      const safe = redactSecrets(original.text.slice(cursor, end))
      if (safe.redacted) {
        notifyRedaction()
        next = editThoughtDraft(next, next.text.slice(0, cursor) + safe.value + next.text.slice(end), { before: next.text, start: cursor, end })
      }
    }
    if (next !== original) { latestDraft.current = next; setDraftState(next); writeSession(thoughtKey(chatId), next) }
    const text = next.text
    const error = thoughtMetrics(original.text).length > 2000 ? validateThought(original.text, manualThought(original)) : validateThought(text, manualThought(next))
    setFeedback(error ?? '')
    if (error) return
    const request = { ...thoughtSubmission(next), clientRequestId: crypto.randomUUID() }
    submitted.current = request
    void run(request)
  }
  return { canStartBasic: () => !receipt && !submitted.current && !active.current, draft, phase, feedback, receipt, change, check, submit,
    getDraft: () => latestDraft.current, restoreEditor, manual: manualThought(draftState),
    selectedChoice: draftState.choiceIndex, selectChoice,
    insert: (text: string) => change(appendThought(latestDraft.current.text, text)),
    retry: () => { if (phase === 'failed' && submitted.current) void run(submitted.current) },
  }
}
