import { redactSecrets } from '../security/redaction.ts'
import { notifyRedaction } from '../security/redactionNotice.ts'
import { readSession, writeSession } from './session.ts'

export const noteKinds = ['reflection', 'feedback'] as const
export type NoteKind = typeof noteKinds[number]
export const noteConfig = {
  reflection: { label: '배운 점 한 줄 남기기', field: '배운 점', placeholder: '새롭게 알게 된 점이나 다음에 확인할 것을 한 줄로 남겨 주세요.', submit: '회고 저장', complete: '회고가 저장되었어요.', max: 200 },
  feedback: { label: '의견 남기기', field: '의견', placeholder: '어떤 판정이 아쉬웠는지, 이유와 함께 한 줄로 남겨 주세요.', submit: '의견 전송', complete: '의견이 전송되었어요.', max: 2000 },
} as const
export type DemoNotesState = { version: 1; active: NoteKind | null; drafts: Record<NoteKind, string>; saved: Record<NoteKind, string | null>; order: NoteKind[]; error: string }
export type DemoNotesStorage = { read: () => unknown; write: (state: DemoNotesState) => boolean }
export const demoNotesKey = (chatId: string) => `deveil:demo:post-result:v1:${chatId}`
const isKind = (value: unknown): value is NoteKind => value === 'reflection' || value === 'feedback'
const safeText = (value: unknown) => {
  if (typeof value !== 'string') return ''
  const safe = redactSecrets(value)
  if (safe.redacted) notifyRedaction()
  return safe.value
}
export function validateDemoNote(kind: NoteKind, text: string): string | null {
  if (!text.trim()) return `${noteConfig[kind].field}을 한 줄 적어 주세요.`
  if (text.trim().length > noteConfig[kind].max) return `${noteConfig[kind].field}은 ${noteConfig[kind].max.toLocaleString('ko-KR')}자까지 적을 수 있어요.`
  return null
}
export function readDemoNotes(raw: unknown): DemoNotesState {
  const initial: DemoNotesState = { version: 1, active: null, drafts: { reflection: '', feedback: '' }, saved: { reflection: null, feedback: null }, order: [], error: '' }
  if (!raw || typeof raw !== 'object') return initial
  const v = raw as Partial<DemoNotesState>
  if (v.version !== 1) return initial
  initial.active = isKind(v.active) ? v.active : null
  for (const kind of noteKinds) {
    initial.drafts[kind] = safeText(v.drafts?.[kind])
    const text = safeText(v.saved?.[kind]).trim()
    initial.saved[kind] = text && !validateDemoNote(kind, text) ? text : null
  }
  initial.order = [...new Set((Array.isArray(v.order) ? v.order : []).filter((kind): kind is NoteKind => isKind(kind) && !!initial.saved[kind]))]
  for (const kind of noteKinds) if (initial.saved[kind] && !initial.order.includes(kind)) initial.order.push(kind)
  return initial
}
// Frontend-only demo controller. No API client, MSW mutation, or network request.
export function createDemoNotes(chatId: string, allowFeedback = true, storage: DemoNotesStorage = {
  read: () => readSession(demoNotesKey(chatId)), write: state => writeSession(demoNotesKey(chatId), state),
}) {
  let state = readDemoNotes(storage.read())
  if (!allowFeedback && state.active === 'feedback') state.active = null
  const listeners = new Set<() => void>()
  const publish = (next: DemoNotesState) => { state = next; listeners.forEach(listener => listener()) }
  function persist(next: DemoNotesState, saving = false) {
    if (!storage.write(next)) {
      publish({ ...(saving ? state : next), error: '브라우저에 저장하지 못했어요. 작성한 내용은 그대로 있어요. 다시 시도해 주세요.' })
      return false
    }
    publish(next); return true
  }
  return {
    getState: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    open(kind: NoteKind) {
      if (!allowFeedback && kind === 'feedback') return
      persist({ ...state, active: state.active === kind ? null : kind, error: '' })
    },
    change(text: string) {
      if (!state.active) return
      const kind = state.active
      const safe = safeText(text)
      persist({ ...state, drafts: { ...state.drafts, [kind]: safe }, error: state.error ? validateDemoNote(kind, safe) ?? '' : '' })
    },
    submit() {
      const kind = state.active
      if (!kind || (!allowFeedback && kind === 'feedback')) return false
      const text = safeText(state.drafts[kind]).trim()
      const error = validateDemoNote(kind, text)
      if (error) { publish({ ...state, error }); return false }
      return persist({ ...state, active: null, drafts: { ...state.drafts, [kind]: text }, saved: { ...state.saved, [kind]: text }, order: [...state.order.filter(item => item !== kind), kind], error: '' }, true)
    },
  }
}
