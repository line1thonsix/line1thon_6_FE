export const stuckPoints = ['CONCEPT', 'FLOW', 'VERIFICATION'] as const
export type StuckPoint = typeof stuckPoints[number]
export type HintLevel = 0 | 1 | 2
export type HintState = { chatId: string; level: HintLevel; stuckPoint: StuckPoint | null; hints: { level: 1 | 2; text: string }[] }
