import type { HintState } from '../types/hints.ts'
export function readViewedHint(value: unknown): 1 | 2 | null { return value === 1 || value === 2 ? value : null }
export function displayedHint(state: HintState | null, viewed: 1 | 2 | null) {
  // A browser preference never reveals a hint missing from the server's opened list.
  return state?.hints.find(hint => hint.level === viewed) ?? state?.hints.at(-1)
}
