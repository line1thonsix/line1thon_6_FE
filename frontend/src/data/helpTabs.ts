export const helpTabs = [
  { id: 'choices', label: '살펴볼 지점', description: '하나 고르고 이유를 이어 써요' },
  { id: 'hints', label: '힌트', description: '정답 없이 단서만 한 단계씩' },
] as const
export type HelpTab = typeof helpTabs[number]['id']
export function restoredHelpTab(value: unknown): HelpTab { return value === 'hints' ? 'hints' : 'choices' }
