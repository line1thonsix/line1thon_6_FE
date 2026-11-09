import { canEditThoughtRange, editThoughtDraft } from './thoughtDraft.ts'
import type { ThoughtDraft, ThoughtEdit } from './thoughtDraft.ts'

type Selection = { start: number; end: number }
type Snapshot = Selection & { draft: ThoughtDraft }
type Options = {
  enabled: () => boolean
  getDraft: () => ThoughtDraft
  restore: (draft: ThoughtDraft) => void
}

// Native beforeinput is used instead of React's emulated event so inputType,
// cancellation, IME and menu-based undo/redo all follow the same protection policy.
export function attachThoughtProtection(input: HTMLTextAreaElement, options: Options) {
  let last: ThoughtDraft | null = null
  let before: ThoughtEdit | undefined
  let composition: Snapshot | null = null
  let past: Snapshot[] = []
  let future: Snapshot[] = []
  const removers: (() => void)[] = []
  const selection = (): Selection => ({ start: input.selectionStart, end: input.selectionEnd })
  function current() {
    const draft = options.getDraft()
    if (last !== draft) {
      // Choice changes, restoration and example insertion form history boundaries.
      past = []; future = []; composition = null; before = undefined
      last = draft
    }
    return draft
  }
  function safeCaret(draft: ThoughtDraft, at: number) {
    let caret = Math.min(at, draft.text.length)
    while (draft.owned[caret]) caret++
    return caret
  }
  function sync(draft: ThoughtDraft, range: Selection = selection()) {
    input.value = draft.text
    input.setSelectionRange(Math.min(range.start, draft.text.length), Math.min(range.end, draft.text.length))
  }
  function record(snapshot: Snapshot) {
    past.push(snapshot)
    if (past.length > 100) past.shift()
    future = []
  }
  function history(redo: boolean) {
    const draft = current()
    const from = redo ? future : past
    const to = redo ? past : future
    const target = from.pop()
    if (!target) { sync(draft); return }
    to.push({ draft, ...selection() })
    options.restore(target.draft)
    last = options.getDraft()
    sync(last, target)
    before = undefined
  }
  function rangeFor(type: string, draft: ThoughtDraft): Selection {
    const range = selection()
    if (range.start !== range.end || !type.startsWith('delete')) return range
    if (type.includes('Backward')) {
      if (type.includes('Word')) range.start = draft.text.slice(0, range.start).search(/\S+\s*$/u)
      else if (type.includes('Line')) range.start = draft.text.lastIndexOf('\n', range.start - 1) + 1
      else range.start = Math.max(0, range.start - 1)
      if (range.start < 0) range.start = 0
    } else if (type.includes('Forward')) {
      if (type.includes('Word')) range.end += draft.text.slice(range.end).match(/^\s*\S+/u)?.[0].length ?? 0
      else if (type.includes('Line')) { const end = draft.text.indexOf('\n', range.end); range.end = end < 0 ? draft.text.length : end }
      else range.end = Math.min(draft.text.length, range.end + 1)
    } else if (type === 'deleteEntireSoftLine') {
      range.start = draft.text.lastIndexOf('\n', range.start - 1) + 1
      const end = draft.text.indexOf('\n', range.end); range.end = end < 0 ? draft.text.length : end + 1
    }
    return range
  }
  function listen(type: string, handler: (event: Event) => void) {
    input.addEventListener(type, handler)
    removers.push(() => input.removeEventListener(type, handler))
  }
  listen('beforeinput', event => {
    if (!options.enabled()) return
    const draft = current()
    const type = (event as InputEvent).inputType
    if (type === 'historyUndo' || type === 'historyRedo') {
      if (event.cancelable) { event.preventDefault(); history(type === 'historyRedo') }
      // Non-cancelable history is intercepted after the native input below.
      return
    }
    const range = rangeFor(type, draft)
    before = { before: draft.text, ...range }
    if (!canEditThoughtRange(draft, range.start, range.end) && event.cancelable) event.preventDefault()
  })
  listen('input', event => {
    if (!options.enabled()) return
    const draft = current()
    const type = (event as InputEvent).inputType
    if (type === 'historyUndo' || type === 'historyRedo') { sync(draft); history(type === 'historyRedo'); return }
    const range = selection()
    const next = editThoughtDraft(draft, input.value, before)
    const oldSelection = before ? { start: before.start, end: before.end } : range
    before = undefined
    if (next === draft) {
      // Some IME, spellcheck and autofill edits cannot be canceled beforehand.
      const caret = safeCaret(draft, range.start)
      sync(draft, { start: caret, end: caret })
      return
    }
    if (next.text !== draft.text && !composition) record({ draft, ...oldSelection })
    options.restore(next)
    last = options.getDraft()
    if (last.text !== input.value) sync(last, range)
  })
  listen('compositionstart', () => {
    if (!options.enabled()) return
    const draft = current()
    const range = selection()
    if (!canEditThoughtRange(draft, range.start, range.end)) {
      let end = draft.owned.lastIndexOf(true) + 1
      end = Math.max(end, range.end)
      input.setSelectionRange(end, end)
    }
    composition = { draft, ...selection() }
    before = undefined
  })
  listen('compositionend', () => {
    if (!options.enabled()) return
    const start = composition
    composition = null
    if (start && options.getDraft().text !== start.draft.text) record(start)
    before = undefined
  })
  listen('keydown', event => {
    if (!options.enabled()) return
    const key = event as KeyboardEvent
    if (key.isComposing || composition) {
      if (key.key === 'Enter') event.stopPropagation()
      return
    }
    if ((key.ctrlKey || key.metaKey) && !key.altKey && (key.key.toLowerCase() === 'z' || key.key.toLowerCase() === 'y')) {
      event.preventDefault(); history(key.key.toLowerCase() === 'y' || key.shiftKey)
    }
  })
  for (const type of ['paste', 'cut', 'dragstart']) listen(type, event => {
    if (!options.enabled()) return
    const draft = current()
    const range = selection()
    before = { before: draft.text, ...range }
    if (!canEditThoughtRange(draft, range.start, range.end)) event.preventDefault()
  })
  return () => removers.forEach(remove => remove())
}
