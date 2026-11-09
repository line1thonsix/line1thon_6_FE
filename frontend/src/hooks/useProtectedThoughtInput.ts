import { useEffect, useLayoutEffect, useRef } from 'react'
import { attachThoughtProtection } from '../api/protectedThoughtInput'
import type { ThoughtDraft } from '../api/thoughtDraft'

export function useProtectedThoughtInput(enabled: boolean, getDraft?: () => ThoughtDraft, restore?: (draft: ThoughtDraft) => void) {
  const input = useRef<HTMLTextAreaElement>(null)
  const current = useRef({ enabled, getDraft, restore })
  useLayoutEffect(() => { current.current = { enabled, getDraft, restore } }, [enabled, getDraft, restore])
  useEffect(() => {
    const element = input.current
    if (!element) return
    return attachThoughtProtection(element, {
      enabled: () => current.current.enabled && !!current.current.getDraft && !!current.current.restore,
      getDraft: () => current.current.getDraft!(),
      restore: draft => current.current.restore!(draft),
    })
  }, [])
  return input
}
