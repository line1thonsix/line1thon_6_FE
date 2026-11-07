export const findingCategories = ['COMMON', 'COMPLEMENT', 'UNIQUE', 'CONFLICT', 'UNDETERMINED'] as const
export type FindingCategory = typeof findingCategories[number]
type FindingBase = { id: string; title: string; reason: string; verification: string; verificationCode?: string }
export type Finding = FindingBase & (
  { category: 'COMMON'; userQuote: string; aiPerspective: string } |
  { category: 'COMPLEMENT'; aiPerspective: string; conditions: string; userQuote?: string } |
  { category: 'UNIQUE'; userQuote: string } |
  { category: 'CONFLICT'; userQuote: string; aiPerspective: string; conflictEvidence: string } |
  { category: 'UNDETERMINED'; question: string; userQuote?: string }
)
export type ComparisonResult = {
  chatId: string; jobId: string; resultId: string; status: 'DONE'; learningPath: 'SELF'
  responseSource?: 'SAVED_EXAMPLE'
  thought: string; referenceAnswer: string; findings: Finding[]
}
export type FindingFilter = 'ALL' | FindingCategory
