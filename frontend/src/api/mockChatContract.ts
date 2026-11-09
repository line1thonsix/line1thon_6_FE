import type { QuestionDraft } from '../types/chat.ts'

// Temporary MSW-only contract. Does not establish the real server contract.
export const MOCK_CHATS_PATH = '/api/chats'
export type MockCreateChatRequest = QuestionDraft & { clientRequestId: string }

export type MockSubmitThoughtRequest = { thought: string; clientRequestId: string; suggestion?: { index: number; start: number; end: number } }
