// Confirmed Notion API vocabulary. Existing types/* remain Mock/UI view models.
export const backendQuestionTypes = ['CONCEPT', 'DEBUGGING', 'PROBLEM_SOLVING', 'DESIGN'] as const
export type BackendQuestionType = typeof backendQuestionTypes[number]
export type BackendChatStatus = 'LOCKED' | 'UNLOCKED_SELF' | 'UNLOCKED_ASSISTED'
export type PrepareStatus = 'PREPARING' | 'DONE' | 'FAILED'
export type AnalysisMode = 'COMPARE' | 'BASIC'
export type BackendAnalysisStatus = 'PENDING' | 'DONE' | 'FAILED'
export type BackendHistoryCategory = 'COMPARED' | 'BASIC' | null
export const exampleIds = ['EXAMPLE_DEBUGGING', 'EXAMPLE_CONCEPT', 'EXAMPLE_PROBLEM_SOLVING'] as const
export type BackendCreateChatRequest = {
  clientRequestId: string; type: BackendQuestionType; question: string; code: string | null;
  exampleId: typeof exampleIds[number] | null;
}
// Read from the actual question-creation page, not inferred from Mock UUID IDs.
export type BackendCreatedChat = {
  chatId: number; status: 'LOCKED'; type: BackendQuestionType; prepareStatus: PrepareStatus;
  secretMasked: boolean; createdAt: string;
}
export type BackendErrorBody = { code: string; message: string; requestId: string }
export const backendPaths = {
  sessions: '/sessions', chats: '/chats', sessionMe: '/sessions/me',
  chat: (id: number) => `/chats/${chatId(id)}`,
  prepareRetry: (id: number) => `/chats/${chatId(id)}/prepare/retry`,
  thoughts: (id: number) => `/chats/${chatId(id)}/thoughts`,
  analysis: (id: number) => `/chats/${chatId(id)}/analysis`,
  analysisRetry: (id: number) => `/chats/${chatId(id)}/analysis/retry`,
  hints: (id: number) => `/chats/${chatId(id)}/hints`,
  basicMode: (id: number) => `/chats/${chatId(id)}/basic-mode`,
  stuckPoint: (id: number) => `/chats/${chatId(id)}/stuck-point`,
} as const
function chatId(id: number): number {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid backend chat ID')
  return id
}
