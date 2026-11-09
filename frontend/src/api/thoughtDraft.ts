import type { LockedChat } from '../types/chat.ts'
import { appendThought } from './thoughtValidation.ts'

// Only choice-owned characters are immutable. User text remains editable in the same textarea.
export type ThoughtDraft = { version: 3; text: string; choiceIndex: number | null; owned: boolean[] }
export type ThoughtEdit = { before: string; start: number; end: number }
type Preparation = Pick<LockedChat, 'choices' | 'exampleSentence'>
const validIndex = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= 0 && Number(value) < 3
const plainDraft = (text: string): ThoughtDraft => ({ version: 3, text, choiceIndex: null, owned: Array<boolean>(text.length).fill(false) })
export const choiceSentence = (chat: Preparation, index: number) => `${chat.choices[index]}부터 볼게요. 이유는 `

export function editThoughtDraft(draft: ThoughtDraft, text: string, edit?: ThoughtEdit): ThoughtDraft {
  // Input events replace a contiguous range. Inserted/edited characters belong to the user;
  // preserve ownership only in unchanged prefix/suffix ranges, including around the edit.
  let start = 0
  while (start < draft.text.length && start < text.length && draft.text[start] === text[start]) start++
  let end = draft.text.length
  let nextEnd = text.length
  while (end > start && nextEnd > start && draft.text[end - 1] === text[nextEnd - 1]) { end--; nextEnd-- }
  // Prefer the actual selection captured before input: a replacement can share a
  // suffix with the old phrase, but those retyped characters still belong to the user.
  if (edit?.before === draft.text && Number.isInteger(edit.start) && Number.isInteger(edit.end) &&
    edit.start >= 0 && edit.end >= edit.start && edit.end <= draft.text.length) {
    const insertedEnd = text.length - (draft.text.length - edit.end)
    if (insertedEnd >= edit.start && text.slice(0, edit.start) === draft.text.slice(0, edit.start) && text.slice(insertedEnd) === draft.text.slice(edit.end)) {
      start = edit.start; end = edit.end; nextEnd = insertedEnd
    }
  }
  if (!canEditThoughtRange(draft, start, end)) return draft
  const owned = [...draft.owned.slice(0, start), ...Array<boolean>(nextEnd - start).fill(false), ...draft.owned.slice(end)]
  return { version: 3, text, owned, choiceIndex: owned.some(Boolean) ? draft.choiceIndex : null }
}

export function toggleChoice(draft: ThoughtDraft, chat: Preparation, index: number): ThoughtDraft {
  if (!validIndex(index)) return draft
  const position = draft.owned.indexOf(true)
  const plain = draft.text.split('').filter((_, i) => !draft.owned[i]).join('')
  if (draft.choiceIndex === index) return plainDraft(plain)
  const at = position < 0 ? plain.length : position
  const before = plain.slice(0, at)
  const after = plain.slice(at)
  const inserted = `${before && !/\s$/u.test(before) ? ' ' : ''}${choiceSentence(chat, index)}`
  return { version: 3, text: before + inserted + after, choiceIndex: index,
    owned: [...Array<boolean>(before.length).fill(false), ...Array<boolean>(inserted.length).fill(true), ...Array<boolean>(after.length).fill(false)] }
}

export function readThoughtDraft(value: unknown, chat: Preparation): ThoughtDraft {
  if (typeof value === 'string') return plainDraft(value)
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>
    if (v.version === 3 && typeof v.text === 'string') {
      if (validIndex(v.choiceIndex) && Array.isArray(v.owned) && v.owned.length === v.text.length && v.owned.every(flag => typeof flag === 'boolean') && v.owned.some(Boolean)) {
        const draft: ThoughtDraft = { version: 3, text: v.text, choiceIndex: v.choiceIndex, owned: v.owned as boolean[] }
        const automatic = draft.text.split('').filter((_, i) => draft.owned[i]).join('')
        // Older editable drafts may contain fragments. Keep all user-owned text and
        // reinsert the canonical choice rather than freezing a corrupted sentence.
        if (automatic.trim() !== choiceSentence(chat, draft.choiceIndex!).trim() || !draft.owned.slice(draft.owned.indexOf(true), draft.owned.lastIndexOf(true) + 1).every(Boolean)) {
          return toggleChoice(toggleChoice(draft, chat, draft.choiceIndex!), chat, draft.choiceIndex!)
        }
        return draft
      }
      return plainDraft(v.text)
    }
    // Recover drafts saved by the recent split editor without losing their text.
    if (v.version === 2 && typeof v.manual === 'string') {
      const completion = v.completion as { kind?: unknown; index?: unknown } | null
      if (completion?.kind === 'choice' && validIndex(completion.index)) {
        const prefix = choiceSentence(chat, completion.index)
        const text = appendThought(prefix, v.manual)
        return { version: 3, text, choiceIndex: completion.index,
          owned: [...Array<boolean>(prefix.length).fill(true), ...Array<boolean>(text.length - prefix.length).fill(false)] }
      }
      if (completion?.kind === 'example') return plainDraft(appendThought(chat.exampleSentence, v.manual))
      return plainDraft(v.manual)
    }
  }
  return plainDraft('')
}

export function canEditThoughtRange(draft: ThoughtDraft, start: number, end: number): boolean {
  if (start < 0 || end < start || end > draft.text.length) return false
  if (start === end) return !(draft.owned[start - 1] && draft.owned[start])
  return !draft.owned.slice(start, end).some(Boolean)
}
export function manualThought(draft: ThoughtDraft): string {
  return draft.text.split('').filter((_, i) => !draft.owned[i]).join('')
}
export function thoughtSubmission(draft: ThoughtDraft) {
  const thought = draft.text.trim()
  if (draft.choiceIndex === null) return { thought }
  const offset = draft.text.length - draft.text.trimStart().length
  return { thought, suggestion: { index: draft.choiceIndex,
    start: Math.max(0, draft.owned.indexOf(true) - offset),
    end: Math.min(thought.length, draft.owned.lastIndexOf(true) + 1 - offset) } }
}
