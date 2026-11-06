// Frontend view models, independent of the eventual backend DTO.
export const questionTypes = ['FREE', 'CONCEPT', 'DEBUGGING', 'PROBLEM_SOLVING', 'DESIGN'] as const
export type QuestionType = typeof questionTypes[number]
export type QuestionDraft = { question: string; code: string; type: QuestionType }
export type LockedChat = QuestionDraft & {
  id: string
  status: 'LOCKED'
  choices: [string, string, string]
  exampleSentence: string
}
